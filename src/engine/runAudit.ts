// Orchestrator — runs the static analyzers over whichever inputs were provided and
// returns a merged, severity-sorted result. Phase 2 will add a Claude deep-review
// pass and merge/dedupe its findings here.

import { analyzeCompact } from "./compact";
import { analyzeProofServer } from "./proofserver";
import { analyzeSdk } from "./sdk";
import {
  type AuditInput,
  type AuditResult,
  type Finding,
  SEVERITY_ORDER,
  emptySummary,
} from "./types";

export const ENGINE_VERSION = "0.1.0-static";

export function runAudit(input: AuditInput): AuditResult {
  const start = Date.now();
  const findings: Finding[] = [];
  const analyzers: string[] = [];

  if (input.contractSource && input.contractSource.trim()) {
    analyzers.push("compact-static");
    findings.push(
      ...analyzeCompact(input.contractSource, input.contractFilename || "contract.compact"),
    );
  }
  if (input.proofServerConfig && input.proofServerConfig.trim()) {
    analyzers.push("proof-server-static");
    findings.push(...analyzeProofServer(input.proofServerConfig));
  }
  if (input.sdkSource && input.sdkSource.trim()) {
    analyzers.push("sdk-static");
    findings.push(...analyzeSdk(input.sdkSource));
  }

  // severity-sort
  findings.sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  // summary
  const summary = emptySummary();
  summary.total = findings.length;
  for (const f of findings) {
    summary.bySeverity[f.severity]++;
    summary.byDomain[f.domain]++;
  }

  return {
    findings,
    summary,
    durationMs: Date.now() - start,
    analyzers,
    engineVersion: ENGINE_VERSION,
  };
}
