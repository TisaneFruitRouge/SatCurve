import { Link } from "@tanstack/react-router";
import type { Bond } from "@satcurve/types";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { BlockTooltip } from "./BlockTooltip";
import { formatSats } from "../lib/format";

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
}

export function BondRow({ bond, currentBlock }: BondRowProps) {
  const status = getBondStatus(bond, currentBlock);
  const { label, className } = STATUS_BADGE[status];
  const claimable = bond.yieldDeposited - bond.yieldWithdrawn;
  const bondIdStr = bond.tokenId.toString();

  return (
    <Link to="/bonds/$bondId" params={{ bondId: bondIdStr }} className="block">
      <Card className="bg-surface border-border hover:border-brand/50 transition-colors cursor-pointer">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              Bond #{bondIdStr.padStart(3, "0")}
            </span>
            <div className="flex items-center gap-3">
              {claimable > 0n && (
                <span className="text-xs text-success font-mono">
                  +{formatSats(claimable)} yield
                </span>
              )}
              <Badge variant="outline" className={className}>
                {label}
              </Badge>
            </div>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            <span className="font-mono text-text">{formatSats(bond.sbtcAmount)} sBTC</span>
            {" · "}
            {status === "active" ? "Matures " : "Matured "}
            <BlockTooltip block={bond.maturityBlock} currentBlock={currentBlock} />
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
