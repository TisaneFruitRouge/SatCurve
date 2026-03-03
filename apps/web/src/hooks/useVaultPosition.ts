import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue, principalCV } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { PoolPosition } from "@satcurve/types";

const POLL_INTERVAL_MS = 5_000;

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

interface UseVaultPositionResult {
  position: PoolPosition | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useVaultPosition(address: string | null): UseVaultPositionResult {
  const [position, setPosition] = useState<PoolPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!address) {
      setPosition(null);
      return;
    }

    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.vaultEngine
    );
    if (!contractAddress || !contractName) return;

    setLoading(true);

    async function load() {
      try {
        const userPrincipal = principalCV(address!);
        const [ptRes, ytRes, claimRes] = await Promise.all([
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-pt-balance",
            functionArgs: [userPrincipal],
            network: stacksNetwork,
            senderAddress: address!,
          }),
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-yt-balance",
            functionArgs: [userPrincipal],
            network: stacksNetwork,
            senderAddress: address!,
          }),
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-claimable-yield",
            functionArgs: [userPrincipal],
            network: stacksNetwork,
            senderAddress: address!,
          }),
        ]);

        setPosition({
          address: address!,
          ptBalance: BigInt(String(cvToValue(ptRes, true))),
          ytBalance: BigInt(String(cvToValue(ytRes, true))),
          claimableYield: BigInt(String(cvToValue(claimRes, true))),
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load position");
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => { void load(); }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [address, tick]);

  return { position, loading, error, refetch };
}
