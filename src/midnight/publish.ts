// Deploy the registry (one-time) and publish receipts, via 1AM + ProofStation.
// All heavy imports are dynamic so the Midnight SDK stays out of the server-rendered graph.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuditResult } from "@/engine/types";
import { REGISTRY_ADDRESS, NETWORK, CIRCUIT_ID, assertConfigured } from "./config";
import { computeReportHash, computeReportId, genSalt, type Receipt } from "./receipt";
import { buildProviders } from "./providers";
import type { WalletSession } from "./wallet";

export function verdictFromResult(result: AuditResult): string {
  const s = result.summary.bySeverity;
  return `C${s.CRITICAL}/H${s.HIGH}/M${s.MEDIUM}/L${s.LOW}/I${s.INFORMATIONAL}`;
}

const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));

const enc = new TextEncoder();
const sha256Bytes = async (s: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));

// The auditor's secret gates publishing (proven in-circuit against an on-chain commitment;
// never disclosed). The SAME secret must be used at deploy and publish. The operator sets it
// via NEXT_PUBLIC_AUDITOR_TAG; for the verified on-chain demo see deploy-kit/ (CLI).
const auditorSecretBytes = (): Promise<Uint8Array> =>
  sha256Bytes(process.env.NEXT_PUBLIC_AUDITOR_TAG ?? "grid-audit-operator");

// Build the compiled contract with its witness implementations (auditorSecret + the private
// report fingerprint). Keys/zkir are fetched at tx time via providers.zkConfigProvider.
async function buildCompiled(auditorSecret: Uint8Array, reportFingerprint: Uint8Array): Promise<any> {
  const { CompiledContract } = await import("@midnight-ntwrk/compact-js");
  const Registry: any = await import("@/contract/managed/registry/contract/index.js");
  const make: any = CompiledContract.make("registry", Registry.Contract);
  return make.pipe(
    (CompiledContract.withWitnesses as any)({
      auditorSecret: (wctx: any) => [wctx.privateState, auditorSecret],
      reportFingerprint: (wctx: any) => [wctx.privateState, reportFingerprint],
    }),
  );
}

/** One-time: deploy the registry. Binds it to the auditor secret. Returns its address. */
export async function deployRegistry(session: WalletSession): Promise<string> {
  const providers = await buildProviders(session);
  const compiled = await buildCompiled(await auditorSecretBytes(), new Uint8Array(32));
  const { deployContract } = await import("@midnight-ntwrk/midnight-js-contracts");
  const deployed: any = await deployContract(providers as any, {
    compiledContract: compiled,
    args: [], // constructor takes no public params (the secret comes from the witness)
  } as any);
  return deployed.deployTxData.public.contractAddress;
}

/** Compute a receipt and submit publishReceipt to the registry (witness proves the secret). */
export async function publishReceipt(
  session: WalletSession,
  result: AuditResult,
): Promise<Receipt> {
  assertConfigured();

  const reportJson = JSON.stringify(result);
  const verdict = verdictFromResult(result);
  const salt = genSalt();
  const reportHash = await computeReportHash(reportJson);
  const reportId = await computeReportId(reportHash, salt); // public receipt key
  // The private report fingerprint — only its commitment is written on-chain.
  const reportFingerprint = await sha256Bytes(reportJson + salt);

  const providers = await buildProviders(session);
  const compiled = await buildCompiled(await auditorSecretBytes(), reportFingerprint);
  const { findDeployedContract } = await import("@midnight-ntwrk/midnight-js-contracts");
  const deployed: any = await findDeployedContract(providers as any, {
    contractAddress: REGISTRY_ADDRESS,
    compiledContract: compiled,
  } as any);
  // publishReceipt takes only the public receiptId; the witnesses supply the private inputs.
  const tx: any = await deployed.callTx[CIRCUIT_ID](hexToBytes(reportId));

  return {
    reportId,
    reportHash,
    verdict,
    salt,
    network: NETWORK,
    registryAddress: REGISTRY_ADDRESS,
    txHash: tx?.public?.txId ?? tx?.public?.txHash ?? tx?.txId,
  };
}
