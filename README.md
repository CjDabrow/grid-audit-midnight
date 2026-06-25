# Grid Audit: review your Midnight code, then certify it on-chain

> This project is built on the Midnight Network.

Grid Audit reviews **Midnight code** (Compact contracts, proof-server config, and dApp/SDK
source) and tells you whether it is sound: it flags the privacy and security traps specific
to Midnight, each with a severity and a fix. You then get a **verdict** for the code.

You can then **certify that review on-chain**, privately. A **Compact smart contract** (the
registry) records a tamper-evident *receipt* that the code was reviewed: the auditor proves
authorization with a **secret witness** that is **never disclosed**, and only a
**commitment** to the (private) report is written to the ledger. Anyone can later verify a
receipt against a report without the report ever being public.

So the flow is: **review your code, get a verdict, then certify the result on-chain**. The
end-to-end demo below does exactly this with the real Midnight SDK, verified against a local
Midnight node. The contract is genuinely privacy-preserving: it does **not** `disclose()`
everything; it uses **witnesses + commitments + in-circuit access control**.

> **Web frontend (coming soon).** A point-and-click browser UI for the reviewer, with
> one-click on-chain certification via the 1AM wallet, is in development. The verified,
> runnable deliverable today is the CLI demo below.

## The privacy feature (what makes this a Midnight dApp, not a public ledger)

Contract: [`src/contract/registry.compact`](src/contract/registry.compact)

```compact
witness auditorSecret(): Bytes<32>;       // private input, never written to the ledger
witness reportFingerprint(): Bytes<32>;   // private input, never written to the ledger

constructor() {
  // store only H(secret), a commitment to the auditor's identity
  ownerCommitment = disclose(persistentHash<Bytes<32>>(auditorSecret()));
}

export circuit publishReceipt(receiptId: Bytes<32>): [] {
  // access control by SECRET KNOWLEDGE: re-derive H(secret) in-circuit and require it to
  // equal the on-chain commitment. The secret is consumed by the hash and NEVER disclosed.
  assert(persistentHash<Bytes<32>>(auditorSecret()) == ownerCommitment, "not the auditor");
  assert(!receipts.member(disclose(receiptId)), "receipt already exists");
  // only the COMMITMENT to the private report is made public
  receipts.insert(disclose(receiptId), disclose(persistentHash<Bytes<32>>(reportFingerprint())));
  published.increment(1);
}
```

- `auditorSecret` and `reportFingerprint` are **witnesses** (private inputs the prover
  supplies). They are used inside the circuit but are **never** revealed on-chain.
- Authorization is proven by **knowledge of a secret** matching an on-chain **commitment**,
  so observers learn nothing about the secret, and only the holder can publish. This is the
  canonical Midnight pattern (and the opposite of an `ownPublicKey()` auth check).
- Only commitments (opaque hashes) and a public `receiptId` are disclosed.

## What's in the repo

| Path | What it is |
|---|---|
| [`src/contract/registry.compact`](src/contract/registry.compact) | The privacy-preserving Compact contract |
| [`src/`](src/) | The Next.js auditor web app (static engine in [`src/engine/`](src/engine/), Midnight wiring in [`src/midnight/`](src/midnight/)) |
| [`deploy-kit/`](deploy-kit/) | A CLI that reviews a Compact contract and certifies the review on-chain (deploy + `publishReceipt`), using the real Midnight SDK |
| [`localnet/`](localnet/) | docker-compose for a local Midnight node + indexer + proof server |

## Prerequisites

- **Node.js 22+** and **npm**
- **Docker + Docker Compose v2** (for the local Midnight network used by the on-chain demo)
- **The Compact toolchain** (`compact`), to compile the contract from source:
  ```bash
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  compact update 0.31.0     # Compact language 0.23 needs compiler 0.31.0
  # ensure ~/.local/bin is on PATH (the installer prints how)
  ```

## Build

```bash
npm install
npm run compile:contract     # runs compact compile, writes src/contract/managed, stages zk keys + CLI copy
npm run build                # builds the Next.js web app
```

