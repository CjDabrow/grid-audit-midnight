// End-to-end verification on the local standalone network: fund-from-genesis, deploy the
// privacy contract (with witnesses), call publishReceipt, and read the ledger back.
// Run with MN_* env pointing at the local stack and the genesis seed as the wallet.
import "./config.mjs";
import * as Rx from "rxjs";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { Buffer } from "buffer";
import { webcrypto } from "node:crypto";
import { CFG, NETWORK } from "./config.mjs";
import { buildWallet, unshieldedBalance } from "./wallet.mjs";
import * as Registry from "./managed/registry/contract/index.js";

const ZK_PATH = new URL("./managed/registry", import.meta.url).pathname;
const GENESIS = "0000000000000000000000000000000000000000000000000000000000000001";

const enc = new TextEncoder();
const sha256 = async (s) => new Uint8Array(await webcrypto.subtle.digest("SHA-256", enc.encode(s)));

// ---- wallet→SDK provider bridge (from the official example) ----
const signTransactionIntents = (tx, signFn, marker) => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const seg of tx.intents.keys()) {
    const intent = tx.intents.get(seg);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize("signature", marker, "pre-binding", intent.serialize());
    const sig = signFn(cloned.signatureData(seg));
    if (cloned.fallibleUnshieldedOffer)
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(
        cloned.fallibleUnshieldedOffer.inputs.map((_, i) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? sig));
    if (cloned.guaranteedUnshieldedOffer)
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(
        cloned.guaranteedUnshieldedOffer.inputs.map((_, i) => cloned.guaranteedUnshieldedOffer.signatures.at(i) ?? sig));
    tx.intents.set(seg, cloned);
  }
};

const walletAndMidnightProvider = async (ctx) => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx, { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) });
      const signFn = (p) => ctx.unshieldedKeystore.signData(p);
      signTransactionIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction, signFn, "pre-proof");
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => ctx.wallet.submitTransaction(tx),
  };
};

const registerForDustGeneration = async (wallet, ks) => {
  const s = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((x) => x.isSynced)));
  if (s.dust.balance(new Date()) > 0n) { console.log("dust ready"); return; }
  const utxos = s.unshielded.availableCoins.filter((c) => c.meta?.registeredForDustGeneration !== true);
  if (utxos.length) {
    console.log(`registering ${utxos.length} NIGHT UTXO(s) for dust...`);
    const recipe = await wallet.registerNightUtxosForDustGeneration(utxos, ks.getPublicKey(), (p) => ks.signData(p));
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  }
  console.log("waiting for dust...");
  await Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(3000), Rx.filter((x) => x.isSynced), Rx.filter((x) => x.dust.balance(new Date()) > 0n)));
  console.log("dust generated");
};

const configureProviders = async (ctx) => {
  const wmp = await walletAndMidnightProvider(ctx);
  const zk = new NodeZkConfigProvider(ZK_PATH);
  const accountId = wmp.getCoinPublicKey();
  const pw = `${Buffer.from(accountId, "hex").toString("base64")}!`;
  return {
    privateStateProvider: levelPrivateStateProvider({ privateStateStoreName: "grid-pstate", accountId, privateStoragePasswordProvider: () => pw }),
    publicDataProvider: indexerPublicDataProvider(CFG.indexer, CFG.indexerWS),
    zkConfigProvider: zk,
    proofProvider: httpClientProofProvider(CFG.proofServer, zk),
    walletProvider: wmp,
    midnightProvider: wmp,
  };
};

// ---- main ----
const AUDITOR_SECRET = await sha256("grid-auditor-secret-demo");
const REPORT_FINGERPRINT = await sha256("sample audit report v1");
const RECEIPT_ID = await sha256("receipt-1");

console.log("network:", NETWORK, "node:", CFG.node);
const ctx = await buildWallet(GENESIS);
console.log("unshielded:", ctx.unshieldedKeystore.getBech32Address());
console.log("waiting for sync + genesis funds...");
await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced), Rx.filter((s) => unshieldedBalance(s) > 0n)));
console.log("tNight:", (await Rx.firstValueFrom(ctx.wallet.state()).then(unshieldedBalance)).toString());
await registerForDustGeneration(ctx.wallet, ctx.unshieldedKeystore);

const providers = await configureProviders(ctx);
const compiled = CompiledContract.make("registry", Registry.Contract).pipe(
  CompiledContract.withWitnesses({
    auditorSecret: (wctx) => [wctx.privateState, AUDITOR_SECRET],
    reportFingerprint: (wctx) => [wctx.privateState, REPORT_FINGERPRINT],
  }),
  CompiledContract.withCompiledFileAssets(ZK_PATH),
);

console.log("deploying privacy contract (witnesses, proving locally)...");
const deployed = await deployContract(providers, { compiledContract: compiled, args: [] });
const addr = deployed.deployTxData.public.contractAddress;
console.log("DEPLOYED=" + addr);

console.log("calling publishReceipt (proves secret in-circuit, never disclosed)...");
const tx = await deployed.callTx.publishReceipt(RECEIPT_ID);
console.log("PUBLISHED tx=" + JSON.stringify(tx?.public?.txId ?? tx?.public?.txHash ?? null));

const cs = await providers.publicDataProvider.queryContractState(addr);
const led = Registry.ledger(cs.data);
console.log("RESULT published=" + led.published + " receiptStored=" + led.receipts.member(RECEIPT_ID));
process.exit(0);
