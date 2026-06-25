// Static analyzer for Compact smart contracts.
// Deterministic checks for the highest-signal traps from the Midnight vulnerability
// taxonomy. Heuristic by design (no full parser yet) — every finding cites a line so
// a human can confirm. Phase 2 layers a Claude deep-review pass on top.

import type { Finding, Severity, Confidence } from "./types";

interface Ctx {
  filename: string;
  lines: string[];
}

let counter = 0;
function mk(
  ctx: Ctx,
  lineIdx: number,
  severity: Severity,
  title: string,
  description: string,
  taxonomyClass: string,
  recommendation: string,
  confidence: Confidence,
): Finding {
  const line = lineIdx + 1;
  const snippet = (ctx.lines[lineIdx] ?? "").trim();
  return {
    id: `compact-${++counter}`,
    domain: "CONTRACT",
    pillar: "SMART_LOGIC",
    title,
    description,
    severity,
    taxonomyClass,
    evidence: `${ctx.filename}:${line}  ${snippet}`,
    line,
    recommendation,
    confidence,
  };
}

// strip line comments, but not the // inside a URL scheme (https://...)
const stripComment = (l: string) => l.replace(/(^|[^:])\/\/.*$/, "$1");

export function analyzeCompact(source: string, filename = "contract.compact"): Finding[] {
  const lines = source.split(/\r?\n/);
  const ctx: Ctx = { filename, lines };
  const findings: Finding[] = [];

  // collect declared witnesses
  const witnessNames: string[] = [];
  lines.forEach((l) => {
    const m = stripComment(l).match(/\bwitness\s+([A-Za-z_]\w*)\s*\(/);
    if (m) witnessNames.push(m[1]);
  });

  const fullStripped = lines.map(stripComment).join("\n");

  lines.forEach((raw, i) => {
    const l = stripComment(raw);

    // 3.6 — ownPublicKey() used for authorization (the canonical Compact trap)
    if (/ownPublicKey\s*\(\s*\)/.test(l)) {
      const usedForAuth =
        /\bassert\s*\(/.test(l) || /[!=]=\s*ownPublicKey\s*\(/.test(l) || /ownPublicKey\s*\(\s*\)\s*[!=]=/.test(l);
      if (usedForAuth) {
        findings.push(
          mk(
            ctx,
            i,
            "CRITICAL",
            "ownPublicKey() used to authorize the caller",
            "ownPublicKey() is a witness (caller-supplied), not msg.sender. A malicious prover can return any value, so authorizing with it lets anyone impersonate the owner. The owner key is public on the ledger, making this trivially bypassable.",
            "3.6 (access control / ownPublicKey trap)",
            "Authorize by proving knowledge of a secret: store H(domain || secret) on the ledger and require the caller to supply the secret as a witness, re-deriving and comparing in-circuit. Never gate authorization on ownPublicKey().",
            "HIGH",
          ),
        );
      } else {
        findings.push(
          mk(
            ctx,
            i,
            "INFORMATIONAL",
            "ownPublicKey() used (verify it is not for authorization)",
            "ownPublicKey() is a witness. It is only safe to designate a destination, never to authorize the caller. Confirm this usage is a recipient/destination, not an access check.",
            "3.6 (access control / ownPublicKey trap)",
            "If this gates a privileged action, replace it with secret-knowledge auth (commitment + witness preimage).",
            "MEDIUM",
          ),
        );
      }
    }

    // 3.1/3.8 — disclosing a bare hash of (potentially low-entropy) witness data
    if (/disclose\s*\(\s*(persistentHash|transientHash)\s*</.test(l) || /disclose\s*\(\s*(persistentHash|transientHash)\s*\(/.test(l)) {
      findings.push(
        mk(
          ctx,
          i,
          "MEDIUM",
          "Disclosing a hash of witness data (brute-force risk)",
          "A hash is not hiding. If the hashed value has low entropy (e.g. a vote, a flag, a small id), an observer can hash every possible input and recover it. Declaring the disclosure does not make the value secret.",
          "3.1 (unintended disclosure)",
          "If the value must stay private, use a commitment with fresh secret randomness (persistentCommit(value, salt)) instead of a bare hash, and never reuse the salt.",
          "MEDIUM",
        ),
      );
    }

    // 3.8 — hash/commit without domain separation (no pad() prefix)
    if (/(persistentHash|transientHash|persistentCommit|transientCommit)\s*</.test(l) && !/pad\s*\(/.test(l)) {
      findings.push(
        mk(
          ctx,
          i,
          "LOW",
          "Hash/commitment without domain separation",
          "Hashes/commitments without a distinct domain prefix can collide across uses (e.g. a commitment reused as a nullifier). Different purposes should hash into different domains.",
          "3.8 (commitment soundness / domain separation)",
          "Prefix the hashed value with a unique domain tag, e.g. pad(32, \"mycontract:purpose:\").",
          "MEDIUM",
        ),
      );
    }

    // 3.1 — private data embedded in an assert/error message
    if (/\bassert\s*\(/.test(l) && /["'][^"']*["']\s*\+\+/.test(l)) {
      findings.push(
        mk(
          ctx,
          i,
          "LOW",
          "Possible private data in an assert message",
          "assert/error message strings are semi-public. Concatenating state or witness-derived values into the message can leak private information.",
          "3.1 (unintended disclosure)",
          "Keep assert messages generic; do not interpolate ledger/witness values.",
          "MEDIUM",
        ),
      );
    }

    // 3.7 — Field used with a relational operator (Field has no ordering; only == / !=)
    if (/\bas\s+Field\b/.test(l) && /(<=|>=|<|>)/.test(l.replace(/=>/g, ""))) {
      findings.push(
        mk(
          ctx,
          i,
          "LOW",
          "Relational comparison may involve a Field",
          "Field supports only == and != — relational operators (< <= > >=) require an unsigned integer type. A Field comparison here is likely a bug or a misuse.",
          "3.7 (arithmetic)",
          "Cast to a bounded Uint before comparing, and ensure the value range is intended.",
          "LOW",
        ),
      );
    }
  });

  // 3.2 — witnesses used without an obvious validating assert
  for (const w of witnessNames) {
    const called = new RegExp(`\\b${w}\\s*\\(`, "g");
    // count calls that are not the declaration
    const callLines = lines
      .map((l, i) => ({ l: stripComment(l), i }))
      .filter(({ l }) => called.test(l) && !/\bwitness\s+/.test(l));
    if (callLines.length === 0) continue;
    const validated = new RegExp(`assert\\s*\\([^)]*${w}\\s*\\(`).test(fullStripped);
    if (!validated) {
      const at = callLines[0].i;
      findings.push(
        mk(
          ctx,
          at,
          "MEDIUM",
          `Witness '${w}' used without an apparent validating assert`,
          `Witnesses are arbitrary DApp-supplied inputs — the prover controls their value. '${w}' is used but no assert constraining it was found. Unconstrained witnesses are the dominant Compact bug class (under-constraint).`,
          "3.2 (under-constraint / missing assertions)",
          `Constrain '${w}'s return before trusting it: bound its range, check membership, or re-derive its relationship to ledger state in-circuit.`,
          "LOW",
        ),
      );
    }
  }

  // pragma presence
  if (!/pragma\s+language_version/.test(fullStripped)) {
    findings.push({
      id: `compact-${++counter}`,
      domain: "CONTRACT",
      pillar: "SMART_LOGIC",
      title: "No `pragma language_version` declared",
      description:
        "Without a language-version pragma, the contract may compile against an unexpected Compact version with breaking semantic differences.",
      severity: "INFORMATIONAL",
      taxonomyClass: "hygiene",
      recommendation: "Add e.g. `pragma language_version >= 0.23;` at the top of the contract.",
      confidence: "HIGH",
    });
  }

  return findings;
}
