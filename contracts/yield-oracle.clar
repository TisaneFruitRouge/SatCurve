;; yield-oracle.clar
;;
;; Stores three data feeds, pushed on-chain by an authorized off-chain relayer
;; (RedStone "pull" model). Other contracts call the get-trusted-* functions,
;; which revert if data is stale, preventing the protocol from acting on
;; outdated information.
;;
;; --- Price unit ---
;;   1 uint = $0.000001 USD  (6 decimal places)
;;   $1.00      = u1_000_000
;;   $50,000    = u50_000_000_000
;;
;; --- Stacking APR unit ---
;;   1 uint = 0.01% (basis points)
;;   10.50% = u1050
;;   8.00%  = u800

;; ===== CONSTANTS =====

(define-constant contract-owner tx-sender)

;; Error codes
(define-constant err-unauthorized  (err u100))
(define-constant err-data-too-old  (err u101))
(define-constant err-invalid-price (err u102))

;; BTC/USD and STX/USD price staleness window.
;; 300 Stacks blocks ~= 25 minutes at ~5 s/block (Nakamoto).
(define-constant max-price-age-blocks u300)

;; Stacking APR staleness window. The APR changes once per PoX cycle (~2 weeks),
;; so we allow a generous 6-hour window before considering it stale.
;; 4320 Stacks blocks ~= 6 hours.
(define-constant max-apr-age-blocks u4320)

;; ===== STATE =====

;; BTC/USD price (USD * 10^6)
(define-data-var btc-usd-price uint u0)
(define-data-var btc-price-updated-block uint u0)

;; STX/USD price (USD * 10^6)
;; Used to value STX collateral in the vault engine.
(define-data-var stx-usd-price uint u0)
(define-data-var stx-price-updated-block uint u0)

;; Stacking APR in basis points (1 bps = 0.01%).
;; Used by the vault engine to calculate how much of a user's Stacking yield
;; offsets their outstanding zBTC debt (tiered collateral feature).
(define-data-var stacking-apr-bps uint u0)
(define-data-var stacking-apr-updated-block uint u0)

;; Principals allowed to push data updates.
(define-map authorized-relayers principal bool)

;; ===== PRIVATE HELPERS =====

(define-private (is-authorized)
  (or
    (is-eq tx-sender contract-owner)
    (default-to false (map-get? authorized-relayers tx-sender))
  )
)

;; Generic freshness check reused by all three feeds.
(define-private (is-fresh (last-updated uint) (max-age uint))
  (and
    (> last-updated u0)
    (< (- block-height last-updated) max-age)
  )
)

;; ===== READ-ONLY: BTC/USD =====

(define-read-only (get-btc-price)
  (ok (var-get btc-usd-price))
)

(define-read-only (get-btc-updated-block)
  (ok (var-get btc-price-updated-block))
)

(define-read-only (is-btc-price-fresh)
  (is-fresh (var-get btc-price-updated-block) max-price-age-blocks)
)

;; Returns the BTC price only when fresh. Call this from vault-engine.
(define-read-only (get-trusted-btc-price)
  (begin
    (asserts! (is-btc-price-fresh) err-data-too-old)
    (ok (var-get btc-usd-price))
  )
)

;; ===== READ-ONLY: STX/USD =====

(define-read-only (get-stx-price)
  (ok (var-get stx-usd-price))
)

(define-read-only (get-stx-updated-block)
  (ok (var-get stx-price-updated-block))
)

(define-read-only (is-stx-price-fresh)
  (is-fresh (var-get stx-price-updated-block) max-price-age-blocks)
)

;; Returns the STX price only when fresh. Call this from vault-engine.
(define-read-only (get-trusted-stx-price)
  (begin
    (asserts! (is-stx-price-fresh) err-data-too-old)
    (ok (var-get stx-usd-price))
  )
)

;; ===== READ-ONLY: Stacking APR =====

(define-read-only (get-stacking-apr)
  (ok (var-get stacking-apr-bps))
)

(define-read-only (get-stacking-apr-updated-block)
  (ok (var-get stacking-apr-updated-block))
)

(define-read-only (is-stacking-apr-fresh)
  (is-fresh (var-get stacking-apr-updated-block) max-apr-age-blocks)
)

;; Returns the Stacking APR only when fresh.
(define-read-only (get-trusted-stacking-apr)
  (begin
    (asserts! (is-stacking-apr-fresh) err-data-too-old)
    (ok (var-get stacking-apr-bps))
  )
)

;; ===== READ-ONLY: Relayer =====

(define-read-only (is-relayer-authorized (relayer principal))
  (ok (default-to false (map-get? authorized-relayers relayer)))
)

;; ===== PUBLIC: Price Updates =====

;; Push a new BTC/USD price. Rejects zero (indicates a broken feed).
(define-public (set-btc-price (price uint))
  (begin
    (asserts! (is-authorized) err-unauthorized)
    (asserts! (> price u0) err-invalid-price)
    (var-set btc-usd-price price)
    (var-set btc-price-updated-block block-height)
    (ok true)
  )
)

;; Push a new STX/USD price. Rejects zero (indicates a broken feed).
(define-public (set-stx-price (price uint))
  (begin
    (asserts! (is-authorized) err-unauthorized)
    (asserts! (> price u0) err-invalid-price)
    (var-set stx-usd-price price)
    (var-set stx-price-updated-block block-height)
    (ok true)
  )
)

;; Convenience: update BTC and STX prices atomically in a single transaction.
;; This is what the relayer bot should call to minimise round-trips.
(define-public (set-prices (btc-price uint) (stx-price uint))
  (begin
    (asserts! (is-authorized) err-unauthorized)
    (asserts! (> btc-price u0) err-invalid-price)
    (asserts! (> stx-price u0) err-invalid-price)
    (var-set btc-usd-price btc-price)
    (var-set btc-price-updated-block block-height)
    (var-set stx-usd-price stx-price)
    (var-set stx-price-updated-block block-height)
    (ok true)
  )
)

;; Push the current Stacking APR in basis points.
;; Zero is accepted (no rewards this cycle is a valid state).
;; Called by the relayer once per PoX cycle or whenever the APR changes.
(define-public (set-stacking-apr (apr uint))
  (begin
    (asserts! (is-authorized) err-unauthorized)
    (var-set stacking-apr-bps apr)
    (var-set stacking-apr-updated-block block-height)
    (ok true)
  )
)

;; ===== PUBLIC: Relayer Management =====

(define-public (authorize-relayer (relayer principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
    (map-set authorized-relayers relayer true)
    (ok true)
  )
)

(define-public (revoke-relayer (relayer principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
    (map-delete authorized-relayers relayer)
    (ok true)
  )
)
