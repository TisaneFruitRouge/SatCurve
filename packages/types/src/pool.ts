// Types for vault-engine.clar (pool-level yield-stripping)
// and redemption-pool.clar (sBTC escrow layer)

/**
 * Global state of the vault-engine pool.
 */
export interface PoolState {
  maturityBlock: number;    // Stacks block height at which PT becomes redeemable
  yieldIndex: bigint;       // Global yield accumulator, scaled by 1e12
  ptTotalSupply: bigint;    // Total principal-token supply = total locked principal (satoshis)
  ytTotalSupply: bigint;    // Total yield-token supply (satoshis)
  totalEscrowed: bigint;    // Total sBTC held in redemption-pool (principal + accrued yield)
}

/**
 * A user's position in the vault-engine pool.
 * Derived from on-chain read-only functions.
 */
export interface PoolPosition {
  address: string;
  ptBalance: bigint;       // principal-token balance (satoshis)
  ytBalance: bigint;       // yield-token balance (satoshis)
  claimableYield: bigint;  // accrued but unclaimed yield, from get-claimable-yield (satoshis)
}
