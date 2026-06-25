// Provider bundle for 1AM + ProofStation. Built from a connected wallet session per the
// official 1AM Midnight skill. Proving + dust + balancing are routed through the wallet to
// ProofStation (hosted), so there is no local proof server, no funding, and no chain sync.
//
// Typed loosely (the ledger-v8 tx objects + provider interfaces are intricate WASM types);
// publish.ts casts to the SDK provider type when calling deployContract/submitCallTx.
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { WalletSession } from "./wallet";
import { ZK_BASE_URL } from "./config";

export type CircuitId = "publishReceipt";

const toHex = (b: Uint8Array): string =>
  Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string): Uint8Array =>
  new Uint8Array((h.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function buildProviders(session: WalletSession): Promise<any> {
  const { api, config } = session;
  setNetworkId(config.networkId);

  const zkBase =
    ZK_BASE_URL.startsWith("http") || typeof window === "undefined"
      ? ZK_BASE_URL
      : `${window.location.origin}${ZK_BASE_URL}`;
  const zkConfigProvider = new FetchZkConfigProvider<CircuitId>(zkBase, fetch.bind(globalThis));

  const publicDataProvider = indexerPublicDataProvider(config.indexerUri, config.indexerWsUri);

  // Proving routed through 1AM → ProofStation (hosted native prover, dust sponsored).
  const provingProvider = await api.getProvingProvider(zkConfigProvider as any);
  const proofProvider = {
    async proveTx(unprovenTx: any) {
      const { CostModel } = await import("@midnight-ntwrk/ledger-v8");
      return unprovenTx.prove(provingProvider, CostModel.initialCostModel());
    },
  };

  // Balancing → ProofStation adds dust (user pays nothing).
  const walletProvider = {
    getCoinPublicKey: () => session.coinPublicKey,
    getEncryptionPublicKey: () => session.encryptionPublicKey,
    async balanceTx(tx: any) {
      const result = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      const { Transaction } = await import("@midnight-ntwrk/ledger-v8");
      return Transaction.deserialize("signature", "proof", "binding", fromHex(result.tx));
    },
  };

  const midnightProvider = {
    async submitTx(tx: any) {
      await api.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  // Browser-local private state (registry has none, but the bundle requires the provider).
  const privateStateProvider = levelPrivateStateProvider({
    privateStateStoreName: "grid-registry-pstate",
    accountId: session.coinPublicKey,
    privateStoragePasswordProvider: async () => `${session.coinPublicKey.slice(0, 24)}Aa1!`,
  } as any);

  return {
    zkConfigProvider,
    publicDataProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    privateStateProvider,
  };
}
