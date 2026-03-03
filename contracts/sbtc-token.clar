;; sbtc-token - devnet/simnet mock
;;
;; Same interface as the real sbtc-token, but protocol functions bypass
;; the sbtc-registry caller check so they work without the full sBTC signing
;; stack. Also adds a public `mint` for easy wallet funding via make init.
;;
;; The cache file (.cache/requirements/SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token.clar)
;; is kept in sync with this file - it is what both devnet and simnet plans actually read.

(define-fungible-token sbtc-token)
(define-fungible-token sbtc-token-locked)

(define-constant ERR_NOT_OWNER (err u4))
(define-constant ERR_TRANSFER_INDEX_PREFIX u1000)

(define-data-var token-name (string-ascii 32) "sBTC")
(define-data-var token-symbol (string-ascii 10) "sBTC")
(define-data-var token-uri (optional (string-utf8 256)) (some u"https://example.com"))
(define-constant token-decimals u8)

;; -- Devnet helper ----------------------------------------------------------
;; Anyone can mint - used by init-devnet.ts to fund test wallets.
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? sbtc-token amount recipient)
)

;; -- Protocol functions (no registry check) ---------------------------------

(define-public (protocol-mint (amount uint) (recipient principal) (contract-flag (buff 1)))
  (ft-mint? sbtc-token amount recipient)
)

(define-public (protocol-lock (amount uint) (owner principal) (contract-flag (buff 1)))
  (begin
    (try! (ft-burn? sbtc-token amount owner))
    (ft-mint? sbtc-token-locked amount owner)
  )
)

(define-public (protocol-unlock (amount uint) (owner principal) (contract-flag (buff 1)))
  (begin
    (try! (ft-burn? sbtc-token-locked amount owner))
    (ft-mint? sbtc-token amount owner)
  )
)

(define-public (protocol-burn (amount uint) (owner principal) (contract-flag (buff 1)))
  (ft-burn? sbtc-token amount owner)
)

(define-public (protocol-burn-locked (amount uint) (owner principal) (contract-flag (buff 1)))
  (ft-burn? sbtc-token-locked amount owner)
)

(define-public (protocol-set-name (new-name (string-ascii 32)) (contract-flag (buff 1)))
  (ok (var-set token-name new-name))
)

(define-public (protocol-set-symbol (new-symbol (string-ascii 10)) (contract-flag (buff 1)))
  (ok (var-set token-symbol new-symbol))
)

(define-public (protocol-set-token-uri (new-uri (optional (string-utf8 256))) (contract-flag (buff 1)))
  (ok (var-set token-uri new-uri))
)

(define-private (protocol-mint-many-iter (item {amount: uint, recipient: principal}))
  (ft-mint? sbtc-token (get amount item) (get recipient item))
)

(define-public (protocol-mint-many (recipients (list 200 {amount: uint, recipient: principal})) (contract-flag (buff 1)))
  (ok (map protocol-mint-many-iter recipients))
)

;; -- SIP-010 transfer -------------------------------------------------------

(define-public (transfer-many
  (recipients (list 200 {amount: uint, sender: principal, to: principal, memo: (optional (buff 34))})))
  (fold transfer-many-iter recipients (ok u0))
)

(define-private (transfer-many-iter
  (individual-transfer {amount: uint, sender: principal, to: principal, memo: (optional (buff 34))})
  (result (response uint uint)))
  (match result
    index
    (begin
      (unwrap!
        (transfer
          (get amount individual-transfer)
          (get sender individual-transfer)
          (get to individual-transfer)
          (get memo individual-transfer))
        (err (+ ERR_TRANSFER_INDEX_PREFIX index)))
      (ok (+ index u1))
    )
    err-index (err err-index)
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq contract-caller sender)) ERR_NOT_OWNER)
    (try! (ft-transfer? sbtc-token amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

;; -- Read-only --------------------------------------------------------------

(define-read-only (get-name) (ok (var-get token-name)))
(define-read-only (get-symbol) (ok (var-get token-symbol)))
(define-read-only (get-decimals) (ok token-decimals))
(define-read-only (get-balance (who principal))
  (ok (+ (ft-get-balance sbtc-token who) (ft-get-balance sbtc-token-locked who)))
)
(define-read-only (get-balance-available (who principal))
  (ok (ft-get-balance sbtc-token who))
)
(define-read-only (get-balance-locked (who principal))
  (ok (ft-get-balance sbtc-token-locked who))
)
(define-read-only (get-total-supply)
  (ok (+ (ft-get-supply sbtc-token) (ft-get-supply sbtc-token-locked)))
)
(define-read-only (get-token-uri) (ok (var-get token-uri)))
