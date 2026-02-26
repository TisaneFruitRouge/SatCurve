import { Link } from "@tanstack/react-router";
import { WalletConnectButton } from "./WalletConnectButton";

export function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-xl font-bold text-[#f7931a]">
            SatCurve
          </Link>
          <Link
            to="/vault"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Vaults
          </Link>
          <Link
            to="/bonds"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Bonds
          </Link>
        </div>
        <WalletConnectButton />
      </nav>
      <main>{children}</main>
    </div>
  );
}
