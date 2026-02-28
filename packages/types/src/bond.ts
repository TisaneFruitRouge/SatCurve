// Types for bond-factory.clar (per-bond, NFT-based yield-stripping)

/**
 * An individual bond created via bond-factory.clar.
 *
 * Each bond mints two SIP-009 NFTs for the same token ID:
 *   - PT (principal-token): redeemable for sbtcAmount at/after maturityBlock
 *   - YT (yield-token): collects variable stacking rewards deposited by the relayer
 *
 * Mirrors the `bond-data` map in bond-factory.clar.
 */
export interface Bond {
  tokenId: bigint;
  owner: string;               // current PT holder (YT may have been transferred separately)
  sbtcAmount: bigint;          // locked principal in satoshis
  maturityBlock: number;       // Stacks block at which PT is redeemable
  createdBlock: number;        // Stacks block at creation
  principalRedeemed: boolean;  // true once redeem-principal() was called
  combined: boolean;           // true once combine() was called (early exit before maturity)
  yieldDeposited: bigint;      // total yield deposited by relayer so far (satoshis)
  yieldWithdrawn: bigint;      // yield already collected by YT holder (satoshis)
}

/**
 * Claimable yield for a given bond (yieldDeposited - yieldWithdrawn).
 */
export interface BondClaimable {
  bondId: bigint;
  claimable: bigint;           // satoshis available to collect
}
