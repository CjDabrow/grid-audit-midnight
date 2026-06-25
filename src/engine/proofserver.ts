// Static analyzer for proof-server configuration (docker-compose, env, provider URL).
// The cardinal rule: the proof server consumes plaintext witnesses, so it MUST run
// locally. A remote/shared proof server = total privacy compromise.

import type { Finding, Severity, Confidence } from "./types";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"];

let counter = 0;
function mk(
  filename: string,
  line: number,
  snippet: string,
  severity: Severity,
  title: string,
  description: string,
  recommendation: string,
  confidence: Confidence,
): Finding {
  return {
    id: `proof-${++counter}`,
    domain: "PROOF_SERVER",
    pillar: "INFRASTRUCTURE",
    title,
    description,
    severity,
    taxonomyClass: "3.9 (proof server trust)",
    evidence: `${filename}:${line}  ${snippet.trim()}`,
    line,
    recommendation,
    confidence,
  };
}

function hostFromUrl(u: string): string | null {
  const m = u.match(/^https?:\/\/([^/:]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export function analyzeProofServer(config: string, filename = "proof-server.config"): Finding[] {
  const lines = config.split(/\r?\n/);
  const findings: Finding[] = [];

  lines.forEach((raw, i) => {
    const line = i + 1;
    // any URL pointing at the proof-server port or named as a proof server
    const urls = raw.match(/https?:\/\/[^\s"'`]+/gi) ?? [];
    for (const u of urls) {
      const host = hostFromUrl(u);
      const looksLikeProof =
        /:6300\b/.test(u) || /proof[-_]?server|proofProvider|PROOF_SERVER/i.test(raw);
      if (looksLikeProof && host && !LOCAL_HOSTS.includes(host)) {
        findings.push(
          mk(
            filename,
            line,
            raw,
            "CRITICAL",
            "Proof server points at a remote/non-local host",
            `The proof server receives raw private witness data in plaintext. Pointing it at a remote host (${host}) exposes every user's private inputs to that machine — a total privacy compromise.`,
            "Run the proof server locally (http://localhost:6300) on the user's own device, or only on a machine the user fully controls over an encrypted channel. Never share a hosted proof server.",
            "HIGH",
          ),
        );
      }
    }

    // remote proving via the dapp/http provider with an explicit non-local endpoint
    if (/httpClientProofProvider|http-client-proof-provider/i.test(raw)) {
      findings.push(
        mk(
          filename,
          line,
          raw,
          "LOW",
          "HTTP-client proof provider in use — confirm endpoint is local",
          "The HTTP-client proof provider sends the circuit + private witness to a configured endpoint. Confirm that endpoint is local/self-controlled.",
          "Verify the configured proof-server URL is localhost or a machine the user controls.",
          "MEDIUM",
        ),
      );
    }
  });

  // hygiene: no explicit network pin
  if (/proof[-_]?server/i.test(config) && !/--network\b/.test(config)) {
    findings.push({
      id: `proof-${++counter}`,
      domain: "PROOF_SERVER",
      pillar: "INFRASTRUCTURE",
      title: "Proof server started without an explicit --network",
      description:
        "No explicit --network flag found for the proof server; it may default to an unexpected network.",
      severity: "INFORMATIONAL",
      taxonomyClass: "hygiene",
      recommendation: "Pass --network explicitly (e.g. --network testnet/preprod) to avoid ambiguity.",
      confidence: "LOW",
    });
  }

  return findings;
}
