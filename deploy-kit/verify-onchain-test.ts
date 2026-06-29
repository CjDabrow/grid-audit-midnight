// Round-trip test for the WEB /verify on-chain path against the live localnet.
//
// It publishes a receipt using the SAME scheme the web app uses (src/midnight/receipt.ts
// + publish.ts), then independently recomputes the commitment the way src/midnight/
// verifyChain.ts does (persistentHash(H(reportJson || salt))) and asserts it equals the
// value actually stored on-chain. If this passes, the browser /verify "Check on-chain"
// will return commitmentMatches=true for real receipts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import "./config.mjs";
import * as Rx from "rxjs";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { persistentHash, CompactTypeBytes } from "@midnight-ntwrk/compact-runtime";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { Buffer } from "buffer";
import { webcrypto } from "node:crypto";
import { CFG, NETWORK } from "./config.mjs";
import { buildWallet, unshieldedBalance } from "./wallet.mjs";
import { runAudit } from "../src/engine/runAudit";
import {
  computeReportHash,
  computeReportId,
  computeReportFingerprint,
  genSalt,
} from "../src/midnight/receipt"; // the REAL web scheme - this test guards against drift

const ZK_PATH = new URL("./managed/registry", import.meta.url).pathname;
const Registry: any = await import("./managed/registry/contract/index.js");

const enc = new TextEncoder();
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array((h.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
const sha256Bytes = async (s: string) => new Uint8Array(await webcrypto.subtle.digest("SHA-256", enc.encode(s)));
const eqBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- build a realistic report exactly as the web app would --------------------------
const USER_CONTRACT = `pragma language_version >= 0.23;
import CompactStandardLibrary;
export ledger owner: Bytes<32>;
witness userVote(): Field;
export circuit withdraw(): [] { assert(ownPublicKey().bytes == owner, "not owner"); }`;
const result = runAudit({ contractSource: USER_CONTRACT, contractFilename: "user.compact" });
const reportJson = JSON.stringify(result);

// salt + ids via the shared web scheme (src/midnight/receipt.ts)
const salt = genSalt();
const reportHash = await computeReportHash(reportJson);
const reportId = await computeReportId(reportHash, salt); // on-chain key
const reportFingerprint = await computeReportFingerprint(reportJson, salt); // witness
const AUDITOR_SECRET = await sha256Bytes("night-check-operator"); // default NEXT_PUBLIC_AUDITOR_TAG

console.log("=== publishing a web-scheme receipt to", NETWORK, "===");
console.log("reportId:", reportId.slice(0, 24) + "…");

// ---- provider plumbing (same as demo.ts) ----------------------------------------------
const signTransactionIntents = (tx: any, signFn: any, marker: any) => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const seg of tx.intents.keys()) {
    const intent = tx.intents.get(seg);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize("signature", marker, "pre-binding", intent.serialize());
    const sig = signFn(cloned.signatureData(seg));
    if (cloned.fallibleUnshieldedOffer)
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(
        cloned.fallibleUnshieldedOffer.inputs.map((_: any, i: number) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? sig));
    if (cloned.guaranteedUnshieldedOffer)
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(
        cloned.guaranteedUnshieldedOffer.inputs.map((_: any, i: number) => cloned.guaranteedUnshieldedOffer.signatures.at(i) ?? sig));
    tx.intents.set(seg, cloned);
  }
};
const walletAndMidnightProvider = async (ctx: any) => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((x: any) => x.isSynced)));
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx, { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) });
      const signFn = (p: any) => ctx.unshieldedKeystore.signData(p);
      signTransactionIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction, signFn, "pre-proof");
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => ctx.wallet.submitTransaction(tx),
  };
};
const registerForDustGeneration = async (wallet: any, ks: any) => {
  const st = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((x: any) => x.isSynced)));
  if (st.dust.balance(new Date()) > 0n) return;
  const utxos = st.unshielded.availableCoins.filter((c: any) => c.meta?.registeredForDustGeneration !== true);
  if (utxos.length) {
    const recipe = await wallet.registerNightUtxosForDustGeneration(utxos, ks.getPublicKey(), (p: any) => ks.signData(p));
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  }
  await Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(3000), Rx.filter((x: any) => x.isSynced), Rx.filter((x: any) => x.dust.balance(new Date()) > 0n)));
};
const configureProviders = async (ctx: any) => {
  const wmp = await walletAndMidnightProvider(ctx);
  const zk = new NodeZkConfigProvider(ZK_PATH);
  const accountId = wmp.getCoinPublicKey();
  const pw = `${Buffer.from(accountId, "hex").toString("base64")}!`;
  return {
    privateStateProvider: levelPrivateStateProvider({ privateStateStoreName: "verify-pstate", accountId, privateStoragePasswordProvider: () => pw } as any),
    publicDataProvider: indexerPublicDataProvider(CFG.indexer, CFG.indexerWS),
    zkConfigProvider: zk,
    proofProvider: httpClientProofProvider(CFG.proofServer, zk as any),
    walletProvider: wmp,
    midnightProvider: wmp,
  } as any;
};

const ctx = await buildWallet("0000000000000000000000000000000000000000000000000000000000000001");
await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((x: any) => x.isSynced), Rx.filter((x: any) => unshieldedBalance(x) > 0n)));
await registerForDustGeneration(ctx.wallet, ctx.unshieldedKeystore);
const providers = await configureProviders(ctx);

const make: any = CompiledContract.make("registry", Registry.Contract);
const compiled = make.pipe(
  (CompiledContract.withWitnesses as any)({
    auditorSecret: (w: any) => [w.privateState, AUDITOR_SECRET],
    reportFingerprint: (w: any) => [w.privateState, reportFingerprint],
  }),
  (CompiledContract.withCompiledFileAssets as any)(ZK_PATH),
);

const deployed: any = await deployContract(providers, { compiledContract: compiled, args: [] } as any);
const addr = deployed.deployTxData.public.contractAddress;
await deployed.callTx.publishReceipt(fromHex(reportId));
console.log("published to registry:", addr.slice(0, 24) + "…");

// ---- now do EXACTLY what src/midnight/verifyChain.ts does -----------------------------
console.log("\n=== verifying on-chain the way the web /verify page does ===");
const cs: any = await providers.publicDataProvider.queryContractState(addr);
const led: any = Registry.ledger(cs.data);
const key = fromHex(reportId);

const found = led.receipts.member(key);
const stored: Uint8Array = led.receipts.lookup(key);
const expected = (persistentHash as any)(new (CompactTypeBytes as any)(32), reportFingerprint);

console.log(`found receiptId on-chain:        ${found}`);
console.log(`stored commitment:               ${toHex(stored).slice(0, 24)}…`);
console.log(`recomputed (verifyChain scheme): ${toHex(expected).slice(0, 24)}…`);
console.log(`commitmentMatches:               ${eqBytes(stored, expected)}`);
console.log(`total certified:                 ${led.published.toString()}`);

const ok = found && eqBytes(stored, expected);
console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"}: web /verify on-chain logic round-trips against the live ledger`);
process.exit(ok ? 0 : 1);
