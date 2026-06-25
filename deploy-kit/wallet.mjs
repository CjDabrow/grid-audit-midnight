// Headless wallet on the current Midnight SDK (Preprod). Ported from the official
// example-counter (counter-cli/src/api.ts): an HD seed derives three sub-wallets
// (Shielded / Unshielded / Dust) wrapped in a WalletFacade. The fundable address is
// the UNSHIELDED one (tNight from the faucet); fees are paid in Dust generated from it.
import { WebSocket } from "ws";
// Required for the GraphQL subscriptions the wallet uses to sync, in Node.
globalThis.WebSocket = WebSocket;

import * as ledger from "@midnight-ntwrk/ledger-v8";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { getNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import * as Rx from "rxjs";
import { Buffer } from "buffer";
import { CFG } from "./config.mjs";

const deriveKeysFromSeed = (seed) => {
  const hd = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hd.type !== "seedOk") throw new Error("HDWallet seed failed: " + hd.type);
  const dr = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (dr.type !== "keysDerived") throw new Error("key derivation failed: " + dr.type);
  hd.hdWallet.clear();
  return dr.keys;
};

const shieldedConfig = () => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: CFG.indexer, indexerWsUrl: CFG.indexerWS },
  provingServerUrl: new URL(CFG.proofServer),
  relayURL: new URL(CFG.node.replace(/^http/, "ws")),
});
const unshieldedConfig = () => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: CFG.indexer, indexerWsUrl: CFG.indexerWS },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});
const dustConfig = () => ({
  networkId: getNetworkId(),
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  indexerClientConnection: { indexerHttpUrl: CFG.indexer, indexerWsUrl: CFG.indexerWS },
  provingServerUrl: new URL(CFG.proofServer),
  relayURL: new URL(CFG.node.replace(/^http/, "ws")),
});

/** Build + start the composite wallet from a hex seed. Does NOT wait for funds. */
export const buildWallet = async (seed) => {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig(), ...unshieldedConfig(), ...dustConfig() },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const waitForSync = (wallet) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

export const unshieldedBalance = (state) =>
  state.unshielded.balances[unshieldedToken().raw] ?? 0n;
