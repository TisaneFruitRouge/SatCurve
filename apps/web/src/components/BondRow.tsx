import { useState } from "react";
import type { Bond } from "@satcurve/types";
import { openContractCall } from "@stacks/connect";
import { uintCV } from "@stacks/transactions";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { TxButton } from "./TxButton";
import { BlockTooltip } from "./BlockTooltip";
import { formatSats } from "../lib/format";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

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

interface BondRowProps {
  bond: Bond;
  currentBlock: number;
  onActionSuccess?: () => void;
}

export function BondRow({ bond, currentBlock, onActionSuccess }: BondRowProps) {
  const [collectPending, setCollectPending] = useState(false);
  const [redeemPending, setRedeemPending] = useState(false);
  const [combinePending, setCombinePending] = useState(false);
  const [showCombineDialog, setShowCombineDialog] = useState(false);

  const status = getBondStatus(bond, currentBlock);
  const { label, className } = STATUS_BADGE[status];
  const claimable = bond.yieldDeposited - bond.yieldWithdrawn;
  const hasClaimable = claimable > 0n;

  const { contractAddress, contractName } = parseContractId(
    CONTRACT_ADDRESSES.bondFactory
  );

  function callBondFactory(
    functionName: string,
    args: ReturnType<typeof uintCV>[],
    setPending: (v: boolean) => void
  ) {
    setPending(true);
    void openContractCall({
      contractAddress,
      contractName,
      functionName,
      functionArgs: args,
      network: stacksNetwork,
      onFinish: () => {
        setPending(false);
        onActionSuccess?.();
      },
      onCancel: () => setPending(false),
    });
  }

  const bondIdStr = bond.tokenId.toString().padStart(3, "0");

  return (
    <>
      <Card className="bg-surface border-border">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Bond #{bondIdStr}</span>
            <Badge variant="outline" className={className}>
              {label}
            </Badge>
          </div>

          <div className="text-sm text-text-muted">
            <span className="font-mono text-text">
              {formatSats(bond.sbtcAmount)} sBTC
            </span>
            {" · "}
            {status === "active" ? "Matures " : "Matured block "}
            <BlockTooltip block={bond.maturityBlock} currentBlock={currentBlock} />
          </div>

          {status !== "combined" && status !== "redeemed" && (
            <div className="text-sm">
              <span className="text-text-muted">Claimable yield: </span>
              <span
                className={`font-mono ${
                  hasClaimable ? "text-success" : "text-text-faint"
                }`}
              >
                {formatSats(claimable)} sBTC
              </span>
            </div>
          )}

          {(status === "active" || status === "matured") && (
            <>
              <Separator className="bg-border" />
              <div className="flex gap-2 flex-wrap">
                {status === "active" && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <TxButton
                              size="sm"
                              variant="outline"
                              pending={collectPending}
                              disabled={!hasClaimable}
                              onClick={() =>
                                callBondFactory(
                                  "collect-yield",
                                  [uintCV(bond.tokenId)],
                                  setCollectPending
                                )
                              }
                              className="border-border text-text hover:bg-secondary"
                            >
                              Collect Yield
                            </TxButton>
                          </span>
                        </TooltipTrigger>
                        {!hasClaimable && (
                          <TooltipContent className="bg-surface border-border text-text-muted text-xs max-w-xs">
                            No yield available yet. Yield is deposited each PoX
                            cycle by the relayer.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>

                    <TxButton
                      size="sm"
                      variant="destructive"
                      pending={combinePending}
                      onClick={() => setShowCombineDialog(true)}
                    >
                      Combine
                    </TxButton>
                  </>
                )}

                {status === "matured" && (
                  <TxButton
                    size="sm"
                    variant="outline"
                    pending={redeemPending}
                    onClick={() =>
                      callBondFactory(
                        "redeem-principal",
                        [uintCV(bond.tokenId)],
                        setRedeemPending
                      )
                    }
                    className="border-border text-text hover:bg-secondary"
                  >
                    Redeem Principal
                  </TxButton>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                callBondFactory(
                  "combine",
                  [uintCV(bond.tokenId)],
                  setCombinePending
                );
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
