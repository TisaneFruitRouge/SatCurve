import { Link } from "@tanstack/react-router";
import { openContractCall } from "@stacks/connect";
import { uintCV, PostConditionMode } from "@stacks/transactions";
import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { useMarketListings } from "../hooks/useMarketListings";
import { TxButton } from "../components/TxButton";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import { formatSats } from "../lib/format";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { NftListing } from "../hooks/useMarketListings";

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function MarketPage() {
  const { address, isConnected } = useWallet();
  const { nftListings, loading, error, refetch } = useMarketListings();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function callMarket(
    functionName: string,
    args: ReturnType<typeof uintCV>[],
    id: string,
  ) {
    const { contractAddress, contractName } = parseContractId(CONTRACT_ADDRESSES.market);
    setPendingId(id);
    void openContractCall({
      contractAddress,
      contractName,
      functionName,
      functionArgs: args,
      network: stacksNetwork,
      postConditionMode: PostConditionMode.Allow,
      onFinish: () => { setPendingId(null); refetch(); },
      onCancel: () => setPendingId(null),
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Market</h1>
        <p className="text-sm text-text-muted mt-1">
          Fixed-price P2P listings for PT and YT tokens.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full bg-surface" />
          <Skeleton className="h-20 w-full bg-surface" />
        </div>
      ) : error ? (
        <Card className="bg-surface border-border">
          <CardContent className="pt-6 space-y-2">
            <p className="text-error text-sm">{error}</p>
            <button onClick={refetch} className="text-xs text-text-muted underline hover:text-text">
              Retry
            </button>
          </CardContent>
        </Card>
      ) : nftListings.length === 0 ? (
          <Card className="bg-surface border-border">
            <CardContent className="pt-6">
              <p className="text-text-muted text-sm">No NFT bond listings right now.</p>
              <p className="text-text-faint text-xs mt-1">
                Go to a{" "}
                <Link to="/bonds" className="underline hover:text-text">
                  bond detail page
                </Link>{" "}
                to list your PT or YT for sale.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {nftListings.map((listing: NftListing) => {
              const id = `nft-${listing.tokenType}-${listing.bondId}`;
              const fnBuy = listing.tokenType === "PT" ? "buy-pt" : "buy-yt";
              const isSelf = address === listing.seller;
              return (
                <Card key={id} className="bg-surface border-border">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge
                          variant="outline"
                          className={
                            listing.tokenType === "PT"
                              ? "border-brand/40 text-brand"
                              : "border-success/40 text-success"
                          }
                        >
                          {listing.tokenType}
                        </Badge>
                        <Link
                          to="/bonds/$bondId"
                          params={{ bondId: String(listing.bondId) }}
                          className="text-sm font-medium hover:text-brand transition-colors"
                        >
                          Bond #{String(listing.bondId).padStart(3, "0")}
                        </Link>
                        <span className="text-xs text-text-faint hidden sm:block">
                          {isSelf ? "Your listing" : `by ${shortAddress(listing.seller)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-sm font-semibold">
                          {formatSats(listing.priceSats)} sBTC
                        </span>
                        {!isSelf && isConnected && (
                          <TxButton
                            variant="outline"
                            size="sm"
                            pending={pendingId === id}
                            onClick={() =>
                              callMarket(fnBuy, [uintCV(listing.bondId)], id)
                            }
                            className={
                              listing.tokenType === "PT"
                                ? "border-brand text-brand hover:bg-brand/10"
                                : "border-success text-success hover:bg-success/10"
                            }
                          >
                            Buy
                          </TxButton>
                        )}
                        {isSelf && (
                          <Link
                            to="/bonds/$bondId"
                            params={{ bondId: String(listing.bondId) }}
                            className="text-xs text-text-muted underline hover:text-text"
                          >
                            Manage
                          </Link>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      }
    </div>
  );
}
