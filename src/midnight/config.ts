// Midnight dApp config - 1AM wallet + ProofStation (dust-free, hosted proving).
// NEXT_PUBLIC_* are exposed to the browser.

// Network the dApp targets. 1AM supports 'preview' and 'preprod'. Must match the
// network the user's 1AM wallet is set to.
export const NETWORK = process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK ?? "preview";

// Address of the deployed Night Check Registry (set after the one-time browser deploy).
export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "";

// Wallet connector key under window.midnight[...]. 1AM injects under "1am".
// (The DApp Connector v4 API is wallet-agnostic, so "mnLace" also works here.)
export const WALLET_CONNECTOR_KEY = process.env.NEXT_PUBLIC_WALLET_KEY ?? "1am";

// Where the compactc-generated zk keys are served (FetchZkConfigProvider base URL).
export const ZK_BASE_URL = process.env.NEXT_PUBLIC_ZK_BASE_URL ?? "/zk";

// Public indexer endpoint for read-only, wallet-less on-chain verification (the /verify
// page queries the registry's receipts map directly). When a wallet is connected the dApp
// uses the indexer from its 1AM config instead; these are the standalone fallbacks.
export const INDEXER_URI = process.env.NEXT_PUBLIC_INDEXER_URI ?? "";
export const INDEXER_WS_URI = process.env.NEXT_PUBLIC_INDEXER_WS_URI ?? "";

// The circuit id in the compiled contract (used to key zk assets).
export const CIRCUIT_ID = "publishReceipt";

// Domain tag for the receipt commitment. Bump the version suffix if the scheme changes.
export const RECEIPT_DOMAIN = "grid:receipt:v1";

export function assertConfigured(): void {
  if (!REGISTRY_ADDRESS) {
    throw new Error(
      "Registry not deployed yet. Connect 1AM and use the one-time deploy, then set NEXT_PUBLIC_REGISTRY_ADDRESS.",
    );
  }
}
