;; vault-engine.clar
;;
;; Pool-level yield-stripping for sBTC on Stacks (Nakamoto / Epoch 3.0).
;;
;; Users deposit sBTC and receive PT (principal-token) and YT (yield-token)
;; fungible tokens 1:1 with their deposit (1 sat deposited = 1 PT + 1 YT).
;;
;; PT is redeemable for 1 sBTC per unit at or after the pool maturity block.
;; YT accrues stacking rewards distributed via the Global Yield Index pattern,
;; so yield distributes proportionally to all YT holders without any loops.
;;
;; Core invariant: ft-get-supply(principal-token) == total sBTC in redemption-pool
;;   (principal portion only; yield sBTC is tracked separately via the index).
;;
;; --- sBTC unit ---
;;   1 uint = 1 satoshi.   1 sBTC = u100_000_000
;;
;; --- Global Yield Index ---
;;   yield-index accumulates (reward * PRECISION / total-yt-supply) each sync-yield.
;;   Per-user claimable = yt-balance * yield-index / PRECISION - reward-debt[user]
;;   plus any yield settled into pending-yield[user] at previous checkpoints.

;; ===== CONSTANTS =====

(define-constant contract-owner tx-sender)

;; 1e12 scaling factor for yield-index to preserve sub-satoshi precision in the
;; per-token accumulator before the final division.
(define-constant PRECISION u1000000000000)

(define-constant err-unauthorized        (err u100))
(define-constant err-not-matured         (err u201))
(define-constant err-already-matured     (err u202))
(define-constant err-invalid-amount      (err u205))
(define-constant err-not-initialized     (err u210))
(define-constant err-already-initialized (err u211))
(define-constant err-no-yt-supply        (err u212))

;; ===== TOKENS =====

;; PT: 1 unit redeemable for 1 satoshi of sBTC at/after maturity
(define-fungible-token principal-token)

;; YT: 1 unit entitles holder to a proportional share of accrued stacking rewards
(define-fungible-token yield-token)

;; ===== STATE =====

(define-data-var maturity-block uint u0)
(define-data-var initialized    bool false)

;; Global yield index. Increases by (reward * PRECISION / yt-supply) each sync-yield.
(define-data-var yield-index uint u0)

;; Per-user yield accounting:
;;   pending-yield  -- settled sats from past interactions, ready to claim
;;   reward-debt    -- yt-balance * yield-index / PRECISION at last checkpoint
(define-map pending-yield principal uint)
(define-map reward-debt   principal uint)

;; ===== PRIVATE: CHECKPOINT =====

;; Settle any yield that has accrued since the user's last interaction into
;; pending-yield[user], then update reward-debt to the current index.
;; Must be called before any change to a user's YT balance.
(define-private (checkpoint (user principal))
  (let (
    (yt-bal      (ft-get-balance yield-token user))
    (idx         (var-get yield-index))
    (debt        (default-to u0 (map-get? reward-debt user)))
    (pending     (default-to u0 (map-get? pending-yield user)))
    (new-accrued (/ (* yt-bal idx) PRECISION))
    (delta       (if (> new-accrued debt) (- new-accrued debt) u0))
  )
    (map-set pending-yield user (+ pending delta))
    (map-set reward-debt   user new-accrued)
  )
)

;; ===== READ-ONLY =====

(define-read-only (get-maturity-block)
  (if (var-get initialized)
    (ok (var-get maturity-block))
    err-not-initialized)
)

(define-read-only (get-yield-index)
  (ok (var-get yield-index))
)

(define-read-only (get-pt-balance (user principal))
  (ok (ft-get-balance principal-token user))
)

(define-read-only (get-yt-balance (user principal))
  (ok (ft-get-balance yield-token user))
)

(define-read-only (get-pt-total-supply)
  (ok (ft-get-supply principal-token))
)

(define-read-only (get-yt-total-supply)
  (ok (ft-get-supply yield-token))
)

;; Preview claimable yield for `user` without changing any state.
(define-read-only (get-claimable-yield (user principal))
  (let (
    (yt-bal      (ft-get-balance yield-token user))
    (idx         (var-get yield-index))
    (debt        (default-to u0 (map-get? reward-debt user)))
    (pending     (default-to u0 (map-get? pending-yield user)))
    (new-accrued (/ (* yt-bal idx) PRECISION))
    (delta       (if (> new-accrued debt) (- new-accrued debt) u0))
  )
    (ok (+ pending delta))
  )
)

;; ===== PUBLIC: Initialization =====

;; Configure the pool maturity block. Owner-only, one-time.
;; After this call, deposits are accepted until block-height reaches mb.
(define-public (initialize (mb uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
    (asserts! (not (var-get initialized)) err-already-initialized)
    (asserts! (> mb u0) err-invalid-amount)
    (var-set maturity-block mb)
    (var-set initialized true)
    (ok true)
  )
)

;; ===== PUBLIC: Deposit =====

;; Deposit sBTC into the pool before maturity.
;; Mints PT + YT to the caller 1:1 with the deposited amount.
;; sBTC is escrowed directly into redemption-pool (one hop, no intermediate hold).
(define-public (deposit (amount uint))
  (let ((caller tx-sender))
    (asserts! (var-get initialized) err-not-initialized)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (< block-height (var-get maturity-block)) err-already-matured)

    ;; Settle any pending yield before balance change
    (checkpoint caller)

    ;; Pull sBTC from caller into redemption-pool
    (try! (contract-call? .redemption-pool escrow amount caller))

    ;; Mint PT + YT to caller
    (try! (ft-mint? principal-token amount caller))
    (try! (ft-mint? yield-token amount caller))

    ;; Set reward-debt based on new YT balance so caller earns no retroactive yield
    (let ((new-yt-bal (ft-get-balance yield-token caller)))
      (map-set reward-debt caller (/ (* new-yt-bal (var-get yield-index)) PRECISION))
    )

    (ok (ft-get-balance principal-token caller))
  )
)

