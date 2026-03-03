import { useState } from "react";
import type { PoolPosition } from "@satcurve/types";
import { openContractCall } from "@stacks/connect";
import { uintCV } from "@stacks/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { TxButton } from "./TxButton";
import { BlockTooltip } from "./BlockTooltip";
import { Button } from "./ui/button";
import { formatSats } from "../lib/format";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

interface PositionCardProps {
  position?: PoolPosition;
  maturityBlock?: number;
  currentBlock?: number;
  loading?: boolean;
  onActionSuccess?: () => void;
}

export function PositionCard({
  position,
  maturityBlock,
  currentBlock,
  loading,
  onActionSuccess,
}: PositionCardProps) {
  const [claimPending, setClaimPending] = useState(false);
  const [redeemPending, setRedeemPending] = useState(false);
  const [combinePending, setCombinePending] = useState(false);
  const [showCombineDialog, setShowCombineDialog] = useState(false);

  const isMatured =
    maturityBlock !== undefined &&
    currentBlock !== undefined &&
    currentBlock >= maturityBlock;

  const hasPosition =
    position &&
    (position.ptBalance > 0n ||
      position.ytBalance > 0n ||
      position.claimableYield > 0n);

  const { contractAddress, contractName } = parseContractId(
    CONTRACT_ADDRESSES.vaultEngine
  );

  function callVault(
    functionName: string,
    functionArgs: ReturnType<typeof uintCV>[],
    setPending: (v: boolean) => void
  ) {
    setPending(true);
    void openContractCall({
      contractAddress,
      contractName,
      functionName,
      functionArgs,
      network: stacksNetwork,
      onFinish: () => {
        setPending(false);
        onActionSuccess?.();
      },
      onCancel: () => setPending(false),
    });
  }

  if (loading) {
    return (
      <Card className="bg-surface border-border">
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-4 w-48 bg-secondary" />
          <Skeleton className="h-4 w-36 bg-secondary" />
          <Skeleton className="h-4 w-40 bg-secondary" />
        </CardContent>
      </Card>
    );
  }

  if (!hasPosition) {
    return (
      <Card className="bg-surface border-border">
        <CardContent className="pt-6">
          <p className="text-text-muted text-sm">
            No position found. Deposit sBTC to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-surface border-border">
        <CardHeader>
          <CardTitle className="text-base">My Position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Principal (PT)</span>
            <span className="font-mono">{formatSats(position.ptBalance)} sBTC</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Yield tokens (YT)</span>
            <span className="font-mono">{formatSats(position.ytBalance)} YT</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-text-muted">Claimable yield</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono ${position.claimableYield > 0n ? "text-success" : ""}`}>
                {formatSats(position.claimableYield)} sBTC
              </span>
              <TxButton
                size="sm"
                variant="outline"
                pending={claimPending}
                disabled={position.claimableYield === 0n}
                onClick={() => callVault("claim-yield", [], setClaimPending)}
                className="border-border text-text-muted hover:text-text hover:bg-secondary h-7 px-2 text-xs"
              >
                Claim
              </TxButton>
            </div>
          </div>

          {maturityBlock !== undefined && currentBlock !== undefined && (
            <>
              <Separator className="bg-border" />
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-muted">Maturity</span>
                <div className="flex items-center gap-2">
                  <BlockTooltip block={maturityBlock} currentBlock={currentBlock} />
                  <Badge
                    variant="outline"
                    className={
                      isMatured
                        ? "border-brand text-brand"
                        : "border-success text-success"
                    }
                  >
                    {isMatured ? "Matured" : "Active"}
                  </Badge>
                </div>
              </div>
            </>
          )}

          <Separator className="bg-border" />

          <div className="flex gap-2 pt-1">
            {isMatured && position.ptBalance > 0n && (
              <TxButton
                variant="outline"
                size="sm"
                pending={redeemPending}
                onClick={() =>
                  callVault("redeem-principal", [uintCV(position.ptBalance)], setRedeemPending)
                }
                className="border-border text-text hover:bg-secondary"
              >
                Redeem Principal
              </TxButton>
            )}
            {!isMatured && position.ptBalance > 0n && position.ytBalance > 0n && (
              <TxButton
                variant="destructive"
                size="sm"
                pending={combinePending}
                onClick={() => setShowCombineDialog(true)}
              >
                Combine
              </TxButton>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCombineDialog} onOpenChange={setShowCombineDialog}>
        <DialogContent className="bg-surface border-border text-text">
          <DialogHeader>
            <DialogTitle>Combine PT + YT</DialogTitle>
            <DialogDescription className="text-text-muted">
              This will burn both your PT and YT tokens in exchange for your
              principal + accrued yield. This action cannot be undone.
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
                callVault("combine", [uintCV(position.ptBalance)], setCombinePending);
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
