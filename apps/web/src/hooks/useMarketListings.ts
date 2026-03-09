import { useState, useEffect } from "react";
import { callReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

const POLL_INTERVAL_MS = 5_000;

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

export interface NftListing {
  bondId: number;
  tokenType: "PT" | "YT";
  seller: string;
  priceSats: bigint;
}

export interface MarketListings {
  nftListings: NftListing[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function parseListing(raw: Record<string, { value: unknown }>) {
  return {
    seller: String(raw["seller"]!.value),
    priceSats: BigInt(String(raw["price-sats"]!.value)),
  };
}

export function useMarketListings(): MarketListings {
  const [nftListings, setNftListings] = useState<NftListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    const { contractAddress: bfCA, contractName: bfCN } = parseContractId(CONTRACT_ADDRESSES.bondFactory);
    const { contractAddress: mktCA, contractName: mktCN } = parseContractId(CONTRACT_ADDRESSES.market);
    if (!mktCA || !mktCN) return;

    const senderAddress = bfCA; // arbitrary valid address for read-only calls

    async function load() {
      try {
        const bondCountRes = await callReadOnlyFunction({
          contractAddress: bfCA,
          contractName: bfCN,
          functionName: "get-bond-count",
          functionArgs: [],
          network: stacksNetwork,
          senderAddress,
        });

        const bondCount = Number((cvToValue(bondCountRes) as { value: string }).value);
        const bondIds = Array.from({ length: bondCount }, (_, i) => i);

        const [ptListingResults, ytListingResults] = await Promise.all([
          // NFT PT listings -- one per bond
          Promise.all(bondIds.map((id) =>
            callReadOnlyFunction({
              contractAddress: mktCA, contractName: mktCN,
              functionName: "get-pt-listing", functionArgs: [uintCV(id)],
              network: stacksNetwork, senderAddress,
            })
          )),
          // NFT YT listings
          Promise.all(bondIds.map((id) =>
            callReadOnlyFunction({
              contractAddress: mktCA, contractName: mktCN,
              functionName: "get-yt-listing", functionArgs: [uintCV(id)],
              network: stacksNetwork, senderAddress,
            })
          )),
        ]);

        const nft: NftListing[] = [];
        bondIds.forEach((bondId, i) => {
          const ptRaw = cvToValue(ptListingResults[i]!) as { value: Record<string, { value: unknown }> } | null;
          if (ptRaw?.value) {
            const { seller, priceSats } = parseListing(ptRaw.value);
            nft.push({ bondId, tokenType: "PT", seller, priceSats });
          }
          const ytRaw = cvToValue(ytListingResults[i]!) as { value: Record<string, { value: unknown }> } | null;
          if (ytRaw?.value) {
            const { seller, priceSats } = parseListing(ytRaw.value);
            nft.push({ bondId, tokenType: "YT", seller, priceSats });
          }
        });

        setNftListings(nft);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load listings");
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tick]);

  return { nftListings, loading, error, refetch };
}
