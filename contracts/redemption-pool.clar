;; redemption-pool.clar
;; Locked sBTC reserve that guarantees 1 zBTC can always be redeemed for
;; 1 sBTC once the Bitcoin block height reaches the bond's maturity.
;;
;; All maturity dates are pegged to Bitcoin block height (not Unix timestamps)
;; ensuring L1/L2 synchronization via Stacks' burn-block-height.
;;
;; TODO: Implement add-to-reserve, redeem-at-maturity, get-reserve-balance,
;;       get-maturity-block, is-matured
