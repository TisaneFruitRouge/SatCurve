import { useWallet } from "../providers/WalletProvider";
import { useSbtcBalance } from "../hooks/useSbtcBalance";
import { formatSats } from "../lib/format";
import { Button } from "./ui/button";

export function WalletConnectButton() {
  const { address, isConnected, connect, disconnect } = useWallet();
  const { balance, error: balanceError } = useSbtcBalance(isConnected ? address : null);

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span
          className={`text-sm font-mono ${balanceError ? "text-error" : "text-text-muted"}`}
          title={balanceError ?? undefined}
        >
          {balanceError ? "API error" : (balance !== null ? formatSats(balance) : "…")} sBTC
        </span>
        <Button variant="outline" size="sm" onClick={disconnect}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={connect}
      className="bg-brand text-primary-foreground font-semibold hover:bg-brand-hover"
    >
      Connect Wallet
    </Button>
  );
}
