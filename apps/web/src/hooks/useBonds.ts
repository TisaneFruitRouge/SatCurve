import { useState, useEffect } from "react";
import { cvToValue, uintCV } from "@stacks/transactions";
import { callReadOnly } from "../lib/rpc";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { Bond } from "@satcurve/types";

const POLL_INTERVAL_MS = 30_000;
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NFT holdings fetch failed: ${res.status}`);
  const data = (await res.json()) as NftHoldingsResponse;
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

    const { contractAddress: mktCA, contractName: mktCN } = parseContractId(
      CONTRACT_ADDRESSES.market,
    );

    const apiUrl = stacksNetwork.coreApiUrl;
    const ptAsset = `${contractAddress}.${contractName}::principal-token`;
    const ytAsset = `${contractAddress}.${contractName}::yield-token`;

    setLoading(true);

    async function load() {
      try {
        // Fetch PT and YT holdings + bond count in parallel
        const [ptIds, ytIds, bondCountRes] = await Promise.all([
          fetchNftBondIds(apiUrl, address!, ptAsset),
          fetchNftBondIds(apiUrl, address!, ytAsset),
          callReadOnly({
            contractAddress,
            contractName,
            functionName: "get-bond-count",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress: address!,
          }),
        ]);

        // Check market listings — bonds whose NFTs are escrowed (both PT and YT listed)
        // would otherwise disappear from the user's portfolio entirely.
        const bondCount = Number(
          (cvToValue(bondCountRes) as { value: string }).value,
        );
        const bondIdsRange = Array.from({ length: bondCount }, (_, i) => i);

        const [ptListingResults, ytListingResults] = await Promise.all([
          Promise.all(
            bondIdsRange.map((id) =>
              callReadOnly({
                contractAddress: mktCA,
                contractName: mktCN,
                functionName: "get-pt-listing",
                functionArgs: [uintCV(id)],
                network: stacksNetwork,
                senderAddress: address!,
              }),
            ),
          ),
          Promise.all(
            bondIdsRange.map((id) =>
              callReadOnly({
                contractAddress: mktCA,
                contractName: mktCN,
                functionName: "get-yt-listing",
                functionArgs: [uintCV(id)],
                network: stacksNetwork,
                senderAddress: address!,
              }),
            ),
          ),
        ]);

        const ptListedIds = new Set<number>();
        const ytListedIds = new Set<number>();
        bondIdsRange.forEach((id, i) => {
          const ptRaw = cvToValue(ptListingResults[i]!) as {
            value: Record<string, { value: unknown }>;
          } | null;
          if (ptRaw?.value && String(ptRaw.value["seller"]!.value) === address) {
            ptListedIds.add(id);
          }
          const ytRaw = cvToValue(ytListingResults[i]!) as {
            value: Record<string, { value: unknown }>;
          } | null;
          if (ytRaw?.value && String(ytRaw.value["seller"]!.value) === address) {
            ytListedIds.add(id);
          }
        });

        // Union: directly held + listed on market (escrowed)
        const allIds = Array.from(
          new Set([...ptIds, ...ytIds, ...ptListedIds, ...ytListedIds]),
        ).sort((a, b) => a - b);

        if (allIds.length === 0) {
          setBonds([]);
          setError(null);
          setLoading(false);
          return;
        }

        // Fetch bond data for every relevant ID in parallel
        const bondDataResults = await Promise.all(
          allIds.map((id) =>
            callReadOnly({
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
            holdsPt: ptIds.has(id),
            holdsYt: ytIds.has(id),
            ptListed: ptListedIds.has(id),
            ytListed: ytListedIds.has(id),
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
