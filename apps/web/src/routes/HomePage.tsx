import { Link } from "@tanstack/react-router";
import { YieldChart } from "../components/YieldChart";
import { StatsCard } from "../components/StatsCard";
import { useOraclePrices } from "../hooks/useOraclePrices";
import { useMarketListings } from "../hooks/useMarketListings";
import { formatSats } from "../lib/format";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
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

function MarketPreviewRow({
  tokenType,
  label,
  priceSats,
}: {
  tokenType: "PT" | "YT";
  label: string;
  priceSats: bigint;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface border border-border">
      <div className="flex items-center gap-3">
        <Badge
          className={
            tokenType === "PT"
              ? "bg-brand/10 text-brand border-brand/30 font-mono text-xs"
              : "bg-success/10 text-success border-success/30 font-mono text-xs"
          }
          variant="outline"
        >
          {tokenType}
        </Badge>
        <span className="text-sm text-text">{label}</span>
      </div>
      <span className="text-sm font-mono text-text-muted">
        {formatSats(priceSats)} sBTC
      </span>
    </div>
  );
}

export function HomePage() {
  const { btcPriceUsd, stackingAprBps, loading: oracleLoading } = useOraclePrices();
  const { nftListings, loading: marketLoading } = useMarketListings();

  const apyDisplay =
    stackingAprBps !== null ? `${(Number(stackingAprBps) / 100).toFixed(2)}%` : null;
  const btcPriceDisplay =
    btcPriceUsd !== null
      ? `$${(Number(btcPriceUsd) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : null;

  const yieldCurveData =
    stackingAprBps !== null ? computeYieldCurve(stackingAprBps) : undefined;

  const previewListings = nftListings.slice(0, 3).map((l) => ({
    key: `nft-${l.tokenType}-${l.bondId}`,
    tokenType: l.tokenType,
    label: `Bond #${String(l.bondId).padStart(3, "0")} ${l.tokenType}`,
    priceSats: l.priceSats,
  }));

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center space-y-6 py-16">
        <h1 className="text-5xl font-bold text-text tracking-tight leading-tight">
          The Bitcoin<br />
          <span className="text-brand">Yield Curve</span>
        </h1>
        <p className="text-lg text-text-muted max-w-xl mx-auto">
          Split sBTC into fixed-rate principal and variable-yield tokens.
          Trade either side on the P2P market — powered by Stacks stacking rewards.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link to="/bonds">Start Earning</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/market">View Market</Link>
          </Button>
        </div>
      </section>

      {/* Live Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Yield Curve */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Yield Curve</h2>
        <YieldChart data={yieldCurveData} loading={oracleLoading} />
      </section>

      {/* How It Works */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-surface border-border">
            <CardContent className="pt-6 space-y-2">
              <span className="text-3xl font-bold text-brand">01</span>
              <h3 className="font-semibold text-text">Deposit sBTC</h3>
              <p className="text-sm text-text-muted">
                Lock sBTC into a fixed-term bond. Your principal is secured until maturity.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-surface border-border">
            <CardContent className="pt-6 space-y-2">
              <span className="text-3xl font-bold text-brand">02</span>
              <h3 className="font-semibold text-text">Receive PT + YT</h3>
              <p className="text-sm text-text-muted">
                Get a Principal Token (fixed redemption) and a Yield Token (variable stacking rewards).
              </p>
            </CardContent>
          </Card>
          <Card className="bg-surface border-border">
            <CardContent className="pt-6 space-y-2">
              <span className="text-3xl font-bold text-brand">03</span>
              <h3 className="font-semibold text-text">Trade or Hold</h3>
              <p className="text-sm text-text-muted">
                Sell either token on the P2P market, or hold to maturity and claim what you're owed.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Product Cards */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Products</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-surface border border-brand/20 hover:border-brand/50 transition-colors">
            <CardContent className="pt-6 space-y-3">
              <span className="inline-block text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/30">
                PT
              </span>
              <h3 className="text-lg font-semibold text-text">Principal Token</h3>
              <p className="text-sm text-text-muted">
                A zero-coupon bond. Redeem 1:1 for sBTC at maturity.
                Buy at a discount for a fixed, predictable return.
              </p>
              <Button variant="outline" size="sm" asChild className="border-brand text-brand hover:bg-brand/10">
                <Link to="/market">Buy PT</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="bg-surface border border-success/20 hover:border-success/50 transition-colors">
            <CardContent className="pt-6 space-y-3">
              <span className="inline-block text-xs font-mono px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/30">
                YT
              </span>
              <h3 className="text-lg font-semibold text-text">Yield Token</h3>
              <p className="text-sm text-text-muted">
                Claim all stacking rewards generated by the underlying sBTC.
                Leveraged exposure to Bitcoin yield.
              </p>
              <Button variant="outline" size="sm" asChild className="border-success text-success hover:bg-success/10">
                <Link to="/market">Buy YT</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Live Market Preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Live Market</h2>
          <Link to="/market" className="text-sm text-text-muted hover:text-brand transition-colors">
            View all
          </Link>
        </div>

        {marketLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full bg-surface" />
            <Skeleton className="h-14 w-full bg-surface" />
            <Skeleton className="h-14 w-full bg-surface" />
          </div>
        ) : previewListings.length === 0 ? (
          <Card className="bg-surface border-border">
            <CardContent className="py-6">
              <p className="text-sm text-text-muted">No active listings right now.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {previewListings.map((item) => (
              <MarketPreviewRow key={item.key} {...item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