;; ===== PUBLIC: Sync Yield =====

;; Deposit stacking rewards into the pool and update the global yield index.
;; Owner-only -- called by the relayer bot each PoX cycle.
;; Reverts if no YT supply exists (no depositors to distribute to).
(define-public (sync-yield (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
    (asserts! (var-get initialized) err-not-initialized)
    (asserts! (> amount u0) err-invalid-amount)

    (let ((supply (ft-get-supply yield-token)))
      (asserts! (> supply u0) err-no-yt-supply)

      ;; Escrow the reward sBTC into redemption-pool
      (try! (contract-call? .redemption-pool escrow amount tx-sender))

      (let ((new-index (+ (var-get yield-index) (/ (* amount PRECISION) supply))))
        (var-set yield-index new-index)
        (ok new-index)
      )
    )
  )
)

;; ===== PUBLIC: Claim Yield =====

;; Claim all accumulated stacking rewards for the caller.
;; YT is NOT burned -- callable repeatedly as new rewards arrive via sync-yield.
;; Returns (ok u0) if no yield is available yet (not an error).
(define-public (claim-yield)
  (let ((caller tx-sender))
    (asserts! (var-get initialized) err-not-initialized)

    (checkpoint caller)

    (let ((claimable (default-to u0 (map-get? pending-yield caller))))
      (if (> claimable u0)
        (begin
          (map-set pending-yield caller u0)
          (try! (contract-call? .redemption-pool release claimable caller))
          (ok claimable)
        )
        (ok u0)
      )
    )
  )
)

;; ===== PUBLIC: Redeem Principal =====

;; Burn PT at or after maturity to receive back the escrowed sBTC.
;; Partial redemptions are supported (burn any amount up to PT balance).
(define-public (redeem-principal (amount uint))
  (let ((caller tx-sender))
    (asserts! (var-get initialized) err-not-initialized)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (>= block-height (var-get maturity-block)) err-not-matured)
    (asserts! (>= (ft-get-balance principal-token caller) amount) err-invalid-amount)

    (try! (ft-burn? principal-token amount caller))
    (try! (contract-call? .redemption-pool release amount caller))
    (ok amount)
  )
)

;; ===== PUBLIC: Combine =====

;; Burn PT + YT before maturity to immediately retrieve the locked sBTC.
;; Automatically settles and pays out all pending yield to the caller.
;; Partial combines are supported (burn any amount up to min(PT, YT) balance).
(define-public (combine (amount uint))
  (let ((caller tx-sender))
    (asserts! (var-get initialized) err-not-initialized)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (< block-height (var-get maturity-block)) err-already-matured)
    (asserts! (>= (ft-get-balance principal-token caller) amount) err-invalid-amount)
    (asserts! (>= (ft-get-balance yield-token caller) amount) err-invalid-amount)

    ;; Settle all pending yield before burning YT
    (checkpoint caller)
    (let ((yield-out (default-to u0 (map-get? pending-yield caller))))
      (map-set pending-yield caller u0)

      ;; Burn PT + YT
      (try! (ft-burn? principal-token amount caller))
      (try! (ft-burn? yield-token amount caller))

      ;; Update reward-debt to reflect new (lower) YT balance
      (let ((new-yt-bal (ft-get-balance yield-token caller)))
        (map-set reward-debt caller (/ (* new-yt-bal (var-get yield-index)) PRECISION))
      )

      ;; Release principal
      (try! (contract-call? .redemption-pool release amount caller))

      ;; Release yield if any (u0 in false branch keeps type consistent with try!'s uint)
      (if (> yield-out u0)
        (try! (contract-call? .redemption-pool release yield-out caller))
        u0)

      (ok (+ amount yield-out))
    )
  )
)

;; ===== PUBLIC: NFT Transfers =====

;; Transfer PT to another address. No yield side effects (PT holds no yield).
(define-public (transfer-pt (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) err-unauthorized)
    (try! (ft-transfer? principal-token amount sender recipient))
    (ok true)
  )
)

;; Transfer YT to another address.
;; Checkpoints both sender and recipient before the balance change so
;; neither party loses or gains yield they did not earn.
(define-public (transfer-yt (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) err-unauthorized)

    ;; Settle pending yield for both parties at current index
    (checkpoint sender)
    (checkpoint recipient)

    (try! (ft-transfer? yield-token amount sender recipient))

    ;; Rebase reward-debt on new balances so future accrual starts from here
    (let (
      (idx            (var-get yield-index))
      (new-sender-bal (ft-get-balance yield-token sender))
      (new-recip-bal  (ft-get-balance yield-token recipient))
    )
      (map-set reward-debt sender    (/ (* new-sender-bal idx) PRECISION))
      (map-set reward-debt recipient (/ (* new-recip-bal  idx) PRECISION))
    )

    (ok true)
  )
)
