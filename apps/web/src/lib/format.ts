/** Format satoshis as an sBTC string with exactly 8 decimal places. */
export function formatSats(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const frac = sats % 100_000_000n;
  return `${whole}.${frac.toString().padStart(8, "0")}`;
}

export function formatBlockNumber(block: number): string {
  return block.toLocaleString("en-US");
}

/** Estimate a Date for a block height at ~5 s/block (Nakamoto). */
export function estimatedBlockDate(targetBlock: number, currentBlock: number): Date {
  return new Date(Date.now() + (targetBlock - currentBlock) * 5_000);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) < 1) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  if (Math.abs(diffDays) < 365) return rtf.format(Math.round(diffDays / 30), "month");
  return rtf.format(Math.round(diffDays / 365), "year");
}

/** Format a USD amount with 2 decimal places and $ prefix. */
export function formatUsd(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const TERM_PRESET_BLOCKS: Record<string, number> = {
  "3M": 1_555_200,
  "6M": 3_110_400,
  "1Y": 6_307_200,
  "2Y": 12_614_400,
};
