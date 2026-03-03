import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { Bond } from "@satcurve/types";

const POLL_INTERVAL_MS = 5_000;

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

interface UseBondsResult {
  bonds: Bond[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBonds(address: string | null): UseBondsResult {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!address) {
      setBonds([]);
      return;
    }

    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.bondFactory,
    );
    if (!contractAddress || !contractName) return;

    setLoading(true);

    async function load() {
      try {
        // Step 1: get total bond count
        const countRes = await callReadOnlyFunction({
          contractAddress,
          contractName,
          functionName: "get-bond-count",
          functionArgs: [],
          network: stacksNetwork,
          senderAddress: address!,
        });
        const totalBonds = Number(cvToValue(countRes, true));

        if (totalBonds === 0) {
          setBonds([]);
          setLoading(false);
          return;
        }

        // Step 2: check PT owner for every bond ID in parallel
        const allIds = Array.from({ length: totalBonds }, (_, i) => i);
        const ownerResults = await Promise.all(
          allIds.map((id) =>
            callReadOnlyFunction({
              contractAddress,
              contractName,
              functionName: "get-pt-owner",
              functionArgs: [uintCV(id)],
              network: stacksNetwork,
              senderAddress: address!,
            }),
          ),
        );

        // get-pt-owner returns (optional principal) — cvToValue returns string or null
        const myIds = allIds.filter((id) => {
          const owner = cvToValue(ownerResults[id]!, true);
          return owner === address;
        });

        if (myIds.length === 0) {
          setBonds([]);
          setLoading(false);
          return;
        }

        // Step 3: load bond data for matching IDs in parallel
        const bondDataResults = await Promise.all(
          myIds.map((id) =>
            callReadOnlyFunction({
              contractAddress,
              contractName,
              functionName: "get-bond",
              functionArgs: [uintCV(id)],
              network: stacksNetwork,
              senderAddress: address!,
            }),
          ),
        );

        const parsedBonds: Bond[] = myIds.map((id, i) => {
          const raw = cvToValue(bondDataResults[i]!, true) as Record<
            string,
            unknown
          >;
          return {
            tokenId: BigInt(id),
            owner: address!,
            sbtcAmount: BigInt(String(raw["sbtc-amount"])),
            maturityBlock: Number(raw["maturity-block"]),
            createdBlock: Number(raw["created-block"]),
            principalRedeemed: Boolean(raw["principal-redeemed"]),
            combined: Boolean(raw["combined"]),
            yieldDeposited: BigInt(String(raw["yield-deposited"])),
            yieldWithdrawn: BigInt(String(raw["yield-withdrawn"])),
          };
        });

        setBonds(parsedBonds);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bonds");
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [address, tick]);

  return { bonds, loading, error, refetch };
}
