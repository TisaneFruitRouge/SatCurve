/**
 * prices.ts
 *
 * Fetches BTC/USD and STX/USD spot prices from Kraken's public API
 * and converts them to the fixed-point format expected by yield-oracle.clar.
 *
 * yield-oracle.clar format:
 *   Price  — 6 decimal places: $1.00 USD = u1_000_000
 *   APR    — basis points:     5.00 %    = u500
 */

import https from "https";
import { logger } from "./logger";

const PRICE_PRECISION = 1_000_000; // 6 decimals

export interface MarketPrices {
  /** BTC/USD scaled to 6 decimals */
  btcUsd: bigint;
  /** STX/USD scaled to 6 decimals */
  stxUsd: bigint;
}

/** Pull the latest BTC and STX prices from Kraken's public API (no auth required). */
export async function fetchMarketPrices(): Promise<MarketPrices> {
  const [btcRaw, stxRaw] = await Promise.all([
    fetchKrakenPrice("XBTUSD"),
    fetchKrakenPrice("STXUSD"),
  ]);

  const btcUsd = BigInt(Math.round(btcRaw * PRICE_PRECISION));
  const stxUsd = BigInt(Math.round(stxRaw * PRICE_PRECISION));

  logger.info(`Prices fetched — BTC: $${btcRaw.toFixed(2)}, STX: $${stxRaw.toFixed(4)}`);
  return { btcUsd, stxUsd };
}

/**
 * Estimate the current Stacking APR in basis points.
 */
export function estimateStackingApr(
  cycleRewardsSats: bigint,
  totalStackedSats: bigint,
  cyclesPerYear = 26
): bigint {
  if (totalStackedSats === 0n) return 0n;
  return (cycleRewardsSats * BigInt(cyclesPerYear) * 10_000n) / totalStackedSats;
}

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

function fetchKrakenPrice(pair: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
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
          if (!price) throw new Error(`${pair} price missing from Kraken response`);
          resolve(price);
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}
