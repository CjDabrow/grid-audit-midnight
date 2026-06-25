import type { ReactNode } from "react";
import type { Severity } from "@/engine/types";

export function BracketLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-xs tracking-widest text-grid-accent ${className}`}>
      [{children}]
    </span>
  );
}

export function SectionLabel({ num, label }: { num: string; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 font-mono text-xs tracking-widest text-grid-text-3">
      <span className="text-grid-accent">{num}</span>
      <span className="h-px w-8 bg-grid-border-2" />
      <span className="uppercase">{label}</span>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded border border-grid-border bg-grid-bg-2 p-5 ${className}`}
      style={{ borderRadius: "var(--radius)" }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "accent",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "accent" | "outline";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded px-5 py-2.5 font-mono text-sm font-bold tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "accent"
      ? "bg-grid-accent text-black hover:brightness-110"
      : "border border-grid-border-2 text-grid-text hover:border-grid-accent hover:text-grid-accent";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

const SEV_CLASS: Record<Severity, string> = {
  CRITICAL: "text-sev-critical border-sev-critical",
  HIGH: "text-sev-high border-sev-high",
  MEDIUM: "text-sev-medium border-sev-medium",
  LOW: "text-sev-low border-sev-low",
  INFORMATIONAL: "text-sev-info border-sev-info",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest ${SEV_CLASS[severity]}`}
    >
      {severity}
    </span>
  );
}
