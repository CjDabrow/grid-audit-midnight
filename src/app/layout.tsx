import type { Metadata } from "next";
import Link from "next/link";
import { BracketLabel } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grid Audit · Midnight",
  description:
    "Free security checks for Midnight apps: smart contracts, proof servers, and app code.",
};

function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-grid-border bg-grid-bg/90 backdrop-blur"
      style={{ height: "var(--nav-h)" }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-pixel text-sm text-grid-text">GRID</span>
          <BracketLabel>MIDNIGHT</BracketLabel>
        </Link>
        <div className="flex items-center gap-6 font-mono text-xs tracking-widest text-grid-text-2">
          <Link href="/" className="hover:text-grid-accent">
            OVERVIEW
          </Link>
          <Link href="/verify" className="hover:text-grid-accent">
            VERIFY
          </Link>
          <Link href="/audit" className="hover:text-grid-accent">
            AUDIT →
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-grid-border py-8">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-2 px-6 font-mono text-xs text-grid-text-3 md:flex-row">
        <span>© 2026 Grid Audit · Midnight</span>
        <span>Private by default · audits run in your browser</span>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
