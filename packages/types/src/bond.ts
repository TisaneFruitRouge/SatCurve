export interface ZeroCouponBond {
  tokenId: string;
  name: string;                // e.g. "zBTC-AUG-26"
  maturityBlockHeight: number; // Bitcoin block height
  faceValueSats: bigint;       // 1 zBTC = 100_000_000 microsBTC
  discountRate: number;        // e.g. 0.05 for 5%
  isRedeemable: boolean;
}
