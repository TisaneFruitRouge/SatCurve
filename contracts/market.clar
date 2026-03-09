;; market.clar
;;
;; Fixed-price P2P orderbook for SatCurve PT and YT tokens.
;;
;; Handles two asset types:
;;   - Bond-factory PT NFTs  (SIP-009, indexed by bond-id)
;;   - Bond-factory YT NFTs  (SIP-009, indexed by bond-id)
;;
;; NFT listings: escrow is via bond-factory transfer -- bond-factory tracks ownership,
;;   so listing transfers the NFT to this contract.

;; ===== ERROR CODES =====

(define-constant err-listing-not-found (err u400))
(define-constant err-already-listed    (err u401))
(define-constant err-price-zero        (err u402))
(define-constant err-not-seller        (err u403))

;; ===== NFT LISTINGS (bond-factory PT / YT) =====
;;
;; Key: bond-id (uint)
;; When listed the NFT is held by this contract (as-contract tx-sender).

(define-map pt-listings uint { seller: principal, price-sats: uint })
(define-map yt-listings uint { seller: principal, price-sats: uint })

;; ===== READ-ONLY =====

(define-read-only (get-pt-listing (bond-id uint))
  (map-get? pt-listings bond-id)
)

(define-read-only (get-yt-listing (bond-id uint))
  (map-get? yt-listings bond-id)
)

;; ===== BOND-FACTORY PT (NFT) =====

;; List a PT NFT for sale at a fixed price.
;; Transfers the PT NFT from the caller to this contract as escrow.
(define-public (list-pt (bond-id uint) (price-sats uint))
  (let ((seller tx-sender))
    (asserts! (> price-sats u0) err-price-zero)
    (asserts! (is-none (map-get? pt-listings bond-id)) err-already-listed)
    (try! (contract-call? .bond-factory transfer-pt bond-id seller (as-contract tx-sender)))
    (map-set pt-listings bond-id { seller: seller, price-sats: price-sats })
    (ok true)
  )
)

;; Cancel a PT listing and return the NFT to the original seller.
(define-public (cancel-pt (bond-id uint))
  (let (
    (seller tx-sender)
    (listing (unwrap! (map-get? pt-listings bond-id) err-listing-not-found))
  )
    (asserts! (is-eq seller (get seller listing)) err-not-seller)
    (try! (as-contract (contract-call? .bond-factory transfer-pt bond-id tx-sender seller)))
    (map-delete pt-listings bond-id)
    (ok true)
  )
)

;; Buy a listed PT NFT. Transfers sBTC to seller and NFT to buyer.
(define-public (buy-pt (bond-id uint))
  (let (
    (buyer tx-sender)
    (listing (unwrap! (map-get? pt-listings bond-id) err-listing-not-found))
    (seller (get seller listing))
    (price  (get price-sats listing))
  )
    (try! (contract-call? .sbtc-token transfer price buyer seller none))
    (try! (as-contract (contract-call? .bond-factory transfer-pt bond-id tx-sender buyer)))
    (map-delete pt-listings bond-id)
    (ok true)
  )
)

;; ===== BOND-FACTORY YT (NFT) =====

;; List a YT NFT for sale at a fixed price.
(define-public (list-yt (bond-id uint) (price-sats uint))
  (let ((seller tx-sender))
    (asserts! (> price-sats u0) err-price-zero)
    (asserts! (is-none (map-get? yt-listings bond-id)) err-already-listed)
    (try! (contract-call? .bond-factory transfer-yt bond-id seller (as-contract tx-sender)))
    (map-set yt-listings bond-id { seller: seller, price-sats: price-sats })
    (ok true)
  )
)

;; Cancel a YT listing and return the NFT to the original seller.
(define-public (cancel-yt (bond-id uint))
  (let (
    (seller tx-sender)
    (listing (unwrap! (map-get? yt-listings bond-id) err-listing-not-found))
  )
    (asserts! (is-eq seller (get seller listing)) err-not-seller)
    (try! (as-contract (contract-call? .bond-factory transfer-yt bond-id tx-sender seller)))
    (map-delete yt-listings bond-id)
    (ok true)
  )
)

;; Buy a listed YT NFT. Transfers sBTC to seller and NFT to buyer.
(define-public (buy-yt (bond-id uint))
  (let (
    (buyer tx-sender)
    (listing (unwrap! (map-get? yt-listings bond-id) err-listing-not-found))
    (seller (get seller listing))
    (price  (get price-sats listing))
  )
    (try! (contract-call? .sbtc-token transfer price buyer seller none))
    (try! (as-contract (contract-call? .bond-factory transfer-yt bond-id tx-sender buyer)))
    (map-delete yt-listings bond-id)
    (ok true)
  )
)

