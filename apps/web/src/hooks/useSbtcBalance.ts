import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue, principalCV } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

const POLL_INTERVAL_MS = 10_000;

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

interface UseSbtcBalanceResult {
  balance: bigint | null;
  loading: boolean;
  error: string | null;
}

export function useSbtcBalance(address: string | null): UseSbtcBalanceResult {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }

    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.sbtcToken,
    );
    if (!contractAddress || !contractName) return;

    setLoading(true);

    async function load() {
      try {
        const res = await callReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: "get-balance-available",
          functionArgs: [principalCV(address!)],
          network: stacksNetwork,
          senderAddress: address!,
        });
        // cvToValue on ResponseOkCV calls cvToJSON internally, which wraps the
        // inner value as { type: string; value: string } — so we read .value
        const parsed = cvToValue(res) as { value: string };
        setBalance(BigInt(parsed.value));
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[useSbtcBalance] fetch failed:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [address]);

  return { balance, loading, error };
}
