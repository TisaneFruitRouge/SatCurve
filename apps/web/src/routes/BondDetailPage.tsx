import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { openContractCall } from "@stacks/connect";
import { cvToValue, uintCV, PostConditionMode } from "@stacks/transactions";
import { callReadOnly } from "../lib/rpc";
import { useWallet } from "../hooks/useWallet";
import { useBlockHeight } from "../hooks/useBlockHeight";
import { BlockTooltip } from "../components/BlockTooltip";
import { TxButton } from "../components/TxButton";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import { formatSats, formatUsd } from "../lib/format";
import { computeBondValuation, computeImpliedRate } from "../lib/bondValuation";
import { useYieldOracle } from "../hooks/useYieldOracle";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import type { Bond } from "@satcurve/types";

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

type BondStatus = "active" | "matured" | "combined" | "redeemed";

function getBondStatus(bond: Bond, currentBlock: number): BondStatus {
  if (bond.combined) return "combined";
  if (bond.principalRedeemed) return "redeemed";
  if (currentBlock >= bond.maturityBlock) return "matured";
  return "active";
}

const STATUS_BADGE: Record<BondStatus, { label: string; className: string }> = {
  active:   { label: "Active",   className: "border-success text-success" },
  matured:  { label: "Matured",  className: "border-brand text-brand" },
  combined: { label: "Combined", className: "border-text-faint text-text-faint" },
  redeemed: { label: "Redeemed", className: "border-text-faint text-text-faint" },
};

