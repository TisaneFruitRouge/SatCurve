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

export interface FtListing {
  listingId: number;
  seller: string;
  amount: bigint;
  priceSats: bigint;
}

export interface MarketListings {
  nftListings: NftListing[];
  vaultPtListings: FtListing[];
  vaultYtListings: FtListing[];
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

function parseFtListing(raw: Record<string, { value: unknown }>) {
  return {
    seller: String(raw["seller"]!.value),
    amount: BigInt(String(raw["amount"]!.value)),
    priceSats: BigInt(String(raw["price-sats"]!.value)),
  };
}

export function useMarketListings(): MarketListings {
  const [nftListings, setNftListings] = useState<NftListing[]>([]);
  const [vaultPtListings, setVaultPtListings] = useState<FtListing[]>([]);
  const [vaultYtListings, setVaultYtListings] = useState<FtListing[]>([]);
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
        // Fetch bond-factory bond count and market ft-nonce in parallel
        const [bondCountRes, ftNonceRes] = await Promise.all([
          callReadOnlyFunction({
            contractAddress: bfCA,
            contractName: bfCN,
            functionName: "get-bond-count",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnlyFunction({
            contractAddress: mktCA,
            contractName: mktCN,
            functionName: "get-ft-nonce",
            functionArgs: [],
            network: stacksNetwork,
            senderAddress,
          }),
        ]);

        const bondCount = Number((cvToValue(bondCountRes) as { value: string }).value);
        const ftNonce   = Number((cvToValue(ftNonceRes) as unknown as bigint));

        // Build arrays of parallel read-only calls
        const bondIds = Array.from({ length: bondCount }, (_, i) => i);
        const ftIds   = Array.from({ length: ftNonce   }, (_, i) => i + 1);

        const [ptListingResults, ytListingResults, vaultPtResults, vaultYtResults] = await Promise.all([
          // NFT PT listings — one per bond
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
          // Vault PT FT listings
          Promise.all(ftIds.map((id) =>
            callReadOnlyFunction({
              contractAddress: mktCA, contractName: mktCN,
              functionName: "get-vault-pt-listing", functionArgs: [uintCV(id)],
              network: stacksNetwork, senderAddress,
            })
          )),
          // Vault YT FT listings
          Promise.all(ftIds.map((id) =>
            callReadOnlyFunction({
              contractAddress: mktCA, contractName: mktCN,
              functionName: "get-vault-yt-listing", functionArgs: [uintCV(id)],
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

        const vPt: FtListing[] = [];
        const vYt: FtListing[] = [];
        ftIds.forEach((listingId, i) => {
          const ptRaw = cvToValue(vaultPtResults[i]!) as { value: Record<string, { value: unknown }> } | null;
          if (ptRaw?.value) {
            const { seller, amount, priceSats } = parseFtListing(ptRaw.value);
            vPt.push({ listingId, seller, amount, priceSats });
          }
          const ytRaw = cvToValue(vaultYtResults[i]!) as { value: Record<string, { value: unknown }> } | null;
          if (ytRaw?.value) {
            const { seller, amount, priceSats } = parseFtListing(ytRaw.value);
            vYt.push({ listingId, seller, amount, priceSats });
          }
        });

        setNftListings(nft);
        setVaultPtListings(vPt);
        setVaultYtListings(vYt);
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

  return { nftListings, vaultPtListings, vaultYtListings, loading, error, refetch };
}
