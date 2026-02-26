import { showConnect, disconnect, getUserData } from "@stacks/connect";
import { useState, useEffect } from "react";

export function WalletConnectButton() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    getUserData().then((data) => {
      if (data) setAddress(data.profile?.stxAddress?.mainnet ?? null);
    });
  }, []);

  if (address) {
    return (
      <button
        onClick={() => {
          disconnect();
          setAddress(null);
        }}
        className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/10 transition"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() =>
        showConnect({
          appDetails: { name: "SatCurve", icon: "/logo.svg" },
          onFinish: ({ userSession }) => {
            const data = userSession.loadUserData();
            setAddress(data.profile?.stxAddress?.mainnet ?? null);
          },
          onCancel: () => {},
        })
      }
      className="px-4 py-2 rounded-lg bg-[#f7931a] text-black font-semibold text-sm hover:bg-[#e8820a] transition"
    >
      Connect Wallet
    </button>
  );
}
