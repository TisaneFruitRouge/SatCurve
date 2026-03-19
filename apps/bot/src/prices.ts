/**
 * prices.ts
 *
 * Fetches BTC/USD and STX/USD spot prices from the RedStone oracle network
 * and converts them to the fixed-point format expected by yield-oracle.clar.
 *
 * yield-oracle.clar format:
 *   Price  — 6 decimal places: $1.00 USD = u1_000_000
 *   APR    — basis points:     5.00 %    = u500
 */

import { requestDataPackages } from "@redstone-finance/sdk";
import https from "https";
import { config } from "./config";
import { logger } from "./logger";

const PRICE_PRECISION = 1_000_000; // 6 decimals

export interface MarketPrices {
  /** BTC/USD scaled to 6 decimals */
  btcUsd: bigint;
  /** STX/USD scaled to 6 decimals */
  stxUsd: bigint;
}

/** Pull the latest BTC and STX prices.
 *
 * BTC is fetched from RedStone (redstone-primary-prod).
 * STX is fetched from CoinGecko's free API (no key required).
 */
export async function fetchMarketPrices(): Promise<MarketPrices> {
  const [btcPackages, stxRaw] = await Promise.all([
    requestDataPackages({
      dataServiceId: config.redstone.dataServiceId,
      uniqueSignersCount: config.redstone.uniqueSignersCount,
      dataPackagesIds: ["BTC"],
    }),
    fetchStxUsd(),
  ]);

  const btcRaw = extractValue(btcPackages["BTC"], "BTC");
  const btcUsd = BigInt(Math.round(btcRaw * PRICE_PRECISION));
  const stxUsd = BigInt(Math.round(stxRaw * PRICE_PRECISION));

  logger.info(`Prices fetched — BTC: $${btcRaw.toFixed(2)}, STX: $${stxRaw.toFixed(4)}`);
  return { btcUsd, stxUsd };
}

/** Fetch STX/USD from Kraken's public API (no auth required). */
function fetchStxUsd(): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = "https://api.kraken.com/0/public/Ticker?pair=STXUSD";
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as {
            error: string[];
            result?: Record<string, { c: [string, string] }>;
          };
          if (json.error.length) throw new Error(`Kraken error: ${json.error.join(", ")}`);
          const ticker = Object.values(json.result ?? {})[0];
          const price = ticker ? parseFloat(ticker.c[0]) : null;
          if (!price) throw new Error("STX price missing from Kraken response");
          resolve(price);
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

/**
 * Estimate the current Stacking APR in basis points.
 *
 * This is a simplified calculation based on the empirical rate of
 * sBTC yield deposited into the contracts relative to the total locked
 * principal. In production, derive this from PoX cycle on-chain data.
 */
export function estimateStackingApr(
  cycleRewardsSats: bigint,
  totalStackedSats: bigint,
  cyclesPerYear = 26  // 26 two-week PoX cycles per year
): bigint {
  if (totalStackedSats === 0n) return 0n;
  // APR bps = (cycleRewards / totalStacked) * cyclesPerYear * 10_000
  return (cycleRewardsSats * BigInt(cyclesPerYear) * 10_000n) / totalStackedSats;
}

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

function extractValue(pkgs: unknown, feed: string): number {
  if (!Array.isArray(pkgs) || pkgs.length === 0) {
    throw new Error(`RedStone: no packages returned for ${feed}`);
  }
  const pkg = pkgs[0] as { dataPoints?: { value: number | { toNumber(): number } }[] };
  const raw = pkg.dataPoints?.[0]?.value;
  if (raw == null) throw new Error(`RedStone: missing value for ${feed}`);
  return typeof raw === "number" ? raw : raw.toNumber();
}
