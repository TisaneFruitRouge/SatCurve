import type { Vault } from "@satcurve/types";

interface VaultCardProps {
  vault?: Vault;
}

export function VaultCard({ vault }: VaultCardProps) {
  if (!vault) {
    return (
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <p className="text-white/40 text-sm">
          No vault found. Deposit sBTC to create one.
        </p>
      </div>
    );
  }

  const healthColor =
    vault.healthFactor >= 150
      ? "text-green-400"
      : vault.healthFactor >= 120
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
      <div className="flex justify-between items-start mb-4">
        <span className="text-sm text-white/40">Vault {vault.id}</span>
        <span className={`text-sm font-semibold ${healthColor}`}>
          {vault.healthFactor}% Health
        </span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-white/60">Collateral</span>
          <span>{(Number(vault.collateralAmount) / 1e8).toFixed(4)} sBTC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60">Debt</span>
          <span>{(Number(vault.debtAmount) / 1e8).toFixed(4)} zBTC</span>
        </div>
      </div>
    </div>
  );
}
