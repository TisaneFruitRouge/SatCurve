;; bond-factory.clar
;;
;; Pendle-style yield-stripping for sBTC on Stacks (Nakamoto / Epoch 3.0).
;;
;; A user locks sBTC and receives two independently transferable NFTs:
;;   PT (principal-token) -- redeems for the original sBTC at a fixed maturity block
;;   YT (yield-token)    -- collects the actual stacking rewards deposited by the relayer
;;
;; Yield is VARIABLE: the relayer bot calls deposit-yield each PoX cycle with real
;; stacking rewards. The YT holder calls collect-yield to claim accumulated rewards.
;; The YT NFT is NOT burned on collect-yield -- it can be claimed multiple times.
;;
;; --- sBTC unit ---
;;   1 uint = 1 satoshi (8 decimal places)
;;   1 sBTC = u100_000_000
;;
;; --- Yield accounting (per-bond) ---
;;   yield-deposited: total sBTC sent by the relayer for this bond
;;   yield-withdrawn: total sBTC paid out to YT holders
;;   available       = yield-deposited - yield-withdrawn
;;
;; --- combine (early exit) ---
;;   Burn PT + YT together before maturity to reconstitute the original sBTC
;;   plus any uncollected yield. Useful when both tokens are held by the same party.

;; ===== CONSTANTS =====

(define-constant contract-owner tx-sender)

(define-constant MAX-TERM-BLOCKS u12614400) ;; 2 years max

;; Error codes (u100 shared with oracle; u200+ bond-factory-specific)
(define-constant err-unauthorized             (err u100))
(define-constant err-bond-not-found           (err u200))
(define-constant err-not-matured              (err u201))
(define-constant err-already-redeemed         (err u202))
(define-constant err-not-pt-owner             (err u203))
(define-constant err-not-yt-owner             (err u204))
(define-constant err-invalid-amount           (err u205))
(define-constant err-invalid-term             (err u206))
(define-constant err-already-combined         (err u207))
(define-constant err-deposit-after-maturity   (err u208))
(define-constant err-combine-after-maturity   (err u209))

;; ===== TOKENS =====

;; PT NFT: bond-id (uint) uniquely identifies each principal claim
(define-non-fungible-token principal-token uint)

;; YT NFT: same bond-id, different token type
(define-non-fungible-token yield-token uint)

;; ===== STATE =====

(define-data-var next-bond-id uint u0)

(define-map bonds uint {
  sbtc-amount:        uint,  ;; sBTC locked (satoshis)
  maturity-block:     uint,  ;; PT redeemable at/after this block
  created-block:      uint,
  principal-redeemed: bool,  ;; true after redeem-principal succeeds
  combined:           bool,  ;; true after combine (early PT+YT burn)
  yield-deposited:    uint,  ;; cumulative sBTC deposited by relayer
  yield-withdrawn:    uint,  ;; cumulative sBTC paid out to YT holders
})

;; ===== READ-ONLY =====

(define-read-only (get-bond (bond-id uint))
  (match (map-get? bonds bond-id)
    bond (ok bond)
    err-bond-not-found)
)

(define-read-only (get-pt-owner (bond-id uint))
  (nft-get-owner? principal-token bond-id)
)

(define-read-only (get-yt-owner (bond-id uint))
  (nft-get-owner? yield-token bond-id)
)

;; Returns the uncollected yield available to the current YT holder.
(define-read-only (get-available-yield (bond-id uint))
  (match (map-get? bonds bond-id)
    bond (ok (- (get yield-deposited bond) (get yield-withdrawn bond)))
    err-bond-not-found)
)

(define-read-only (get-bond-count)
  (ok (var-get next-bond-id))
)

;; ===== PUBLIC: Bond Creation =====

;; Lock sbtc-amount sBTC for term-blocks blocks.
;; Mints PT NFT and YT NFT to the caller. No oracle call -- yield is variable.
(define-public (create-bond (sbtc-amount uint) (term-blocks uint))
  (begin
    (asserts! (> sbtc-amount u0) err-invalid-amount)
    (asserts! (and (> term-blocks u0) (<= term-blocks MAX-TERM-BLOCKS)) err-invalid-term)

    (let (
      (bond-id  (var-get next-bond-id))
      (maturity (+ block-height term-blocks))
    )
      ;; Pull sBTC from caller into this contract.
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer sbtc-amount tx-sender (as-contract tx-sender) none))

      ;; Mint PT and YT NFTs to the caller
      (try! (nft-mint? principal-token bond-id tx-sender))
      (try! (nft-mint? yield-token bond-id tx-sender))

      ;; Store bond data
      (map-set bonds bond-id {
        sbtc-amount:        sbtc-amount,
        maturity-block:     maturity,
        created-block:      block-height,
        principal-redeemed: false,
        combined:           false,
        yield-deposited:    u0,
        yield-withdrawn:    u0,
      })

      (var-set next-bond-id (+ bond-id u1))
      (ok bond-id)
    )
  )
)

;; ===== PUBLIC: Yield Deposit (relayer) =====

