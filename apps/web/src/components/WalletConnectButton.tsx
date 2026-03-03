import { useWallet } from "../providers/WalletProvider";
import { Button } from "./ui/button";

export function WalletConnectButton() {
  const { address, isConnected, connect, disconnect } = useWallet();

  if (isConnected && address) {
    return (
      <Button variant="outline" size="sm" onClick={disconnect}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </Button>
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
