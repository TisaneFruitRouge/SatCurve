import { YieldChart } from "../components/YieldChart";
import { StatsCard } from "../components/StatsCard";
import { useOraclePrices } from "../hooks/useOraclePrices";
import { usePoolState } from "../hooks/usePoolState";
import { formatSats } from "../lib/format";
import type { YieldDataPoint } from "../components/YieldChart";

const TERM_YEARS: Record<string, number> = {
  "3M": 0.25,
  "6M": 0.5,
  "1Y": 1.0,
  "2Y": 2.0,
};

function computeYieldCurve(stackingAprBps: bigint): YieldDataPoint[] {
  const aprDecimal = Number(stackingAprBps) / 10_000;
  return Object.entries(TERM_YEARS).map(([label, years]) => ({
    maturity: label,
    apy: parseFloat((aprDecimal * years * 100).toFixed(2)),
  }));
}

export function HomePage() {
  const { btcPriceUsd, stackingAprBps, loading: oracleLoading } = useOraclePrices();
  const { poolState, loading: poolLoading } = usePoolState();

  const tvlDisplay = poolState
    ? `${formatSats(poolState.ptTotalSupply)}`
    : null;

  const apyDisplay =
    stackingAprBps !== null
      ? `${(Number(stackingAprBps) / 100).toFixed(2)}%`
      : null;

  const btcPriceDisplay =
    btcPriceUsd !== null
      ? `$${(Number(btcPriceUsd) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : null;

  const yieldCurveData =
    stackingAprBps !== null ? computeYieldCurve(stackingAprBps) : undefined;

  return (
    <div className="space-y-10">
      <section className="text-center space-y-3 py-6">
        <h1 className="text-5xl font-bold text-text tracking-tight">
          The Bitcoin Yield Curve
        </h1>
        <p className="text-lg text-text-muted max-w-xl mx-auto">
          Fixed-rate and variable-rate yield stripping on sBTC, powered by
          Stacks L2 stacking rewards.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          label="Total Value Locked"
          value={tvlDisplay}
          unit="sBTC"
          loading={poolLoading}
        />
        <StatsCard
          label="Stacking APR"
          value={apyDisplay}
          loading={oracleLoading}
        />
        <StatsCard
          label="BTC / USD"
          value={btcPriceDisplay}
          loading={oracleLoading}
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Yield Curve</h2>
        <YieldChart data={yieldCurveData} loading={oracleLoading} />
      </section>
    </div>
  );
}
