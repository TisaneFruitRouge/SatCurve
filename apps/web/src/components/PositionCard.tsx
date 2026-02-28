import type { PoolPosition } from "@satcurve/types";

interface PositionCardProps {
  position?: PoolPosition;
}

export function PositionCard({ position }: PositionCardProps) {
  if (!position) {
    return (
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <p className="text-white/40 text-sm">
          No position found. Deposit sBTC to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
      <div className="flex justify-between items-start mb-4">
        <span className="text-sm text-white/40 truncate">{position.address}</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-white/60">Principal (PT)</span>
          <span>{(Number(position.ptBalance) / 1e8).toFixed(8)} sBTC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60">Yield tokens (YT)</span>
          <span>{(Number(position.ytBalance) / 1e8).toFixed(8)} YT</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60">Claimable yield</span>
          <span>{(Number(position.claimableYield) / 1e8).toFixed(8)} sBTC</span>
        </div>
      </div>
    </div>
  );
}
