"use client";

import { useState } from "react";
import Link from "next/link";
import { BracketLabel, Button, Card, SectionLabel } from "@/components/ui";
import {
  computeReportHash,
  computeReportId,
  computeCommitment,
  type Receipt,
} from "@/midnight/receipt";

type Status = "idle" | "ok" | "fail" | "error";

export default function Verify() {
  const [receiptText, setReceiptText] = useState("");
  const [reportText, setReportText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState<string[]>([]);

  async function verify() {
    setStatus("idle");
    setDetail([]);
    let receipt: Receipt;
    try {
      receipt = JSON.parse(receiptText) as Receipt;
    } catch {
      setStatus("error");
      setDetail(["Receipt is not valid JSON."]);
      return;
    }

    try {
      // Recompute the chain from the original report + the receipt's salt/verdict.
      const reportHash = await computeReportHash(reportText);
      const reportId = await computeReportId(reportHash, receipt.salt);
      const commitment = await computeCommitment(reportHash, receipt.verdict, receipt.salt);

      const checks: [string, boolean][] = [
        ["the report fingerprint matches", reportHash === receipt.reportHash],
        ["the receipt id matches", reportId === receipt.reportId],
      ];
      const lines = checks.map(([k, v]) => `${v ? "✅" : "❌"} ${k}`);
      lines.push(
        `ℹ️ recomputed fingerprint: ${commitment.slice(0, 24)}…`,
        `ℹ️ The on-chain lookup isn't switched on yet. The checks above confirm this receipt matches the report you pasted.`,
      );

      const allOk = checks.every(([, v]) => v);
      setStatus(allOk ? "ok" : "fail");
      setDetail(lines);
    } catch (e) {
      setStatus("error");
      setDetail([e instanceof Error ? e.message : String(e)]);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 py-12">
      <BracketLabel>VERIFY · AUDIT RECEIPT</BracketLabel>
      <h1 className="mt-3 text-3xl font-semibold">Verify a receipt</h1>
      <p className="mt-3 max-w-2xl font-sans text-grid-text-2">
        Paste a receipt and the original report it points to. We check that they match, right here in
        your browser. The report never leaves your device.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <SectionLabel num="01" label="Receipt JSON" />
          <textarea
            value={receiptText}
            onChange={(e) => setReceiptText(e.target.value)}
            placeholder='{"reportId":"…","reportHash":"…","verdict":"…","salt":"…",…}'
            spellCheck={false}
            className="h-40 w-full resize-y rounded border border-grid-border bg-grid-bg p-4 font-mono text-xs text-grid-text outline-none focus:border-grid-accent"
          />
        </div>
        <div>
          <SectionLabel num="02" label="Original report (the audit result JSON)" />
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Paste the exact AuditResult JSON the receipt was created from…"
            spellCheck={false}
            className="h-40 w-full resize-y rounded border border-grid-border bg-grid-bg p-4 font-mono text-xs text-grid-text outline-none focus:border-grid-accent"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={verify} disabled={!receiptText.trim() || !reportText.trim()}>
            VERIFY →
          </Button>
          <Link href="/audit">
            <Button variant="outline">BACK TO AUDIT</Button>
          </Link>
        </div>

        {status !== "idle" && (
          <Card>
            <p
              className={`font-mono text-sm ${
                status === "ok"
                  ? "text-sev-info"
                  : status === "fail"
                    ? "text-sev-critical"
                    : "text-sev-medium"
              }`}
            >
              {status === "ok"
                ? "Receipt is consistent with this report."
                : status === "fail"
                  ? "This report does not match the receipt."
                  : "Could not verify."}
            </p>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-grid-text-2">
              {detail.join("\n")}
            </pre>
          </Card>
        )}
      </div>
    </div>
  );
}
