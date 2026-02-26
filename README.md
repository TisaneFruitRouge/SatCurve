This is the blueprint for **SatCurve**. In a hackathon setting, a professional README is often the difference between a "cool idea" and a "winning project" because it proves you’ve mapped out the edge cases.

---

# SatCurve: The Bitcoin Yield Curve

**Fixed-Rate Lending & Zero-Coupon Bonds on Stacks L2**

### Project Vision

Bitcoin is the world’s premier collateral, yet its DeFi ecosystem is plagued by volatile, unpredictable yields. **SatCurve** brings institutional-grade debt markets to Bitcoin. By leveraging **sBTC** and the **Nakamoto Release**, SatCurve allows users to mint "Zero-Coupon Bonds" (zBTC) that mature at a 1:1 ratio with Bitcoin, creating the first decentralized, fixed-rate yield curve for the Bitcoin economy.

---

### Technical Architecture

The architecture is designed to be "Bitcoin-native," meaning it prioritizes security and predictability over complex, opaque abstractions.

#### **1. The Protocol Layers**

* **Settlement Layer (Bitcoin L1):** Finality and security. Native BTC is locked in the Stacks threshold multisig.
* **Execution Layer (Stacks L2):** High-speed (5s) blocks using Clarity 2.0. This handles the vault logic and sBTC movement.
* **Liquidity Layer (sBTC):** The 1:1 Bitcoin-backed asset used as the primary engine for the bonds.

#### **2. Core Smart Contract Components (Clarity)**

* **`vault-engine.clar`**: Manages user collateral (STX or sBTC). It tracks the "Health Factor" of every position.
* **`bond-factory.clar`**: Mints SIP-010 compatible **zBTC tokens**. Each token is timestamped with a Bitcoin block height maturity date (e.g., `zBTC-AUG-26`).
* **`yield-oracle.clar`**: Pulls real-time price data from **Pyth Network** to ensure vaults stay over-collateralized.
* **`redemption-pool.clar`**: A locked reserve that ensures 1 zBTC can always be swapped for 1 sBTC once the Bitcoin block height reaches maturity.

#### **3. The "Decidability" Safety Engine**

Unlike Ethereum’s Solidity, SatCurve utilizes Clarity’s **post-conditions**. Every transaction includes a "Safety Guard" that will abort the execution if the contract attempts to transfer more BTC than the user explicitly authorized in the UI.

---

### The User Workflow

1. **Deposit:** User deposits 1.1 sBTC as collateral into a SatCurve Vault.
2. **Mint:** The protocol calculates the "Discount Rate" (e.g., 5%). The user mints **1 zBTC** (Face Value) but only "owes" the discounted value.
3. **Utilize:** The user sells that zBTC on the secondary market for immediate liquidity OR holds it to earn the "Fixed Yield" as it approaches maturity.
4. **Redeem:** On the maturity date (e.g., Bitcoin Block #950,000), any holder of 1 zBTC can burn it to claim 1 sBTC from the SatCurve reserve.

---

### Technical Challenges & Solutions

| Challenge | SatCurve Solution |
| --- | --- |
| **Oracle Latency** | Integration with **RedStone Oracles** for sub-minute price updates on Stacks. |
| **Liquidation Fairness** | **"First-look" Liquidation:** A 5-block window where the vault owner can self-repay before the public can trigger a liquidation. |
| **Capital Efficiency** | **Tiered Collateral:** Allowing "Stacking" rewards from locked STX to automatically pay down the zBTC debt interest. |
| **Time Sync** | All protocol maturity dates are pegged to **Bitcoin Block Height**, not Unix timestamps, ensuring L1/L2 synchronization. |

---

### Roadmap for the Hackathon

* **Phase 1:** Deploy the `zBTC` SIP-010 token and basic Vault contract on Devnet.
* **Phase 2:** Integrate **Stacks.js** with **sBTC** testnet tokens for the "Minting" UI.
* **Phase 3:** Implement the **Liquidation Bot** (Node.js) that monitors the `vault-engine` map.
* **Phase 4:** Finalize the "Yield Dashboard" showing the implied APY for different bond durations.

---

### Security Audit Logic (The Pitch)

* **No Re-entrancy:** Clarity is non-Turing complete; the "DAO Hack" style of exploit is mathematically impossible on SatCurve.
* **Non-Custodial:** At no point does the SatCurve team have access to the underlying BTC; the protocol is governed by the decentralized Stacker set.
