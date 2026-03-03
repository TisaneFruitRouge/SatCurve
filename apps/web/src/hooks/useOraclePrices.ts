import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

function parseContractId(fullAddress: string): {
  contractAddress: string;
  contractName: string;
} {
  const parts = fullAddress.split(".");
  return {
    contractAddress: parts[0] ?? "",
    contractName: parts[1] ?? "",
  };
}

interface OraclePrices {
  btcPriceUsd: bigint | null;
  stackingAprBps: bigint | null;
  loading: boolean;
  error: string | null;
}

export function useOraclePrices(): OraclePrices {
  const [state, setState] = useState<OraclePrices>({
    btcPriceUsd: null,
    stackingAprBps: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.yieldOracle
    );
    if (!contractAddress || !contractName) {
      setState((s) => ({
        ...s,
        loading: false,
        error: "Oracle address not configured",
      }));
      return;
    }

    async function load() {
      try {
        const [btcRes, aprRes] = await Promise.all([
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-btc-price",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress: contractAddress,
          }),
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-stacking-apr",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress: contractAddress,
          }),
        ]);
        setState({
          btcPriceUsd: BigInt(String(cvToValue(btcRes, true))),
          stackingAprBps: BigInt(String(cvToValue(aprRes, true))),
          loading: false,
          error: null,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load oracle data",
        }));
      }
    }

    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, []);

  return state;
}
