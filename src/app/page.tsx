import Link from "next/link";
import { BracketLabel, Button, Card, SectionLabel } from "@/components/ui";

const PILLARS = [
  {
    t: "Smart Contracts",
    d: "Bugs that let someone bypass your access checks, leak private data, replay a transaction, or get the math wrong. The mistakes that are unique to Compact.",
  },
  {
    t: "Proof Servers",
    d: "Your proof server sees users' private data in the clear, so it has to run on their own machine. We flag setups that send it to a remote or shared server.",
  },
  {
    t: "App &amp; SDK Code",
    d: "The code around your contract: secret keys ending up in logs, private data sent to the wrong place, and wallet handling that leaks.",
  },
];

const PROCESS = [
  ["01", "Paste", "Drop in your contract, proof-server config, or app code."],
  ["02", "Analyze", "We check for the known Midnight bugs and point you to the exact line."],
  ["03", "Report", "Clear findings, ranked by severity, each with a fix you can act on."],
  ["04", "Certify", "Optionally save a tamper-proof receipt of the audit on-chain."],
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-[1200px] px-6">
      {/* hero */}
      <section className="py-20 md:py-28">
        <BracketLabel>MIDNIGHT VERTICAL</BracketLabel>
        <h1 className="mt-5 max-w-3xl font-bold leading-tight tracking-tight" style={{ fontSize: "clamp(30px, 3.6vw, 48px)" }}>
          Security checks for privacy-first Midnight apps.
        </h1>
        <p className="mt-6 max-w-2xl font-sans text-lg text-grid-text-2">
          Privacy tech doesn&apos;t mean bug-free. Grid checks the things that make or break a Midnight
          app: what your <span className="text-grid-text">contract</span> actually reveals, whether
          your <span className="text-grid-text">proof server</span> leaks private data, and how your{" "}
          <span className="text-grid-text">app code</span> handles secrets.
        </p>
        <div className="mt-9 flex gap-4">
          <Link href="/audit">
            <Button>AUDIT MY CONTRACT →</Button>
          </Link>
          <a href="#coverage">
            <Button variant="outline">WHAT WE REVIEW</Button>
          </a>
        </div>
      </section>

      {/* why */}
      <section className="border-t border-grid-border py-16">
        <SectionLabel num="01" label="Why this matters" />
        <h2 className="max-w-3xl text-3xl font-semibold md:text-4xl">Private by default is not safe by default.</h2>
        <p className="mt-5 max-w-2xl font-sans text-grid-text-2">
          Midnight keeps your data private unless you explicitly <code className="font-mono text-grid-accent">disclose()</code>{" "}
          it, but the compiler only stops <em>accidental</em> leaks. It won&apos;t catch an access check
          that anyone can bypass, a secret value that can be guessed, or a proof server quietly pointed at
          a remote host. Those are the bugs that drain funds and expose users.
        </p>
      </section>

      {/* coverage */}
      <section id="coverage" className="border-t border-grid-border py-16">
        <SectionLabel num="02" label="Coverage" />
        <h2 className="mb-10 max-w-2xl text-3xl font-semibold md:text-4xl">What Grid reviews</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <Card key={p.t}>
              <h3 className="text-lg font-semibold text-grid-text">{p.t}</h3>
              <p className="mt-3 font-sans text-sm text-grid-text-2">{p.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* process */}
      <section className="border-t border-grid-border py-16">
        <SectionLabel num="03" label="Process" />
        <h2 className="mb-10 max-w-2xl text-3xl font-semibold md:text-4xl">How an audit runs</h2>
        <div className="grid gap-5 md:grid-cols-4">
          {PROCESS.map(([n, t, d]) => (
            <Card key={n}>
              <span className="font-mono text-xs text-grid-accent">{n}</span>
              <h3 className="mt-2 font-semibold text-grid-text">{t}</h3>
              <p className="mt-2 font-sans text-sm text-grid-text-2">{d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="border-t border-grid-border py-20 text-center">
        <h2 className="text-3xl font-semibold md:text-4xl">Audit your Midnight contract now.</h2>
        <p className="mt-4 font-sans text-grid-text-2">
          Free and instant. It runs in your browser, and nothing is uploaded.
        </p>
        <div className="mt-8 flex justify-center">
          <Link href="/audit">
            <Button>AUDIT MY CONTRACT →</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
