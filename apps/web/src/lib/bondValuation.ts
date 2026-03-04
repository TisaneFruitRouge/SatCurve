import type { YieldOracleData } from "../hooks/useYieldOracle";

/** Stacks blocks per year at ~5 s/block (Nakamoto). */
const BLOCKS_PER_YEAR = 6_307_200;

export interface BondValuation {
  // ── PT ──────────────────────────────────────────────────────────────────
  /**
   * Oracle-implied fair value of the PT in satoshis.
   * Computed as: face_value / (1 + apr)^years_remaining
   * When the bond is matured this equals face_value exactly.
   *
   * FUTURE: swap in secondary-market PT price when available.
   */
  ptValueSats: bigint;
  ptValueUsd: number;

  /** Oracle APR that was used for the PT estimate, as a percentage string. */
  aprPct: string;

  // ── YT ──────────────────────────────────────────────────────────────────
  /**
   * Yield already deposited minus already withdrawn — certain, claimable now.
   */
  ytCertainSats: bigint;
  ytCertainUsd: number;

  /**
   * Expected additional yield from now until maturity at the oracle APR.
   * Purely an estimate — actual stacking rewards will differ.
   * Zero once the bond has matured.
   */
  ytExpectedSats: bigint;
  ytExpectedUsd: number;

  /** ytCertainSats + ytExpectedSats */
  ytTotalEstSats: bigint;
  ytTotalEstUsd: number;

  // ── Meta ─────────────────────────────────────────────────────────────────
  yearsRemaining: number;
}

/**
 * Pendle-style implied yield rate derived from a PT market price.
 *
 * Inverts the zero-coupon bond formula:
 *   price = face / (1 + r)^t  =>  r = (face / price)^(1/t) - 1
 *
 * Returns null when undefined: matured bond, price >= face, or price zero.
 */
export function computeImpliedRate(
  priceSats: bigint,
  faceSats: bigint,
  yearsRemaining: number,
): number | null {
  if (yearsRemaining <= 0 || priceSats <= 0n || priceSats >= faceSats) return null;
  return Math.pow(Number(faceSats) / Number(priceSats), 1 / yearsRemaining) - 1;
}

/**
 * Compute oracle-implied valuations for a bond's PT and YT.
 *
 * Returns null if the oracle data is unavailable or the bond has already been
 * combined/redeemed (valuation is meaningless at that point).
 */
export function computeBondValuation(
  sbtcAmountSats: bigint,
  maturityBlock: number,
  currentBlock: number,
  yieldDeposited: bigint,
  yieldWithdrawn: bigint,
  oracle: YieldOracleData,
): BondValuation {
  const blocksLeft = Math.max(0, maturityBlock - currentBlock);
  const yearsRemaining = blocksLeft / BLOCKS_PER_YEAR;

  const aprDecimal = oracle.aprBps / 10_000;

  // ── PT fair value (zero-coupon bond discounting) ──────────────────────────
  const discountFactor = yearsRemaining > 0
    ? Math.pow(1 + aprDecimal, yearsRemaining)
    : 1;
  const ptValueSats = BigInt(Math.round(Number(sbtcAmountSats) / discountFactor));

  // ── YT value ─────────────────────────────────────────────────────────────
  const ytCertainSats = yieldDeposited - yieldWithdrawn; // already accumulated
  const ytExpectedSats = yearsRemaining > 0
    ? BigInt(Math.round(Number(sbtcAmountSats) * aprDecimal * yearsRemaining))
    : 0n;
  const ytTotalEstSats = ytCertainSats + ytExpectedSats;

  // ── USD conversion ────────────────────────────────────────────────────────
  // oracle.btcUsdPrice is in $0.000001 per BTC; divide by 1e6 to get $/BTC,
  // then divide sats by 1e8 to get BTC.
  const satsToUsd = (sats: bigint) =>
    (Number(sats) / 1e8) * (oracle.btcUsdPrice / 1e6);

  return {
    ptValueSats,
    ptValueUsd: satsToUsd(ptValueSats),
    aprPct: aprDecimal.toLocaleString("en-US", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    ytCertainSats,
    ytCertainUsd: satsToUsd(ytCertainSats),
    ytExpectedSats,
    ytExpectedUsd: satsToUsd(ytExpectedSats),
    ytTotalEstSats,
    ytTotalEstUsd: satsToUsd(ytTotalEstSats),
    yearsRemaining,
  };
}
