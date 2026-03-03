import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

const POLL_INTERVAL_MS = 60_000; // oracle updates once per PoX cycle (~2 weeks), 1-min poll is fine

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

export interface YieldOracleData {
  /** Stacking APR in basis points (1 bps = 0.01%). e.g. 800 = 8.00% */
  aprBps: number;
  /** BTC/USD price in $0.000001 units. e.g. 95_000_000_000 = $95,000 */
  btcUsdPrice: number;
}

interface UseYieldOracleResult {
  oracle: YieldOracleData | null;
  loading: boolean;
}

export function useYieldOracle(): UseYieldOracleResult {
  const [oracle, setOracle] = useState<YieldOracleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.yieldOracle,
    );
    if (!contractAddress || !contractName) return;

    async function load() {
      try {
        // Use get-stacking-apr and get-btc-price (non-reverting) rather than
        // the trusted variants, so the UI still shows estimates even when data
        // is slightly stale.
        const [aprRes, btcRes] = await Promise.all([
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-stacking-apr",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress: contractAddress,
          }),
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-btc-price",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress: contractAddress,
          }),
        ]);

        // Both functions return (ok uint).
        // cvToValue(ResponseOkCV(UIntCV)) → { type: "uint", value: "n" }
        const aprRaw = cvToValue(aprRes) as { value: string };
        const btcRaw = cvToValue(btcRes) as { value: string };

        const aprBps = Number(aprRaw.value);
        const btcUsdPrice = Number(btcRaw.value);

        // Only update if we got sensible values (btc price must be > 0)
        if (btcUsdPrice > 0) {
          setOracle({ aprBps, btcUsdPrice });
        }
      } catch {
        // Oracle unavailable — leave previous value in place so UI degrades gracefully
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return { oracle, loading };
}