## Run: the end-to-end demo (review code, then certify it on-chain)

This runs the whole flow on a **local** Midnight network (a fresh chain, so no faucet and
instant sync): it reviews a sample Compact contract with the real auditor engine, prints
the verdict and findings, then deploys the registry and certifies that review on-chain, and
reads the receipt back.

```bash
# 1. start node + indexer + proof server (all bound to 127.0.0.1)
docker compose -f localnet/standalone.yml up -d
#    wait until all three report healthy:
docker compose -f localnet/standalone.yml ps

# 2. run the demo
cd deploy-kit
npm install
npm run demo
```

Expected output (a real run):

```
=== STEP 1: reviewed user-contract.compact ===
verdict: C1/H0/M2/L1/I1  (NEEDS WORK)
  [CRITICAL] ownPublicKey() used to authorize the caller (line 11)
  [MEDIUM] Disclosing a hash of witness data (brute-force risk) (line 15)
  [MEDIUM] Witness 'userVote' used without an apparent validating assert (line 15)
  [LOW] Hash/commitment without domain separation (line 15)
  [INFORMATIONAL] ownPublicKey() used (verify it is not for authorization) (line 8)

=== STEP 2: certify the review on-chain (network: undeployed) ===
registry deployed at: 13adfda0151a7ddb09908f2a3bc7f436bb36e813db7816d5558e3f1ebb804b03
receipt published, tx: 00f01813abebc9eef0...

=== STEP 3: read the certificate back from the ledger ===
receipt on-chain for this contract: true
total certified audits: 1
```

Step 1 is the product: the reviewer (`src/engine/`, shared with the web app) finds the real
bugs in the sample contract and returns a verdict. Steps 2-3 fund a wallet from the local
genesis account, register NIGHT for DUST (fees), deploy the registry, publish a receipt that
commits to the private report (proving the auditor secret in-circuit), and read it back from
on-chain ledger state. Addresses/tx hashes differ each run.

Tear down: `docker compose -f localnet/standalone.yml down`.

### Targeting a public network

The CLI is network-agnostic via env vars (defaults target the local stack):

```bash
MN_NETWORK=preprod \
MN_NODE=https://rpc.preprod.midnight.network \
MN_INDEXER=https://indexer.preprod.midnight.network/api/v3/graphql \
MN_INDEXER_WS=wss://indexer.preprod.midnight.network/api/v3/graphql/ws \
MN_PROOF=http://127.0.0.1:6300 \
node demo.mjs
```

(Note: a fresh wallet on a public network must sync chain history, which can take a long
time; the local network is recommended for evaluation.)

## Web frontend (coming soon)

A browser UI is in development: the Grid auditor (static analysis of Midnight code) plus
one-click receipt publishing via the 1AM wallet. A preview of the static auditor is live at:

> **https://midnight.gridservices.xyz**

The in-browser publish flow is still being finished, so the verified on-chain path for
evaluation is the CLI demo above. (The web app source lives in [`src/`](src/) and builds
with `npm run build`.)

## SDK packages used (all real, current Midnight SDK)

`@midnight-ntwrk/compact-js`, `@midnight-ntwrk/midnight-js` (contracts/types/network-id),
`@midnight-ntwrk/midnight-js-indexer-public-data-provider`,
`@midnight-ntwrk/midnight-js-node-zk-config-provider`,
`@midnight-ntwrk/midnight-js-http-client-proof-provider`,
`@midnight-ntwrk/midnight-js-level-private-state-provider`,
`@midnight-ntwrk/ledger-v8`, and the `@midnight-ntwrk/wallet-sdk-*` family.

## Notes

- The contract is compiled **from source** by `npm run compile:contract`; the generated
  module and zk keys are git-ignored (not committed as pre-built-only artifacts).
- The auditor engine and the registry contract are original work. The wallet/provider
  setup follows the official Midnight SDK patterns (that is how the SDK is meant to be used).
