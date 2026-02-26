;; yield-oracle.clar
;; Integrates RedStone oracle data for sBTC/BTC price feeds.
;; Uses the RedStone "pull" model: the off-chain relayer (or bot) fetches
;; signed price data and submits it on-chain via set-price.
;;
;; Only authorized principals (deployer / oracle relayer) can push prices.
;; Price staleness is enforced: prices older than ~10 blocks are rejected.
;;
;; TODO: Implement set-price (authorized), get-price, get-last-updated-block,
;;       is-price-fresh, authorize-relayer, revoke-relayer
