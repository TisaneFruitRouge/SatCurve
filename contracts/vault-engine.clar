;; vault-engine.clar
;; Manages user collateral (sBTC/STX), tracks Health Factor per position.
;; Emits events for the liquidation bot to monitor.
;;
;; Health Factor = (collateral_value * 100) / debt_value
;; A position is at risk when health factor falls below 110.
;;
;; Liquidation: 5-block "first-look" window where vault owner can self-repay
;; before the public can trigger liquidation.
;;
;; TODO: Implement deposit-collateral, withdraw-collateral, get-health-factor,
;;       liquidate, self-repay, get-all-at-risk-positions
