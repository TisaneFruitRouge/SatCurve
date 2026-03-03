import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue, uintCV, principalCV } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { Bond } from "@satcurve/types";

const POLL_INTERVAL_MS = 5_000;
const NFT_PAGE_LIMIT = 200;

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

interface NftHoldingsResponse {
  results: Array<{ value: { repr: string } }>;
}

/** Fetch all NFT token IDs held by `principal` for a given asset identifier. */
async function fetchNftBondIds(
  apiUrl: string,
  principal: string,
  assetIdentifier: string,
): Promise<Set<number>> {
  const url = `${apiUrl}/extended/v1/tokens/nft/holdings?principal=${encodeURIComponent(principal)}&asset_identifiers=${encodeURIComponent(assetIdentifier)}&limit=${NFT_PAGE_LIMIT}`;
  console.log("[useBonds] fetching NFT holdings:", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NFT holdings fetch failed: ${res.status}`);
  const data = (await res.json()) as NftHoldingsResponse;
  console.log("[useBonds] NFT holdings response:", JSON.stringify(data));
  const ids = new Set<number>();
  for (const item of data.results) {
    // repr looks like "u42" — strip the leading "u"
    const id = parseInt(item.value.repr.slice(1), 10);
    if (!isNaN(id)) ids.add(id);
  }
  return ids;
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

    const apiUrl = stacksNetwork.coreApiUrl;
    const ptAsset = `${contractAddress}.${contractName}::principal-token`;
    const ytAsset = `${contractAddress}.${contractName}::yield-token`;

    setLoading(true);

    async function load() {
      try {
        // Sanity check: how many bonds exist on-chain at all?
        const countRes = await callReadOnlyFunction({
          contractAddress, contractName,
          functionName: "get-bond-count",
          functionArgs: [],
          network: stacksNetwork,
          senderAddress: address!,
        });
        const totalOnChain = Number((cvToValue(countRes) as { value: string }).value);
        console.log("[useBonds] get-bond-count =", totalOnChain);

        // Fetch PT and YT holdings in parallel — user may hold either or both
        const [ptIds, ytIds] = await Promise.all([
          fetchNftBondIds(apiUrl, address!, ptAsset),
          fetchNftBondIds(apiUrl, address!, ytAsset),
        ]);

        // Union of all bond IDs the user has any stake in
        const allIds = Array.from(new Set([...ptIds, ...ytIds])).sort(
          (a, b) => a - b,
        );

        if (allIds.length === 0) {
          setBonds([]);
          setError(null);
          setLoading(false);
          return;
        }

        // Fetch bond data for every relevant ID in parallel
        const bondDataResults = await Promise.all(
          allIds.map((id) =>
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

        const parsedBonds: Bond[] = allIds.map((id, i) => {
          // cvToValue(ResponseOkCV(TupleCV)) in @stacks/transactions@6.17.0 returns:
          // { type: "tuple", value: { "sbtc-amount": { type: "uint", value: "n" }, ... } }
          const wrapper = cvToValue(bondDataResults[i]!) as {
            value: Record<string, { value: unknown }>;
          };
          const f = wrapper.value;
          console.log("[useBonds] get-bond raw:", JSON.stringify(wrapper));
          return {
            tokenId: BigInt(id),
            owner: address!,
            sbtcAmount: BigInt(String(f["sbtc-amount"]!.value)),
            maturityBlock: Number(f["maturity-block"]!.value),
            createdBlock: Number(f["created-block"]!.value),
            principalRedeemed: Boolean(f["principal-redeemed"]!.value),
            combined: Boolean(f["combined"]!.value),
            yieldDeposited: BigInt(String(f["yield-deposited"]!.value)),
            yieldWithdrawn: BigInt(String(f["yield-withdrawn"]!.value)),
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
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [address, tick]);

  return { bonds, loading, error, refetch };
}