;; Deposit sBTC as stacking rewards for a specific bond. Owner-only.
;; Rejects deposits after the bond's maturity block.
(define-public (deposit-yield (bond-id uint) (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-unauthorized)
    (let (
      (bond (unwrap! (map-get? bonds bond-id) err-bond-not-found))
    )
      (asserts! (not (get combined bond)) err-already-combined)
      (asserts! (< block-height (get maturity-block bond)) err-deposit-after-maturity)
      (asserts! (> amount u0) err-invalid-amount)

      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer amount tx-sender (as-contract tx-sender) none))

      (let ((new-deposited (+ (get yield-deposited bond) amount)))
        (map-set bonds bond-id (merge bond { yield-deposited: new-deposited }))
        (ok new-deposited)
      )
    )
  )
)

;; ===== PUBLIC: YT Yield Collection =====

;; Collect accumulated but uncollected yield for a bond. YT holder only.
;; Does NOT burn the YT NFT -- callable multiple times as rewards accumulate.
;; Returns (ok u0) if no yield is available yet (not an error).
(define-public (collect-yield (bond-id uint))
  (let (
    (bond      (unwrap! (map-get? bonds bond-id) err-bond-not-found))
    (claimer   tx-sender)
    (available (- (get yield-deposited bond) (get yield-withdrawn bond)))
  )
    (asserts! (is-eq (some tx-sender) (nft-get-owner? yield-token bond-id)) err-not-yt-owner)

    (if (> available u0)
      (begin
        (map-set bonds bond-id (merge bond {
          yield-withdrawn: (+ (get yield-withdrawn bond) available)
        }))
        (try! (as-contract
          (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
            transfer available tx-sender claimer none)))
        (ok available)
      )
      (ok u0)
    )
  )
)

;; ===== PUBLIC: PT Redemption =====

;; Burns the PT NFT and returns the original sBTC to the caller.
;; Only callable at or after the maturity block.
(define-public (redeem-principal (bond-id uint))
  (let (
    (bond      (unwrap! (map-get? bonds bond-id) err-bond-not-found))
    (recipient tx-sender)
  )
    ;; Check already-combined and already-redeemed first: once the PT NFT is burned
    ;; it has no owner, so putting the ownership check first would return
    ;; err-not-pt-owner on a double-redeem attempt, hiding the more informative error.
    (asserts! (not (get combined bond)) err-already-combined)
    (asserts! (not (get principal-redeemed bond)) err-already-redeemed)
    (asserts! (is-eq (some tx-sender) (nft-get-owner? principal-token bond-id)) err-not-pt-owner)
    (asserts! (>= block-height (get maturity-block bond)) err-not-matured)

    (try! (nft-burn? principal-token bond-id tx-sender))
    (map-set bonds bond-id (merge bond { principal-redeemed: true }))

    ;; Send principal back. Contract is sender inside as-contract.
    (try! (as-contract
      (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer (get sbtc-amount bond) tx-sender recipient none)))

    (ok (get sbtc-amount bond))
  )
)

;; ===== PUBLIC: Combine (early exit) =====

;; Burns PT + YT together before maturity to reconstitute the locked sBTC.
;; Returns principal + any uncollected yield. Caller must hold both NFTs.
(define-public (combine (bond-id uint))
  (let (
    (bond        (unwrap! (map-get? bonds bond-id) err-bond-not-found))
    (recipient   tx-sender)
    (uncollected (- (get yield-deposited bond) (get yield-withdrawn bond)))
  )
    (asserts! (not (get combined bond)) err-already-combined)
    (asserts! (not (get principal-redeemed bond)) err-already-redeemed)
    (asserts! (< block-height (get maturity-block bond)) err-combine-after-maturity)
    (asserts! (is-eq (some tx-sender) (nft-get-owner? principal-token bond-id)) err-not-pt-owner)
    (asserts! (is-eq (some tx-sender) (nft-get-owner? yield-token bond-id)) err-not-yt-owner)

    (try! (nft-burn? principal-token bond-id tx-sender))
    (try! (nft-burn? yield-token bond-id tx-sender))

    (map-set bonds bond-id (merge bond {
      combined:        true,
      yield-withdrawn: (get yield-deposited bond),
    }))

    ;; Return principal
    (try! (as-contract
      (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer (get sbtc-amount bond) tx-sender recipient none)))

    ;; Return uncollected yield if any
    (if (> uncollected u0)
      (try! (as-contract
        (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer uncollected tx-sender recipient none)))
      true)

    (ok (+ (get sbtc-amount bond) uncollected))
  )
)

;; ===== PUBLIC: NFT Transfers =====

;; Transfer the PT NFT (principal claim) to another address.
(define-public (transfer-pt (bond-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) err-unauthorized)
    (try! (nft-transfer? principal-token bond-id sender recipient))
    (ok true)
  )
)

;; Transfer the YT NFT (yield claim) to another address.
(define-public (transfer-yt (bond-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) err-unauthorized)
    (try! (nft-transfer? yield-token bond-id sender recipient))
    (ok true)
  )
)
