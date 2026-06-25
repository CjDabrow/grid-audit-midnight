"use client";

import { useState } from "react";
import Link from "next/link";
import { BracketLabel, Button, Card, SectionLabel } from "@/components/ui";
import { FindingsReport } from "@/components/Findings";
import type { AuditResult } from "@/engine/types";
import { connectWallet, isWalletAvailable, type WalletSession } from "@/midnight/wallet";
import { REGISTRY_ADDRESS } from "@/midnight/config";
import type { Receipt } from "@/midnight/receipt";

type Tab = "CONTRACT" | "PROOF_SERVER" | "SDK";

const SAMPLE_CONTRACT = `pragma language_version >= 0.23;
import CompactStandardLibrary;

export ledger owner: Bytes<32>;
export ledger vote: Bytes<32>;

witness localSecretKey(): Bytes<32>;
witness userVote(): Field;

export circuit setOwner(): [] {
  owner = disclose(ownPublicKey().bytes);
}

// BUG: authorizes the caller with ownPublicKey() (a witness)
export circuit withdraw(): [] {
  assert(ownPublicKey().bytes == owner, "not owner");
}

// BUG: discloses a hash of a low-entropy vote (brute-forceable)
export circuit castVote(): [] {
  vote = disclose(persistentHash<Field>(userVote()));
}`;

