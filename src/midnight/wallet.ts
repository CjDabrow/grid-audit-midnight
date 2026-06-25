// 1AM wallet connection (DApp Connector v4). Client-only.
// 1AM injects window.midnight["1am"]; connect(network) returns the ConnectedAPI.
// 1AM + ProofStation handle proving, dust, and chain sync server-side, so the dApp
// needs no proof server, no funding, and no local chain sync.
import type { ConnectedAPI, Configuration } from "@midnight-ntwrk/dapp-connector-api";
import { NETWORK, WALLET_CONNECTOR_KEY } from "./config";

export interface WalletSession {
  api: ConnectedAPI;
  config: Configuration; // { networkId, indexerUri, indexerWsUri, proverServerUri, substrateNodeUri }
  walletName: string;
  shieldedAddress: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
}

export function isWalletAvailable(): boolean {
  return typeof window !== "undefined" && !!window.midnight?.[WALLET_CONNECTOR_KEY];
}

export async function connectWallet(): Promise<WalletSession> {
  if (typeof window === "undefined") throw new Error("connectWallet must run in the browser");

  const initial = window.midnight?.[WALLET_CONNECTOR_KEY];
  if (!initial) {
    throw new Error(
      `1AM wallet not found at window.midnight["${WALLET_CONNECTOR_KEY}"]. Install the 1AM extension and set it to "${NETWORK}".`,
    );
  }

  const api = await initial.connect(NETWORK); // user approves in the extension
  const config = await api.getConfiguration();
  const addrs = await api.getShieldedAddresses();

  return {
    api,
    config,
    walletName: initial.name ?? "1AM",
    shieldedAddress: addrs.shieldedAddress,
    coinPublicKey: addrs.shieldedCoinPublicKey,
    encryptionPublicKey: addrs.shieldedEncryptionPublicKey,
  };
}
