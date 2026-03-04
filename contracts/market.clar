;; market.clar
;;
;; Fixed-price P2P orderbook for SatCurve PT and YT tokens.
;;
;; Handles four asset types:
;;   - Bond-factory PT NFTs  (SIP-009, indexed by bond-id)
;;   - Bond-factory YT NFTs  (SIP-009, indexed by bond-id)
;;   - Vault-engine PT FTs   (SIP-010, indexed by listing-id)
;;   - Vault-engine YT FTs   (SIP-010, indexed by listing-id)
;;
;; NFT listings: escrow is via bond-factory transfer -- bond-factory tracks ownership,
;;   so listing transfers the NFT to this contract.
;;
;; FT listings: tokens are escrowed here; vault-engine::transfer-yt
;;   is used for YT to ensure yield checkpointing happens correctly.

;; ===== ERROR CODES =====

(define-constant err-listing-not-found (err u400))
(define-constant err-already-listed    (err u401))
(define-constant err-price-zero        (err u402))
(define-constant err-not-seller        (err u403))
(define-constant err-amount-zero       (err u404))

;; ===== NFT LISTINGS (bond-factory PT / YT) =====
;;
;; Key: bond-id (uint)
;; When listed the NFT is held by this contract (as-contract tx-sender).

(define-map pt-listings uint { seller: principal, price-sats: uint })
(define-map yt-listings uint { seller: principal, price-sats: uint })

;; ===== FT LISTINGS (vault-engine PT / YT) =====
;;
;; Each listing has a unique auto-incremented ID.
;; Tokens are escrowed in this contract for the listing duration.

(define-data-var ft-nonce uint u0)
(define-map vault-pt-listings uint { seller: principal, amount: uint, price-sats: uint })
(define-map vault-yt-listings uint { seller: principal, amount: uint, price-sats: uint })

;; ===== READ-ONLY =====

(define-read-only (get-pt-listing (bond-id uint))
  (map-get? pt-listings bond-id)
)

(define-read-only (get-yt-listing (bond-id uint))
  (map-get? yt-listings bond-id)
)

(define-read-only (get-vault-pt-listing (listing-id uint))
  (map-get? vault-pt-listings listing-id)
)

(define-read-only (get-vault-yt-listing (listing-id uint))
  (map-get? vault-yt-listings listing-id)
)

(define-read-only (get-ft-nonce)
  (var-get ft-nonce)
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

;; ===== VAULT-ENGINE PT (FT) =====

;; List vault PT fungible tokens for sale.
;; Tokens are escrowed in this contract.
;; Returns the new listing-id.
(define-public (list-vault-pt (amount uint) (price-sats uint))
  (let (
    (seller tx-sender)
    (id     (+ (var-get ft-nonce) u1))
  )
    (asserts! (> amount u0) err-amount-zero)
    (asserts! (> price-sats u0) err-price-zero)
    (try! (contract-call? .vault-engine transfer-pt amount seller (as-contract tx-sender)))
    (var-set ft-nonce id)
    (map-set vault-pt-listings id { seller: seller, amount: amount, price-sats: price-sats })
    (ok id)
  )
)

;; Cancel a vault PT listing and return tokens to seller.
(define-public (cancel-vault-pt (listing-id uint))
  (let (
    (seller  tx-sender)
    (listing (unwrap! (map-get? vault-pt-listings listing-id) err-listing-not-found))
    (amount  (get amount listing))
  )
    (asserts! (is-eq seller (get seller listing)) err-not-seller)
    (try! (as-contract (contract-call? .vault-engine transfer-pt amount tx-sender seller)))
    (map-delete vault-pt-listings listing-id)
    (ok true)
  )
)

;; Buy a vault PT listing. Transfers sBTC to seller and PT tokens to buyer.
(define-public (buy-vault-pt (listing-id uint))
  (let (
    (buyer   tx-sender)
    (listing (unwrap! (map-get? vault-pt-listings listing-id) err-listing-not-found))
    (seller  (get seller listing))
    (amount  (get amount listing))
    (price   (get price-sats listing))
  )
    (try! (contract-call? .sbtc-token transfer price buyer seller none))
    (try! (as-contract (contract-call? .vault-engine transfer-pt amount tx-sender buyer)))
    (map-delete vault-pt-listings listing-id)
    (ok true)
  )
)

;; ===== VAULT-ENGINE YT (FT) =====
;;
;; Uses vault-engine::transfer-yt (not ft-transfer? directly) to ensure
;; the yield checkpoint runs for both parties on every ownership change.

;; List vault YT fungible tokens for sale.
;; Returns the new listing-id.
(define-public (list-vault-yt (amount uint) (price-sats uint))
  (let (
    (seller tx-sender)
    (id     (+ (var-get ft-nonce) u1))
  )
    (asserts! (> amount u0) err-amount-zero)
    (asserts! (> price-sats u0) err-price-zero)
    (try! (contract-call? .vault-engine transfer-yt amount seller (as-contract tx-sender)))
    (var-set ft-nonce id)
    (map-set vault-yt-listings id { seller: seller, amount: amount, price-sats: price-sats })
    (ok id)
  )
)

;; Cancel a vault YT listing and return tokens to seller.
(define-public (cancel-vault-yt (listing-id uint))
  (let (
    (seller  tx-sender)
    (listing (unwrap! (map-get? vault-yt-listings listing-id) err-listing-not-found))
    (amount  (get amount listing))
  )
    (asserts! (is-eq seller (get seller listing)) err-not-seller)
    (try! (as-contract (contract-call? .vault-engine transfer-yt amount tx-sender seller)))
    (map-delete vault-yt-listings listing-id)
    (ok true)
  )
)

;; Buy a vault YT listing. Transfers sBTC to seller and YT tokens to buyer.
(define-public (buy-vault-yt (listing-id uint))
  (let (
    (buyer   tx-sender)
    (listing (unwrap! (map-get? vault-yt-listings listing-id) err-listing-not-found))
    (seller  (get seller listing))
    (amount  (get amount listing))
    (price   (get price-sats listing))
  )
    (try! (contract-call? .sbtc-token transfer price buyer seller none))
    (try! (as-contract (contract-call? .vault-engine transfer-yt amount tx-sender buyer)))
    (map-delete vault-yt-listings listing-id)
    (ok true)
  )
)
