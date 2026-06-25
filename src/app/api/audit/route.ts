import { NextResponse } from "next/server";
import { runAudit } from "@/engine/runAudit";
import type { AuditInput } from "@/engine/types";

export async function POST(req: Request) {
  let body: AuditInput;
  try {
    body = (await req.json()) as AuditInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasInput =
    !!body?.contractSource?.trim() ||
    !!body?.proofServerConfig?.trim() ||
    !!body?.sdkSource?.trim();

  if (!hasInput) {
    return NextResponse.json(
      { error: "Provide at least one of: contractSource, proofServerConfig, sdkSource" },
      { status: 400 },
    );
  }

  try {
    const result = runAudit({
      contractSource: body.contractSource,
      contractFilename: body.contractFilename,
      proofServerConfig: body.proofServerConfig,
      sdkSource: body.sdkSource,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Audit engine error", detail: String(err) },
      { status: 500 },
    );
  }
}
