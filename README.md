# Grid Audit — a privacy-preserving audit registry on Midnight

Grid Audit is a Midnight dApp in two parts:

1. **A static auditor** (Next.js web app) that reviews **Midnight code** — Compact
   contracts, proof-server config, and dApp/SDK source — for the privacy and security
   traps specific to Midnight (e.g. `ownPublicKey()` used for authorization, hashes of
   low-entropy data, proof servers pointed at remote hosts, secrets in logs).
2. **An on-chain attestation registry** — a **Compact smart contract** where an auditor
   publishes a tamper-evident *receipt* of an audit. The contract is privacy-preserving:
   the auditor proves authorization with a **secret witness** that is **never disclosed**,
   and only a **commitment** to the (private) report is written on-chain.

The interesting part for Midnight is the contract: it does **not** `disclose()` everything.
It demonstrates **witnesses + commitments + in-circuit access control**.

## The privacy feature (what makes this a Midnight dApp, not a public ledger)

Contract: [`src/contract/registry.compact`](src/contract/registry.compact)

```compact
witness auditorSecret(): Bytes<32>;       // private input, never written to the ledger
witness reportFingerprint(): Bytes<32>;   // private input, never written to the ledger

constructor() {
  // store only H(secret) — a commitment to the auditor's identity
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
- Authorization is proven by **knowledge of a secret** matching an on-chain **commitment**
  — observers learn nothing about the secret, and only the holder can publish. This is the
  canonical Midnight pattern (and the opposite of an `ownPublicKey()` auth check).
- Only commitments (opaque hashes) and a public `receiptId` are disclosed.

## What's in the repo

| Path | What it is |
|---|---|
| [`src/contract/registry.compact`](src/contract/registry.compact) | The privacy-preserving Compact contract |
| [`src/`](src/) | The Next.js auditor web app (static engine in [`src/engine/`](src/engine/), Midnight wiring in [`src/midnight/`](src/midnight/)) |
| [`deploy-kit/`](deploy-kit/) | A small CLI that deploys the contract and calls `publishReceipt` using the real Midnight SDK |
| [`localnet/`](localnet/) | docker-compose for a local Midnight node + indexer + proof server |

## Prerequisites

- **Node.js ≥ 22** and **npm**
- **Docker + Docker Compose v2** (for the local Midnight network used by the on-chain demo)
- **The Compact toolchain** (`compact`), to compile the contract from source:
  ```bash
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  compact update            # installs the latest compiler (this project uses language 0.23 → compiler 0.31)
  # ensure ~/.local/bin is on PATH (the installer prints how)
  ```

## Build

```bash
npm install
npm run compile:contract     # compact compile → src/contract/managed + stages zk keys + CLI copy
npm run build                # builds the Next.js web app
```

## Run

### A) The auditor web app (no chain needed)

```bash
npm run dev          # http://localhost:3010
# open /audit, paste a Compact contract / SDK snippet (or "Try a sample"), get findings
# /verify checks an audit receipt against its report
```

### B) The on-chain demo — deploy + publish + read (real Midnight SDK)

This spins up a **local** Midnight network (fresh chain, so no faucet and instant sync),
deploys the privacy contract, calls `publishReceipt` (proving the secret in-circuit), and
reads the receipt back from the ledger.

```bash
# 1. start node + indexer + proof server (all bound to 127.0.0.1)
docker compose -f localnet/standalone.yml up -d
#    wait until all three report healthy:
docker compose -f localnet/standalone.yml ps

# 2. run the deploy + interaction demo
cd deploy-kit
npm install
npm run demo
```

Expected output (a real run):

```
network: undeployed node: http://127.0.0.1:9944
unshielded: mn_addr_undeployed1...
waiting for sync + genesis funds...
tNight: 250000000000000
dust ready
deploying privacy contract (witnesses, proving locally)...
DEPLOYED=6ef59511ab326b02b189725c62962daa68a821aa386bca4f57e47fc1900512e3
calling publishReceipt (proves secret in-circuit, never disclosed)...
PUBLISHED tx=00933d54b5b6daf2...
RESULT published=1 receiptStored=true
```

The demo funds a wallet from the local genesis account (seed `0x00…01`), registers NIGHT
for DUST (to pay fees), then deploys and calls the contract. `receiptStored=true` is read
back from on-chain ledger state via the indexer.

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
