// Static analyzer for the dApp/SDK integration layer (TypeScript).
// Targets the privacy leaks and trust-boundary mistakes that live around a Compact
// contract: remote proving, secret logging, witness implementations that leak.

import type { Finding, Severity, Confidence } from "./types";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"];
const SECRET_WORDS = /(mnemonic|seed|secret|privateKey|signingKey|password|passphrase)/i;

let counter = 0;
function mk(
  filename: string,
  line: number,
  snippet: string,
  severity: Severity,
  title: string,
  description: string,
  taxonomyClass: string,
  recommendation: string,
  confidence: Confidence,
): Finding {
  return {
    id: `sdk-${++counter}`,
    domain: "SDK",
    pillar: "WEB3",
    title,
    description,
    severity,
    taxonomyClass,
    evidence: `${filename}:${line}  ${snippet.trim()}`,
    line,
    recommendation,
    confidence,
  };
}

// strip line comments, but not the // inside a URL scheme (https://...)
const stripComment = (l: string) => l.replace(/(^|[^:])\/\/.*$/, "$1");

export function analyzeSdk(source: string, filename = "integration.ts"): Finding[] {
  const lines = source.split(/\r?\n/);
  const findings: Finding[] = [];

  lines.forEach((raw, i) => {
    const line = i + 1;
    const l = stripComment(raw);

    // remote proof provider endpoint
    if (/httpClientProofProvider\s*\(/.test(l)) {
      const urls = l.match(/https?:\/\/[^\s"'`)]+/gi) ?? [];
      const remote = urls.some((u) => {
        const m = u.match(/^https?:\/\/([^/:]+)/i);
        return m && !LOCAL_HOSTS.includes(m[1].toLowerCase());
      });
      findings.push(
        mk(
          filename,
          line,
          l,
          remote ? "CRITICAL" : "LOW",
          remote
            ? "Proof provider configured with a remote endpoint"
            : "HTTP-client proof provider — confirm endpoint stays local",
          "The proof provider sends private witness data to the proof server. A remote endpoint leaks every user's private inputs.",
          "3.9 (proof server trust) / 3.10 (connector)",
          "Point the proof provider at a local proof server (localhost:6300) or one the user controls.",
          remote ? "HIGH" : "MEDIUM",
        ),
      );
    }

    // logging secrets
    if (/console\.(log|info|debug|warn|error)\s*\(/.test(l) && SECRET_WORDS.test(l)) {
      findings.push(
        mk(
          filename,
          line,
          l,
          "HIGH",
          "Secret value passed to a log statement",
          "A mnemonic/seed/secret/private key appears in a log call. Logs persist and can be exfiltrated; private material must never be logged.",
          "3.9 (key management)",
          "Remove the secret from the log, or log only a non-reversible identifier.",
          "MEDIUM",
        ),
      );
    }

    // secret read from process.argv (CLI) — the doc-manager anti-pattern
    if (/process\.argv/.test(l) && SECRET_WORDS.test(l)) {
      findings.push(
        mk(
          filename,
          line,
          l,
          "MEDIUM",
          "Secret taken from a CLI argument",
          "Passing a mnemonic/secret as a CLI argument leaks it into shell history and process listings.",
          "3.9 (key management)",
          "Read secrets from a protected file, env var, or interactive prompt — not argv.",
          "MEDIUM",
        ),
      );
    }
  });

  return findings;
}