export function BondDetailPage() {
  const params = useParams({ strict: false });
  const bondId = Number(params.bondId ?? "NaN");
  const { address } = useWallet();
  const currentBlock = useBlockHeight();

  const [bond, setBond] = useState<Bond | null>(null);
  const [isPtOwner, setIsPtOwner] = useState(false);
  const [isYtOwner, setIsYtOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [collectPending, setCollectPending] = useState(false);
  const [redeemPending, setRedeemPending] = useState(false);
  const [combinePending, setCombinePending] = useState(false);
  const [showCombineDialog, setShowCombineDialog] = useState(false);

  type Listing = { seller: string; priceSats: bigint } | null;
  const [ptListing, setPtListing] = useState<Listing>(null);
  const [ytListing, setYtListing] = useState<Listing>(null);
  const [ptListPrice, setPtListPrice] = useState("");
  const [ytListPrice, setYtListPrice] = useState("");
  const [ptListPending, setPtListPending] = useState(false);
  const [ytListPending, setYtListPending] = useState(false);
  const [ptCancelPending, setPtCancelPending] = useState(false);
  const [ytCancelPending, setYtCancelPending] = useState(false);
  const [ptBuyPending, setPtBuyPending] = useState(false);
  const [ytBuyPending, setYtBuyPending] = useState(false);

  const { oracle } = useYieldOracle();

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (isNaN(bondId)) return;

    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.bondFactory,
    );
    if (!contractAddress || !contractName) return;

    const senderAddress = address ?? contractAddress;
    setLoading(true);

    async function load() {
      try {
        const { contractAddress, contractName } = parseContractId(
          CONTRACT_ADDRESSES.bondFactory,
        );
        const { contractAddress: mktCA, contractName: mktCN } = parseContractId(
          CONTRACT_ADDRESSES.market,
        );
        const [bondRes, ptOwnerRes, ytOwnerRes, ptListRes, ytListRes] = await Promise.all([
          callReadOnly({
            contractAddress,
            contractName,
            functionName: "get-bond",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnly({
            contractAddress,
            contractName,
            functionName: "get-pt-owner",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnly({
            contractAddress,
            contractName,
            functionName: "get-yt-owner",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnly({
            contractAddress: mktCA,
            contractName: mktCN,
            functionName: "get-pt-listing",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnly({
            contractAddress: mktCA,
            contractName: mktCN,
            functionName: "get-yt-listing",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
        ]);

        // cvToValue(ResponseOkCV(TupleCV)) returns { type: "tuple", value: { field: { type, value } } }
        const wrapper = cvToValue(bondRes) as { value: Record<string, { value: unknown }> };
        const raw = wrapper.value;
        // cvToValue(OptionalSomeCV(PrincipalCV)) → cvToJSON(principal) → { type: "principal", value: "ST1..." }
        // Must unwrap .value to get the address string; returns null for none.
        const ptOwnerRaw = cvToValue(ptOwnerRes) as { value: string } | null;
        const ytOwnerRaw = cvToValue(ytOwnerRes) as { value: string } | null;
        const ptOwner = ptOwnerRaw?.value ?? null;
        const ytOwner = ytOwnerRaw?.value ?? null;

        const holdsPt = address !== null && ptOwner === address;
        const holdsYt = address !== null && ytOwner === address;

        setBond({
          tokenId: BigInt(bondId),
          owner: ptOwner ?? "",
          sbtcAmount: BigInt(String(raw["sbtc-amount"]!.value)),
          maturityBlock: Number(raw["maturity-block"]!.value),
          createdBlock: Number(raw["created-block"]!.value),
          principalRedeemed: Boolean(raw["principal-redeemed"]!.value),
          combined: Boolean(raw["combined"]!.value),
          yieldDeposited: BigInt(String(raw["yield-deposited"]!.value)),
          yieldWithdrawn: BigInt(String(raw["yield-withdrawn"]!.value)),
          holdsPt,
          holdsYt,
          ptListed: false,
          ytListed: false,
        });

        setIsPtOwner(holdsPt);
        setIsYtOwner(holdsYt);

        // Parse market listings — (optional { seller: principal, price-sats: uint })
        // cvToValue on OptionalSome(Tuple) → { value: { field: { value } } }; None → null
        const parseListing = (res: ReturnType<typeof cvToValue>) => {
          const raw = res as { value: Record<string, { value: unknown }> } | null;
          if (!raw?.value) return null;
          return {
            seller: String(raw.value["seller"]!.value),
            priceSats: BigInt(String(raw.value["price-sats"]!.value)),
          };
        };
        setPtListing(parseListing(cvToValue(ptListRes)));
        setYtListing(parseListing(cvToValue(ytListRes)));

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bond");
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [bondId, address, tick]);

  function callBondFactory(
    functionName: string,
    args: ReturnType<typeof uintCV>[],
    setPending: (v: boolean) => void,
  ) {
    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.bondFactory,
    );
    setPending(true);
    void openContractCall({
      contractAddress,
      contractName,
      functionName,
      functionArgs: args,
      network: stacksNetwork,
      postConditionMode: PostConditionMode.Allow,
      onFinish: (data) => { console.log(`[BondDetailPage] ${functionName} txid:`, data.txId); setPending(false); refetch(); },
      onCancel: () => setPending(false),
    });
  }

  function callMarket(
    functionName: string,
    args: ReturnType<typeof uintCV>[],
    setPending: (v: boolean) => void,
  ) {
    const { contractAddress, contractName } = parseContractId(CONTRACT_ADDRESSES.market);
    setPending(true);
    void openContractCall({
      contractAddress,
      contractName,
      functionName,
      functionArgs: args,
      network: stacksNetwork,
      postConditionMode: PostConditionMode.Allow,
      onFinish: (data) => { console.log(`[BondDetailPage] market.${functionName} txid:`, data.txId); setPending(false); refetch(); },
      onCancel: () => setPending(false),
    });
  }

  function parsePriceInput(value: string): bigint | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed === ".") return null;
    const parts = trimmed.split(".");
    if (parts.length > 2) return null;
    const whole = parts[0] ?? "0";
    const frac = (parts[1] ?? "").padEnd(8, "0").slice(0, 8);
    try { return BigInt(whole) * 100_000_000n + BigInt(frac); } catch { return null; }
  }

  if (isNaN(bondId)) {
    return (
      <div className="space-y-4">
        <Link to="/bonds" className="text-sm text-text-muted hover:text-text transition-colors">
          ← Back to Bonds
        </Link>
        <p className="text-error text-sm">Invalid bond ID.</p>
      </div>
    );
  }

  const bondIdStr = bondId.toString().padStart(3, "0");
  const status = bond && currentBlock !== null ? getBondStatus(bond, currentBlock) : null;
  const { label, className } = status ? STATUS_BADGE[status] : { label: "", className: "" };
  const claimable = bond ? bond.yieldDeposited - bond.yieldWithdrawn : 0n;
  const isTerminated = status === "combined" || status === "redeemed";

  const valuation =
    bond && currentBlock !== null && oracle && !isTerminated
      ? computeBondValuation(
          bond.sbtcAmount,
          bond.maturityBlock,
          currentBlock,
          bond.yieldDeposited,
          bond.yieldWithdrawn,
          oracle,
        )
      : null;

  return (
    <>
      <div className="space-y-6">
        <Link
          to="/bonds"
          className="inline-block text-sm text-text-muted hover:text-text transition-colors"
        >
          ← Back to Bonds
        </Link>

        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Bond #{bondIdStr}</h1>
          {status && (
            <Badge variant="outline" className={className}>
              {label}
            </Badge>
          )}
        </div>

        {loading && !bond ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full bg-surface" />
            <Skeleton className="h-40 w-full bg-surface" />
          </div>
        ) : error ? (
          <Card className="bg-surface border-border">
            <CardContent className="pt-6 space-y-2">
              <p className="text-error text-sm">{error}</p>
              <button
                onClick={refetch}
                className="text-xs text-text-muted underline hover:text-text"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : bond ? (
          <>
            {/* PT — Principal Token */}
            <Card className="bg-surface border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wider">
                    PT — Principal Token
                  </CardTitle>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      isPtOwner
                        ? "border-brand/40 text-brand bg-brand/10"
                        : ptListing && address === ptListing.seller
                          ? "border-yellow-500/40 text-yellow-500 bg-yellow-500/10"
                          : "border-border text-text-faint"
                    }`}
                  >
                    {isPtOwner
                      ? "You hold"
                      : ptListing && address === ptListing.seller
                        ? "For Sale"
                        : "Sold"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {/* Current value — hero number */}
                <div>
                  <p className="text-xs text-text-faint uppercase tracking-wider mb-1">
                    Current Value
                  </p>
                  {valuation ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-semibold tabular-nums">
                        {formatUsd(valuation.ptValueUsd)}
                      </span>
                      <span className="text-base font-mono text-text-muted">
                        {formatSats(valuation.ptValueSats)} sBTC
                      </span>
                    </div>
                  ) : (
                    <p className="text-3xl font-mono font-semibold">
                      {formatSats(bond.sbtcAmount)}{" "}
                      <span className="text-base text-text-muted font-normal">sBTC</span>
                    </p>
                  )}
                  {valuation && (
                    <p className="text-xs text-text-faint mt-1">
                      Oracle estimate · {valuation.aprPct} stacking APR ·{" "}
                      {valuation.yearsRemaining > 0
                        ? `${(valuation.yearsRemaining * 365).toFixed(0)} days to maturity`
                        : "matured"}
                    </p>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Contract details */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Face value (at maturity)</span>
                    <span className="font-mono">{formatSats(bond.sbtcAmount)} sBTC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Created at</span>
                    <span>
                      {currentBlock !== null ? (
                        <BlockTooltip block={bond.createdBlock} currentBlock={currentBlock} />
                      ) : (
                        `#${bond.createdBlock.toLocaleString()}`
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">
                      {status === "active" ? "Matures at" : "Matured at"}
                    </span>
                    <span>
                      {currentBlock !== null ? (
                        <BlockTooltip block={bond.maturityBlock} currentBlock={currentBlock} />
                      ) : (
                        `#${bond.maturityBlock.toLocaleString()}`
                      )}
                    </span>
                  </div>
                </div>

                {isPtOwner && status === "matured" && (
                  <TxButton
                    variant="outline"
                    pending={redeemPending}
                    onClick={() =>
                      callBondFactory("redeem-principal", [uintCV(bondId)], setRedeemPending)
                    }
                    className="border-brand text-brand hover:bg-brand/10"
                  >
                    Redeem {formatSats(bond.sbtcAmount)} sBTC
                  </TxButton>
                )}

                {/* Market listing for PT */}
                {!isTerminated && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <p className="text-xs text-text-muted uppercase tracking-wider">Market</p>
                      {ptListing ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-text-muted">Listed at</span>
                            <span className="font-mono font-semibold">{formatSats(ptListing.priceSats)} sBTC</span>
                          </div>
                          {valuation && valuation.yearsRemaining > 0 && (() => {
                            const implied = computeImpliedRate(ptListing.priceSats, bond.sbtcAmount, valuation.yearsRemaining);
                            return implied !== null ? (
                              <p className="text-xs text-text-faint">
                                Implied yield: {(implied * 100).toFixed(2)}% APR
                              </p>
                            ) : null;
                          })()}
                          {address === ptListing.seller ? (
                            <TxButton
                              variant="outline"
                              size="sm"
                              pending={ptCancelPending}
                              onClick={() => callMarket("cancel-pt", [uintCV(bondId)], setPtCancelPending)}
                              className="border-border text-text-muted hover:bg-secondary"
                            >
                              Cancel Listing
                            </TxButton>
                          ) : address ? (
                            <TxButton
                              variant="outline"
                              size="sm"
                              pending={ptBuyPending}
                              onClick={() => callMarket("buy-pt", [uintCV(bondId)], setPtBuyPending)}
                              className="border-brand text-brand hover:bg-brand/10"
                            >
                              Buy PT — {formatSats(ptListing.priceSats)} sBTC
                            </TxButton>
                          ) : null}
                        </div>
                      ) : isPtOwner && status === "active" ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Price in sBTC"
                            value={ptListPrice}
                            onChange={(e) => setPtListPrice(e.target.value)}
                            className="flex-1 rounded border border-border bg-secondary px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus:border-brand focus:outline-none"
                          />
                          <TxButton
                            variant="outline"
                            size="sm"
                            pending={ptListPending}
                            disabled={!parsePriceInput(ptListPrice)}
                            onClick={() => {
                              const price = parsePriceInput(ptListPrice);
                              if (price) callMarket("list-pt", [uintCV(bondId), uintCV(price)], setPtListPending);
                            }}
                            className="border-border text-text hover:bg-secondary"
                          >
                            List PT
                          </TxButton>
                        </div>
                      ) : (
                        <p className="text-xs text-text-faint">No active listing.</p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* YT — Yield Token */}
            <Card className="bg-surface border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wider">
                    YT — Yield Token
                  </CardTitle>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      isYtOwner
                        ? "border-success/40 text-success bg-success/10"
                        : ytListing && address === ytListing.seller
                          ? "border-yellow-500/40 text-yellow-500 bg-yellow-500/10"
                          : "border-border text-text-faint"
                    }`}
                  >
                    {isYtOwner
                      ? "You hold"
                      : ytListing && address === ytListing.seller
                        ? "For Sale"
                        : "Sold"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Total YT value — hero number */}
                <div>
                  <p className="text-xs text-text-faint uppercase tracking-wider mb-1">
                    {status === "active" ? "Estimated Total Value" : "Remaining Value"}
                  </p>
                  {valuation ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-semibold tabular-nums">
                        ~{formatUsd(valuation.ytTotalEstUsd)}
                      </span>
                      <span className="text-base font-mono text-text-muted">
                        ~{formatSats(valuation.ytTotalEstSats)} sBTC
                      </span>
                    </div>
                  ) : (
                    <p className="text-3xl font-mono font-semibold">
                      {formatSats(claimable)}{" "}
                      <span className="text-base text-text-muted font-normal">sBTC</span>
                    </p>
                  )}
                  {valuation && (
                    <p className="text-xs text-text-faint mt-1">
                      Oracle estimate · {valuation.aprPct} stacking APR
                    </p>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Value breakdown */}
                {valuation && (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Claimable now (certain)</span>
                      <span className="font-mono">
                        {formatSats(valuation.ytCertainSats)} sBTC
                        <span className="text-text-faint ml-2">{formatUsd(valuation.ytCertainUsd)}</span>
                      </span>
                    </div>
                    {status === "active" && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Expected future yield</span>
                        <span className="font-mono text-text-faint">
                          ~{formatSats(valuation.ytExpectedSats)} sBTC
                          <span className="ml-2">~{formatUsd(valuation.ytExpectedUsd)}</span>
                        </span>
                      </div>
                    )}
                    <Separator className="bg-border" />
                  </div>
                )}

                {/* Accounting */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Total deposited</span>
                    <span className="font-mono">{formatSats(bond.yieldDeposited)} sBTC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Already collected</span>
                    <span className="font-mono text-text-faint">
                      − {formatSats(bond.yieldWithdrawn)} sBTC
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Available to collect</span>
                    <span
                      className={`font-mono ${
                        claimable > 0n ? "text-success" : "text-text-faint"
                      }`}
                    >
                      {formatSats(claimable)} sBTC
                    </span>
                  </div>
                </div>

                {/* Accrual window */}
                <p className="text-xs text-text-faint">
                  {status === "active" ? (
                    <>
                      Yield accrues until{" "}
                      {currentBlock !== null ? (
                        <BlockTooltip block={bond.maturityBlock} currentBlock={currentBlock} />
                      ) : (
                        `block #${bond.maturityBlock.toLocaleString()}`
                      )}
                      {" "}— same expiry as the PT. Market price will reflect actual supply
                      &amp; demand once the secondary market launches.
                    </>
                  ) : (
                    <>
                      Yield accrual ended at block #{bond.maturityBlock.toLocaleString()}.
                      Uncollected yield can still be claimed.
                    </>
                  )}
                </p>

                {isYtOwner && !isTerminated && (
                  <TxButton
                    variant="outline"
                    pending={collectPending}
                    disabled={claimable === 0n}
                    onClick={() =>
                      callBondFactory("collect-yield", [uintCV(bondId)], setCollectPending)
                    }
                    className="border-border text-text hover:bg-secondary"
                  >
                    Collect {formatSats(claimable)} sBTC
                  </TxButton>
                )}

                {/* Market listing for YT */}
                {!isTerminated && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <p className="text-xs text-text-muted uppercase tracking-wider">Market</p>
                      {ytListing ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-text-muted">Listed at</span>
                            <span className="font-mono font-semibold">{formatSats(ytListing.priceSats)} sBTC</span>
                          </div>
                          {address === ytListing.seller ? (
                            <TxButton
                              variant="outline"
                              size="sm"
                              pending={ytCancelPending}
                              onClick={() => callMarket("cancel-yt", [uintCV(bondId)], setYtCancelPending)}
                              className="border-border text-text-muted hover:bg-secondary"
                            >
                              Cancel Listing
                            </TxButton>
                          ) : address ? (
                            <TxButton
                              variant="outline"
                              size="sm"
                              pending={ytBuyPending}
                              onClick={() => callMarket("buy-yt", [uintCV(bondId)], setYtBuyPending)}
                              className="border-success text-success hover:bg-success/10"
                            >
                              Buy YT — {formatSats(ytListing.priceSats)} sBTC
                            </TxButton>
                          ) : null}
                        </div>
                      ) : isYtOwner && status === "active" ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Price in sBTC"
                            value={ytListPrice}
                            onChange={(e) => setYtListPrice(e.target.value)}
                            className="flex-1 rounded border border-border bg-secondary px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus:border-brand focus:outline-none"
                          />
                          <TxButton
                            variant="outline"
                            size="sm"
                            pending={ytListPending}
                            disabled={!parsePriceInput(ytListPrice)}
                            onClick={() => {
                              const price = parsePriceInput(ytListPrice);
                              if (price) callMarket("list-yt", [uintCV(bondId), uintCV(price)], setYtListPending);
                            }}
                            className="border-border text-text hover:bg-secondary"
                          >
                            List YT
                          </TxButton>
                        </div>
                      ) : (
                        <p className="text-xs text-text-faint">No active listing.</p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Combine — early exit: burns both PT + YT before maturity */}
            {status === "active" && isPtOwner && isYtOwner && (
              <div className="flex">
                <TxButton
                  variant="destructive"
                  pending={combinePending}
                  onClick={() => setShowCombineDialog(true)}
                >
                  Combine (Early Exit)
                </TxButton>
              </div>
            )}
          </>
        ) : null}
      </div>

      <Dialog open={showCombineDialog} onOpenChange={setShowCombineDialog}>
        <DialogContent className="bg-surface border-border text-text">
          <DialogHeader>
            <DialogTitle>Combine Bond #{bondIdStr}</DialogTitle>
            <DialogDescription className="text-text-muted">
              This will burn both your PT and YT tokens in exchange for your
              principal + accrued yield. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCombineDialog(false)}
              className="border-border text-text hover:bg-secondary"
            >
              Cancel
            </Button>
            <TxButton
              variant="destructive"
              size="sm"
              pending={combinePending}
              onClick={() => {
                setShowCombineDialog(false);
                callBondFactory("combine", [uintCV(bondId)], setCombinePending);
              }}
            >
              Confirm Combine
            </TxButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
