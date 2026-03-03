import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  showConnect,
  disconnect as stacksDisconnect,
  getUserData,
  type UserSession,
} from "@stacks/connect";

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function pickAddress(profile: Record<string, unknown>): string | null {
  const stxAddress = profile?.stxAddress as Record<string, string> | undefined;
  if (!stxAddress) return null;
  return import.meta.env.VITE_STACKS_NETWORK === "mainnet"
    ? (stxAddress["mainnet"] ?? null)
    : (stxAddress["testnet"] ?? null);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    void getUserData().then((data) => {
      if (data) setAddress(pickAddress(data.profile as Record<string, unknown> ?? {}));
    });
  }, []);

  const connect = useCallback(() => {
    showConnect({
      appDetails: { name: "SatCurve", icon: "/logo.svg" },
      onFinish: ({ userSession }: { userSession: UserSession }) => {
        const data = userSession.loadUserData();
        setAddress(pickAddress(data.profile as Record<string, unknown> ?? {}));
      },
      onCancel: () => {},
    });
  }, []);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, isConnected: address !== null, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}
