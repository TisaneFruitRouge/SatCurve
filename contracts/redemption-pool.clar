;; redemption-pool.clar
;;
;; sBTC escrow layer for the vault-engine pool.
;; Holds all principal sBTC deposited by users and yield sBTC from the relayer.
;;
;; Only the authorized vault-engine contract may call escrow or release.
;; Because redemption-pool is deployed before vault-engine, the authorized
;; address is configured post-deployment via set-vault-engine.

;; ===== CONSTANTS =====

(define-constant contract-owner tx-sender)

(define-constant err-unauthorized   (err u100))
(define-constant err-already-set    (err u300))
(define-constant err-invalid-amount (err u301))

;; ===== STATE =====

;; Address of the vault-engine contract authorized to call escrow/release.
(define-data-var vault-engine-principal (optional principal) none)

;; Running total of sBTC held in this contract.
(define-data-var total-escrowed uint u0)

;; ===== PRIVATE =====

;; True only when called by the authorized vault-engine contract.
(define-private (is-vault-engine)
  (match (var-get vault-engine-principal)
    ve (is-eq contract-caller ve)
    false)
)

;; ===== READ-ONLY =====

(define-read-only (get-total-escrowed)
  (ok (var-get total-escrowed))
)

(define-read-only (get-vault-engine)
  (ok (var-get vault-engine-principal))
)

;; ===== PUBLIC =====

;; Set the vault-engine address. Owner-only, one-time configuration.
(define-public (set-vault-engine (ve principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
    (asserts! (is-none (var-get vault-engine-principal)) err-already-set)
    (var-set vault-engine-principal (some ve))
    (ok true)
  )
)

;; Transfer sBTC from `from` into this contract.
;; Called by vault-engine on user deposit and on sync-yield.
;; `from` must be the original tx-sender so the sBTC transfer is authorized.
(define-public (escrow (amount uint) (from principal))
  (begin
    (asserts! (is-vault-engine) err-unauthorized)
    (asserts! (> amount u0) err-invalid-amount)
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      transfer amount from (as-contract tx-sender) none))
    (let ((new-total (+ (var-get total-escrowed) amount)))
      (var-set total-escrowed new-total)
      (ok new-total)
    )
  )
)

;; Transfer sBTC from this contract to `recipient`.
;; Called by vault-engine on claim-yield, redeem-principal, and combine.
(define-public (release (amount uint) (recipient principal))
  (begin
    (asserts! (is-vault-engine) err-unauthorized)
    (asserts! (> amount u0) err-invalid-amount)
    (try! (as-contract
      (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer amount tx-sender recipient none)))
    (let ((new-total (- (var-get total-escrowed) amount)))
      (var-set total-escrowed new-total)
      (ok new-total)
    )
  )
)
