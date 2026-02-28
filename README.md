# SatCurve: Bitcoin Yield Stripping on Stacks

SatCurve is a Pendle-style yield-stripping protocol for **sBTC** on the Stacks L2 (Nakamoto / Epoch 3.0). It lets users decompose locked Bitcoin into two independently tradeable claims:

- **PT — Principal Token** (NFT): a zero-coupon bond that redeems for the original sBTC at a fixed maturity block.
- **YT — Yield Token** (NFT): a variable yield claim that collects real sBTC stacking rewards deposited by a relayer bot over the bond's lifetime.

The core invariant is: **1 sBTC locked = 1 PT + 1 YT**. Both tokens can be held, transferred, or traded separately, enabling a decentralized fixed-rate / floating-rate market on Bitcoin yield.

---

## How It Works

### Locking (create-bond)

A user calls `create-bond(sbtc-amount, term-blocks)`. The protocol:

1. Pulls `sbtc-amount` sBTC into the contract.
2. Mints a **PT NFT** (bond-id) to the caller — redeemable for `sbtc-amount` at/after `block-height + term-blocks`.
3. Mints a **YT NFT** (bond-id) to the caller — entitled to all stacking rewards deposited for that bond.

No oracle call, no APR snapshot. The protocol is a pure custody mechanism at creation time.

### Yield Accumulation (deposit-yield)

An off-chain relayer bot watches the Stacks network for sBTC stacking rewards and calls `deposit-yield(bond-id, amount)` each PoX cycle, depositing the actual earned rewards into the contract. Deposits are only accepted before maturity.

### Collecting Yield (collect-yield)

The YT holder calls `collect-yield(bond-id)` at any time to claim accumulated but uncollected rewards. This can be called multiple times as new rewards arrive. **The YT NFT is not burned** — the same token keeps collecting across PoX cycles.

### Redeeming Principal (redeem-principal)

At or after the maturity block, the PT holder calls `redeem-principal(bond-id)` to burn the PT NFT and receive back the original `sbtc-amount`.

### Early Exit (combine)

If the same address holds both PT and YT, they can call `combine(bond-id)` before maturity to burn both NFTs and immediately receive the original sBTC plus any uncollected yield. This is the protocol's "undo" mechanism.

### Secondary Market

Both PT and YT are transferable NFTs via `transfer-pt` and `transfer-yt`. This enables:

- **PT market**: PT trades at a discount to sBTC face value, implying a fixed yield to maturity.
- **YT market**: YT is priced on expected future stacking rewards, a floating-rate instrument.

---

## Contracts

| Contract | Status | Description |
|---|---|---|
| `yield-oracle.clar` | **Implemented** | Authorized relayer oracle for BTC/USD, STX/USD prices and Stacking APR |
| `bond-factory.clar` | **Implemented** | PT + YT NFT lifecycle: create, deposit-yield, collect-yield, redeem, combine |
| `redemption-pool.clar` | **Implemented** | sBTC escrow layer; only vault-engine may call escrow/release |
| `vault-engine.clar` | **Implemented** | Pool-level yield stripping: fungible PT + YT tokens, Global Yield Index |

---

## yield-oracle.clar

Stores three data feeds pushed on-chain by authorized relayers (RedStone pull model). Consuming contracts call the `get-trusted-*` functions, which revert if the data is stale.

| Feed | Unit | Staleness window |
|---|---|---|
| BTC/USD | 6 decimals ($1 = u1_000_000) | 300 blocks (~25 min) |
| STX/USD | 6 decimals | 300 blocks (~25 min) |
| Stacking APR | Basis points (1 bps = 0.01%) | 4320 blocks (~6 hours) |

BTC/USD and STX/USD are used together to derive the implicit BTC/STX rate for vault health factor calculations.

**Key functions:**

