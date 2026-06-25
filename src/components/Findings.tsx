import { Card, SeverityBadge } from "@/components/ui";
import type { AuditResult, Finding, Severity } from "@/engine/types";

const SEV_DOT: Record<Severity, string> = {
  CRITICAL: "bg-sev-critical",
  HIGH: "bg-sev-high",
  MEDIUM: "bg-sev-medium",
  LOW: "bg-sev-low",
  INFORMATIONAL: "bg-sev-info",
};

function SummaryBar({ result }: { result: AuditResult }) {
  const s = result.summary.bySeverity;
  return (
    <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
      <span className="text-grid-text-2">
        {result.summary.total} finding{result.summary.total === 1 ? "" : "s"}
      </span>
      {(Object.keys(s) as Severity[]).map((sev) =>
        s[sev] > 0 ? (
          <span key={sev} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${SEV_DOT[sev]}`} />
            <span className="text-grid-text-2">
              {s[sev]} {sev.toLowerCase()}
            </span>
          </span>
        ) : null,
      )}
      <span className="text-grid-text-3">· {result.durationMs}ms · {result.engineVersion}</span>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <Card className="border-l-2" >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <SeverityBadge severity={f.severity} />
          <span className="font-mono text-[10px] tracking-widest text-grid-text-3">
            {f.domain}
          </span>
          {f.taxonomyClass && (
            <span className="font-mono text-[10px] text-grid-text-3">· {f.taxonomyClass}</span>
          )}
        </div>
        <span className="font-mono text-[10px] text-grid-text-3">conf: {f.confidence}</span>
      </div>
      <h4 className="mt-3 font-semibold text-grid-text">{f.title}</h4>
      <p className="mt-2 font-sans text-sm text-grid-text-2">{f.description}</p>
      {f.evidence && (
        <pre className="mt-3 overflow-x-auto rounded-sm border border-grid-border bg-grid-bg p-3 font-mono text-xs text-grid-text-2">
          {f.evidence}
        </pre>
      )}
      {f.recommendation && (
        <p className="mt-3 font-sans text-sm">
          <span className="font-mono text-xs tracking-widest text-grid-accent">FIX </span>
          <span className="text-grid-text-2">{f.recommendation}</span>
        </p>
      )}
    </Card>
  );
}

export function FindingsReport({ result }: { result: AuditResult }) {
  if (result.summary.total === 0) {
    return (
      <Card>
        <p className="font-mono text-sm text-sev-info">
          No issues found. These checks cover the known Midnight bug patterns. A clean result is a
          good sign, but it doesn&apos;t replace a full manual review.
        </p>
        <div className="mt-3">
          <SummaryBar result={result} />
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <SummaryBar result={result} />
      {result.findings.map((f) => (
        <FindingRow key={f.id} f={f} />
      ))}
    </div>
  );
}
