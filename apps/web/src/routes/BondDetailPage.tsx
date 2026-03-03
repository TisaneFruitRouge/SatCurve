import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { openContractCall } from "@stacks/connect";
import { callReadOnlyFunction, cvToValue, uintCV, PostConditionMode } from "@stacks/transactions";
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
import { formatSats } from "../lib/format";
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
        const [bondRes, ptOwnerRes, ytOwnerRes] = await Promise.all([
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-bond",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-pt-owner",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
          callReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: "get-yt-owner",
            functionArgs: [uintCV(bondId)],
            network: stacksNetwork,
            senderAddress,
          }),
        ]);

        // cvToValue(ResponseOkCV(TupleCV)) returns { type: "tuple", value: { field: { type, value } } }
        const wrapper = cvToValue(bondRes) as { value: Record<string, { value: unknown }> };
        const raw = wrapper.value;
        // cvToValue(OptionalCV(PrincipalCV)) returns the address string, or null for none
        const ptOwner = cvToValue(ptOwnerRes) as string | null;
        const ytOwner = cvToValue(ytOwnerRes) as string | null;

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
        });

        setIsPtOwner(address !== null && ptOwner === address);
        setIsYtOwner(address !== null && ytOwner === address);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bond");
      } finally {
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 5_000);
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
            <Skeleton className="h-32 w-full bg-surface" />
            <Skeleton className="h-24 w-full bg-surface" />
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
            {/* Principal */}
            <Card className="bg-surface border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wider">
                  Principal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-2xl font-mono font-semibold">
                  {formatSats(bond.sbtcAmount)}{" "}
                  <span className="text-base text-text-muted font-normal">sBTC</span>
                </p>
                <div className="flex flex-wrap gap-6 text-sm text-text-muted">
                  <span>
                    Created at{" "}
                    {currentBlock !== null ? (
                      <BlockTooltip block={bond.createdBlock} currentBlock={currentBlock} />
                    ) : (
                      `#${bond.createdBlock.toLocaleString()}`
                    )}
                  </span>
                  <span>
                    {status === "active" ? "Matures at " : "Matured at "}
                    {currentBlock !== null ? (
                      <BlockTooltip block={bond.maturityBlock} currentBlock={currentBlock} />
                    ) : (
                      `#${bond.maturityBlock.toLocaleString()}`
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Yield */}
            <Card className="bg-surface border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wider">
                  Yield
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Total deposited</span>
                  <span className="font-mono">{formatSats(bond.yieldDeposited)} sBTC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Already collected</span>
                  <span className="font-mono text-text-faint">
                    {formatSats(bond.yieldWithdrawn)} sBTC
                  </span>
                </div>
                <Separator className="bg-border" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Available to collect</span>
                  <span
                    className={`font-mono ${
                      claimable > 0n ? "text-success" : "text-text-faint"
                    }`}
                  >
                    {formatSats(claimable)} sBTC
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            {(status === "active" || status === "matured") && (
              <div className="flex gap-3 flex-wrap">
                {isYtOwner && (
                  <TxButton
                    variant="outline"
                    pending={collectPending}
                    disabled={claimable === 0n}
                    onClick={() =>
                      callBondFactory("collect-yield", [uintCV(bondId)], setCollectPending)
                    }
                    className="border-border text-text hover:bg-secondary"
                  >
                    Collect Yield
                  </TxButton>
                )}

                {status === "matured" && isPtOwner && (
                  <TxButton
                    variant="outline"
                    pending={redeemPending}
                    onClick={() =>
                      callBondFactory("redeem-principal", [uintCV(bondId)], setRedeemPending)
                    }
                    className="border-border text-text hover:bg-secondary"
                  >
                    Redeem Principal
                  </TxButton>
                )}

                {status === "active" && isPtOwner && isYtOwner && (
                  <TxButton
                    variant="destructive"
                    pending={combinePending}
                    onClick={() => setShowCombineDialog(true)}
                  >
                    Combine (Early Exit)
                  </TxButton>
                )}
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
