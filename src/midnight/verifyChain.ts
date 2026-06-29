// Read-only, wallet-less on-chain verification of a Night Check receipt.
//
// It confirms two things against the live ledger:
//   1. the receiptId is actually recorded in the registry's `receipts` map, and
//   2. the commitment stored there matches the report the user holds.
//
// The stored commitment is persistentHash(H(reportJson || salt)) - exactly what the
// contract writes (registry.compact: `persistentHash<Bytes<32>>(reportFingerprint())`)
// and what publish.ts supplies as the reportFingerprint witness. So verify can recompute
// it from the report text + the receipt's salt without ever touching the witness.
//
// Heavy SDK/WASM imports are dynamic so the native graph stays out of the prerender.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Receipt, computeReportFingerprint } from "./receipt";
import { INDEXER_URI, INDEXER_WS_URI } from "./config";

const fromHex = (h: string): Uint8Array =>
  new Uint8Array((h.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

const eqBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Recompute the value the contract stores on-chain for a receipt:
 * persistentHash(H(reportJson || salt)). Uses the shared computeReportFingerprint so it
 * cannot drift from publish.ts, and applies the same persistentHash the circuit does.
 */
export async function recomputeCommitment(reportJson: string, salt: string): Promise<Uint8Array> {
  const fingerprint = await computeReportFingerprint(reportJson, salt);
  const { persistentHash, CompactTypeBytes } = await import("@midnight-ntwrk/compact-runtime");
  return (persistentHash as any)(new (CompactTypeBytes as any)(32), fingerprint);
}

export interface OnChainResult {
  /** receiptId is present in the registry's receipts map. */
  found: boolean;
  /** stored commitment equals the one recomputed from the user's report. */
  commitmentMatches: boolean;
  /** total receipts certified by this registry (informational). */
  total?: string;
}

/**
 * Look the receipt up on-chain and check its commitment against the given report.
 * Uses a read-only indexer provider (no wallet, no proving, no fees).
 */
export async function readReceiptOnChain(
  receipt: Receipt,
  reportJson: string,
  indexerUri: string = INDEXER_URI,
  indexerWsUri: string = INDEXER_WS_URI,
): Promise<OnChainResult> {
  if (!receipt.registryAddress) {
    throw new Error("This receipt has no registryAddress, so it was never anchored on-chain.");
  }
  if (!indexerUri || !indexerWsUri) {
    throw new Error(
      "On-chain check needs an indexer endpoint. Set NEXT_PUBLIC_INDEXER_URI and " +
        "NEXT_PUBLIC_INDEXER_WS_URI (or connect a wallet to use its indexer).",
    );
  }

  const { setNetworkId } = await import("@midnight-ntwrk/midnight-js-network-id");
  setNetworkId(receipt.network as any);

  const { indexerPublicDataProvider } = await import(
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider"
  );
  const Registry: any = await import("@/contract/managed/registry/contract/index.js");

  const pdp: any = indexerPublicDataProvider(indexerUri, indexerWsUri);
  const contractState: any = await pdp.queryContractState(receipt.registryAddress);
  if (!contractState) {
    // No contract at that address on this network.
    return { found: false, commitmentMatches: false };
  }

  const led: any = Registry.ledger(contractState.data);
  const reportId = fromHex(receipt.reportId);
  const total: string | undefined = led.published?.toString?.() ?? led.total?.toString?.();

  if (!led.receipts.member(reportId)) {
    return { found: false, commitmentMatches: false, total };
  }

  const stored: Uint8Array = led.receipts.lookup(reportId);
  const expected = await recomputeCommitment(reportJson, receipt.salt);
  return { found: true, commitmentMatches: eqBytes(stored, expected), total };
}