- `set-prices(btc-price, stx-price)` — atomic dual-feed update for the relayer
- `set-stacking-apr(apr)` — update stacking APR once per PoX cycle
- `get-trusted-btc-price` / `get-trusted-stx-price` / `get-trusted-stacking-apr` — gated getters that revert on stale data
- `authorize-relayer(principal)` / `revoke-relayer(principal)` — owner-only relayer management

---

## bond-factory.clar

The core product. Manages the full lifecycle of PT and YT NFTs backed by locked sBTC.

### sBTC Units

`1 uint = 1 satoshi`. `1 sBTC = u100_000_000`.

### Bond Data

Each bond (identified by a `uint` bond-id) stores:

```
sbtc-amount        — sBTC locked (satoshis)
maturity-block     — PT redeemable at/after this Stacks block
created-block
principal-redeemed — true after redeem-principal
combined           — true after combine (early exit)
yield-deposited    — cumulative sBTC deposited by the relayer
yield-withdrawn    — cumulative sBTC paid out to YT holders
```

### Error Codes

| Code | Meaning |
|---|---|
| u100 | Unauthorized |
| u200 | Bond not found |
| u201 | Not yet matured |
| u202 | Principal already redeemed |
| u203 | Caller is not the PT owner |
| u204 | Caller is not the YT owner |
| u205 | Invalid amount (zero) |
| u206 | Invalid term (zero or exceeds 2-year max) |
| u207 | Bond already combined |
| u208 | Cannot deposit yield after maturity |
| u209 | Cannot combine at or after maturity |

### Constants

- `MAX-TERM-BLOCKS = u12614400` — 2-year maximum bond term (~5 s/block on Nakamoto)

---

## Development

**Requirements:** [Clarinet](https://github.com/hirosystems/clarinet) 3.x, Node.js, pnpm.

```bash
# Install dependencies
pnpm install

# Check all contracts for syntax and type errors
clarinet check

# Run all tests (vitest + clarinet-sdk)
pnpm test:contracts
```

**Test coverage:** 151 tests across 4 contracts (48 yield-oracle, 42 bond-factory, 13 redemption-pool, 48 vault-engine).

---

## Architecture

```
Bitcoin L1
    |  (sBTC peg — threshold multisig)
    v
Stacks L2 (Nakamoto, Epoch 3.0, ~5s blocks)
    |
    +-- yield-oracle.clar      <-- relayer pushes BTC/USD, STX/USD, Stacking APR
    |
    +-- bond-factory.clar      <-- users lock sBTC, receive PT + YT NFTs
    |       |
    |       +-- PT NFT  -->  secondary market (fixed-rate buyers)
    |       +-- YT NFT  -->  secondary market (yield seekers)
    |
    +-- vault-engine.clar      <-- pool model: fungible PT+YT, Global Yield Index
    |       |
    |       +-- PT FT  -->  1 unit redeemable for 1 sat at maturity
    |       +-- YT FT  -->  proportional share of pool stacking rewards
    |
    +-- redemption-pool.clar   <-- sBTC escrow; only vault-engine may escrow/release
```

### Relayer Bot Responsibilities

1. **Price feeds** — call `set-prices(btc-price, stx-price)` at regular intervals.
2. **Stacking APR** — call `set-stacking-apr(apr)` once per PoX cycle.
3. **Yield deposits** — for each active bond, call `deposit-yield(bond-id, amount)` when stacking rewards arrive.

---

## Security Properties

- **No re-entrancy**: Clarity is decidable and non-Turing-complete; state is committed before any inter-contract calls.
- **Explicit post-conditions**: Every sBTC transfer requires the user's wallet to authorize the exact amount, enforced at the VM level.
- **Stale-data protection**: `get-trusted-*` oracle functions revert if data exceeds the staleness window, preventing protocol actions on outdated prices.
- **Double-spend guards**: `principal-redeemed` and `combined` flags are checked before NFT ownership, ensuring correct errors even after NFT burns.
- **Zero-amount guard**: All sBTC transfers are skipped when `amount = 0` to avoid `ft-transfer?` rejections at the token level.
