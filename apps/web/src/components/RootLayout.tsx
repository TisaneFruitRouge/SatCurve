import { Link } from "@tanstack/react-router";
import { WalletConnectButton } from "./WalletConnectButton";
import type { ReactNode } from "react";

const STACKS_NETWORK = import.meta.env.VITE_STACKS_NETWORK ?? "devnet";

const NAV_LINKS = [
  { to: "/" as const, label: "Dashboard" },
  { to: "/bonds" as const, label: "Bonds" },
  { to: "/market" as const, label: "Market" },
];

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-surface/80 backdrop-blur border-b border-border">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-xl font-bold text-brand tracking-tight">
              SatCurve
            </Link>
            {STACKS_NETWORK !== "mainnet" && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {STACKS_NETWORK}
              </span>
            )}
          </div>
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-sm text-text-muted hover:text-text transition-colors [&.active]:text-brand [&.active]:border-b [&.active]:border-brand pb-0.5"
            >
              {label}
            </Link>
          ))}
        </div>
        <WalletConnectButton />
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