const SAMPLE_SDK = `import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';

const proofProvider = httpClientProofProvider('https://proofs.example.com:6300');

function makeWallet(mnemonic: string) {
  console.log('using mnemonic', mnemonic); // leaks secret
  return deriveFromSeed(mnemonic);
}`;

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>("CONTRACT");
  const [contract, setContract] = useState("");
  const [proof, setProof] = useState("");
  const [sdk, setSdk] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // on-chain receipt state
  const [session, setSession] = useState<WalletSession | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployedAddr, setDeployedAddr] = useState<string | null>(null);

  async function doConnect() {
    setChainError(null);
    setWalletBusy(true);
    try {
      setSession(await connectWallet());
    } catch (e) {
      setChainError(e instanceof Error ? e.message : String(e));
    } finally {
      setWalletBusy(false);
    }
  }

  async function doDeploy() {
    if (!session) return;
    setChainError(null);
    setDeployedAddr(null);
    setDeploying(true);
    try {
      const { deployRegistry } = await import("@/midnight/publish");
      setDeployedAddr(await deployRegistry(session));
    } catch (e) {
      setChainError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeploying(false);
    }
  }

  async function doPublish() {
    if (!session || !result) return;
    setChainError(null);
    setReceipt(null);
    setPublishing(true);
    try {
      // Dynamic import keeps the heavy Midnight SDK out of the server-rendered graph
      // (it pulls native LevelDB bindings that can't be evaluated during prerender).
      const { publishReceipt } = await import("@/midnight/publish");
      setReceipt(await publishReceipt(session, result));
    } catch (e) {
      setChainError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  function downloadReceipt() {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grid-receipt-${receipt.reportId.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractSource: contract,
          proofServerConfig: proof,
          sdkSource: sdk,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Audit failed");
      else setResult(data as AuditResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const value = tab === "CONTRACT" ? contract : tab === "PROOF_SERVER" ? proof : sdk;
  const setValue = tab === "CONTRACT" ? setContract : tab === "PROOF_SERVER" ? setProof : setSdk;
  const placeholder =
    tab === "CONTRACT"
      ? "Paste your Compact contract (.compact) here…"
      : tab === "PROOF_SERVER"
        ? "Paste your proof-server config (docker-compose / env / provider URL) here…"
        : "Paste your dApp / SDK TypeScript here…";

  function loadSample() {
    if (tab === "CONTRACT") setContract(SAMPLE_CONTRACT);
    else if (tab === "SDK") setSdk(SAMPLE_SDK);
  }

  const tabs: Tab[] = ["CONTRACT", "PROOF_SERVER", "SDK"];
  const filled = [contract, proof, sdk].filter((s) => s.trim()).length;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12">
      <BracketLabel>FREE · RUNS IN YOUR BROWSER</BracketLabel>
      <h1 className="mt-3 text-3xl font-semibold">Audit your Midnight contract</h1>
      <p className="mt-3 max-w-2xl font-sans text-grid-text-2">
        Paste your contract, proof-server config, or app code and get an instant security report
        that points to the exact line. Nothing is uploaded or stored. When you&apos;re happy with it,
        you can save a verifiable receipt on-chain.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* input */}
        <div>
          <SectionLabel num="01" label="Your code" />
          <div className="mb-3 flex gap-2">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-sm border px-3 py-1.5 font-mono text-xs tracking-widest transition ${
                  tab === t
                    ? "border-grid-accent text-grid-accent"
                    : "border-grid-border text-grid-text-3 hover:text-grid-text-2"
                }`}
              >
                {t.replace("_", " ")}
                {[contract, proof, sdk][tabs.indexOf(t)].trim() ? " ●" : ""}
              </button>
            ))}
          </div>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            className="h-[420px] w-full resize-y rounded border border-grid-border bg-grid-bg p-4 font-mono text-xs text-grid-text outline-none focus:border-grid-accent"
          />
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={run} disabled={loading || filled === 0}>
              {loading ? "AUDITING…" : "AUDIT MY CODE →"}
            </Button>
            {(tab === "CONTRACT" || tab === "SDK") && (
              <Button variant="outline" onClick={loadSample}>
                TRY A SAMPLE
              </Button>
            )}
            <span className="font-mono text-xs text-grid-text-3">
              {filled} of 3 added
            </span>
          </div>
        </div>

        {/* output */}
        <div>
          <SectionLabel num="02" label="Your report" />
          {error && (
            <Card>
              <p className="font-mono text-sm text-sev-critical">{error}</p>
            </Card>
          )}
          {!error && !result && (
            <Card>
              <p className="font-mono text-sm text-grid-text-3">
                Your report will appear here. Paste your code (or try a sample), then run the audit.
              </p>
            </Card>
          )}
          {result && <FindingsReport result={result} />}

          {result && (
            <div className="mt-6">
              <SectionLabel num="03" label="Certify on-chain (optional)" />
              <Card>
                {!session ? (
                  <>
                    <p className="font-sans text-sm text-grid-text-2">
                      Want a tamper-proof record that this audit happened? Connect your{" "}
                      <span className="text-grid-text">1AM</span> wallet to save a receipt on-chain.
                      Your code and report stay private. Only a scrambled fingerprint of the report
                      goes on-chain, and anyone can check it later. 1AM covers all fees, so this is
                      free for you.
                    </p>
                    <div className="mt-4">
                      <Button onClick={doConnect} disabled={walletBusy}>
                        {walletBusy ? "CONNECTING…" : "CONNECT 1AM WALLET →"}
                      </Button>
                    </div>
                    {!isWalletAvailable() && (
                      <p className="mt-3 font-mono text-xs text-grid-text-3">
                        No 1AM wallet detected. Install the 1AM extension (1am.xyz) and set it to the
                        same network, then reload.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-mono text-xs text-grid-text-3">
                      Connected · {session.walletName} · {session.config.networkId} ·{" "}
                      {session.shieldedAddress.slice(0, 14)}…
                    </p>
                    {REGISTRY_ADDRESS ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button onClick={doPublish} disabled={publishing}>
                          {publishing ? "PUBLISHING…" : "ANCHOR RECEIPT ON-CHAIN →"}
                        </Button>
                        <Link href="/verify">
                          <Button variant="outline">VERIFY A RECEIPT</Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <p className="mb-3 font-mono text-xs text-sev-medium">
                          Registry not deployed yet. Deploy it once (admin) — fees are covered by 1AM.
                        </p>
                        <Button onClick={doDeploy} disabled={deploying}>
                          {deploying ? "DEPLOYING…" : "DEPLOY REGISTRY (ONE-TIME) →"}
                        </Button>
                      </div>
                    )}
                    {deployedAddr && (
                      <div className="mt-4 space-y-1">
                        <p className="font-mono text-xs text-sev-info">✅ Registry deployed.</p>
                        <pre className="overflow-x-auto rounded-sm border border-grid-border bg-grid-bg p-3 font-mono text-[11px] text-grid-text-2">
NEXT_PUBLIC_REGISTRY_ADDRESS={deployedAddr}
                        </pre>
                        <p className="font-mono text-[11px] text-grid-text-3">
                          Set this in the server env and redeploy to switch on receipts.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {chainError && (
                  <pre className="mt-4 overflow-x-auto rounded-sm border border-grid-border bg-grid-bg p-3 font-mono text-xs text-sev-critical">
                    {chainError}
                  </pre>
                )}

                {receipt && (
                  <div className="mt-4 space-y-2">
                    <p className="font-mono text-xs text-sev-info">✅ Receipt anchored on-chain.</p>
                    <pre className="overflow-x-auto rounded-sm border border-grid-border bg-grid-bg p-3 font-mono text-[11px] text-grid-text-2">
{JSON.stringify(receipt, null, 2)}
                    </pre>
                    <Button variant="outline" onClick={downloadReceipt}>
                      DOWNLOAD RECEIPT
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
