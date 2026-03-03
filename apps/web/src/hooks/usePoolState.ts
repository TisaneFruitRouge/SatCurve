import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { PoolState } from "@satcurve/types";

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

interface UsePoolStateResult {
  poolState: PoolState | null;
  loading: boolean;
  error: string | null;
}

export function usePoolState(): UsePoolStateResult {
  const [state, setState] = useState<UsePoolStateResult>({
    poolState: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.vaultEngine
    );
    if (!contractAddress || !contractName) {
      setState({ poolState: null, loading: false, error: "Vault engine address not configured" });
      return;
    }

    async function load() {
      try {
        const [maturityRes, ptSupplyRes, ytSupplyRes, indexRes] =
          await Promise.all([
            callReadOnlyFunction({
              contractAddress,
              contractName,
              functionName: "get-maturity-block",
              functionArgs: [],
              network: stacksNetwork,
              senderAddress: contractAddress,
            }),
            callReadOnlyFunction({
              contractAddress,
              contractName,
              functionName: "get-pt-total-supply",
              functionArgs: [],
              network: stacksNetwork,
              senderAddress: contractAddress,
            }),
            callReadOnlyFunction({
              contractAddress,
              contractName,
              functionName: "get-yt-total-supply",
              functionArgs: [],
              network: stacksNetwork,
              senderAddress: contractAddress,
            }),
            callReadOnlyFunction({
              contractAddress,
              contractName,
              functionName: "get-yield-index",
              functionArgs: [],
              network: stacksNetwork,
              senderAddress: contractAddress,
            }),
          ]);

        const ptSupply = BigInt(String(cvToValue(ptSupplyRes, true)));

        const poolState: PoolState = {
          maturityBlock: Number(cvToValue(maturityRes, true)),
          ptTotalSupply: ptSupply,
          ytTotalSupply: BigInt(String(cvToValue(ytSupplyRes, true))),
          yieldIndex: BigInt(String(cvToValue(indexRes, true))),
          totalEscrowed: ptSupply,
        };

        setState({ poolState, loading: false, error: null });
      } catch (err) {
        setState({
          poolState: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load pool state",
        });
      }
    }

    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, []);

  return state;
}
