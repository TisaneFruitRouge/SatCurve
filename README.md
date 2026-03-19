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

Both PT and YT are transferable NFTs via `transfer-pt` and `transfer-yt`. The `market.clar` contract provides a fixed-price P2P orderbook where holders can list and buy NFTs for sBTC:

- **PT market**: PT trades at a discount to face value, implying a fixed yield to maturity.
- **YT market**: YT is priced on expected future stacking rewards, a floating-rate instrument.

---

## Contracts

| Contract | Description |
|---|---|
| `yield-oracle.clar` | Authorized relayer oracle for BTC/USD, STX/USD, and Stacking APR |
| `bond-factory.clar` | PT + YT NFT lifecycle: create, deposit-yield, collect-yield, redeem, combine |
| `market.clar` | Fixed-price P2P orderbook for PT and YT NFTs |
| `sbtc-token.clar` | sBTC mock for devnet/simnet (not deployed to mainnet) |

---

## yield-oracle.clar

Stores three data feeds pushed on-chain by authorized relayers (RedStone pull model). Consuming contracts call the `get-trusted-*` functions, which revert if the data is stale.

| Feed | Unit | Staleness window |
|---|---|---|
| BTC/USD | 6 decimals ($1 = u1_000_000) | 300 blocks (~25 min) |
| STX/USD | 6 decimals | 300 blocks (~25 min) |
| Stacking APR | Basis points (1 bps = 0.01%) | 4320 blocks (~6 hours) |

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

## market.clar

Fixed-price P2P orderbook for bond-factory PT and YT NFTs. NFTs are escrowed by the market contract on listing and released on purchase or cancellation.

### Error Codes

| Code | Meaning |
|---|---|
| u400 | Listing not found |
| u401 | Already listed |
| u402 | Price is zero |
| u403 | Caller is not the seller |

### Key Functions

- `list-pt(bond-id, price-sats)` / `list-yt(bond-id, price-sats)` — escrow NFT, create listing
- `cancel-pt(bond-id)` / `cancel-yt(bond-id)` — seller reclaims escrowed NFT
- `buy-pt(bond-id)` / `buy-yt(bond-id)` — buyer sends sBTC, receives NFT
- `get-pt-listing(bond-id)` / `get-yt-listing(bond-id)` — read-only listing lookup

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
    |       +-- PT NFT  -->  market.clar (fixed-price P2P orderbook)
    |       +-- YT NFT  -->  market.clar (fixed-price P2P orderbook)
    |
    +-- market.clar            <-- list, cancel, buy PT/YT NFTs for sBTC
```

### Relayer Bot

An off-chain Node.js service (`apps/bot`) runs two loops:

1. **Price loop** (every 5 min) — fetches BTC/USD + STX/USD from RedStone and calls `yield-oracle.set-prices`.
2. **Yield loop** (per PoX cycle) — distributes sBTC stacking rewards proportionally across all active bonds via `bond-factory.deposit-yield`.

---

## Development

**Requirements:** [Clarinet](https://github.com/hirosystems/clarinet) 3.x, Node.js 20+, pnpm.

```bash
# Install dependencies
pnpm install

# Check all contracts for syntax and type errors
clarinet check

# Run all contract tests (vitest + clarinet-sdk)
pnpm test:contracts

# Start local devnet (Clarinet)
make devnet

# Fund devnet wallets with test sBTC
make init

# Start the web frontend (localhost:5173)
make web

# Start the relayer bot (devnet mode)
make bot
```

**Test coverage:** 104 tests across 3 contracts.

| File | Tests | What it covers |
|---|---|---|
| `tests/yield-oracle.test.ts` | 48 | Price feeds, staleness windows, relayer auth |
| `tests/bond-factory.test.ts` | 42 | Full bond lifecycle, NFT ownership, yield accounting |
| `tests/market.test.ts` | 14 | List, cancel, buy/sell for PT and YT |

---

## Web App

The frontend (`apps/web`) is a React + Vite app using TanStack Router and Tailwind CSS.

**Routes:**
- `/` — Landing page with yield curve chart and market preview
- `/bonds` — Create bonds, view your PT/YT holdings, collect yield, redeem, combine
- `/bonds/:bondId` — Individual bond detail and actions
- `/market` — Browse and trade PT/YT listings

**Required environment variables** (copy `.env.example` to `.env`):

```
VITE_STACKS_NETWORK=devnet
VITE_API_URL=http://localhost:3999
VITE_BOND_FACTORY_ADDRESS=<deployer>.bond-factory
VITE_YIELD_ORACLE_ADDRESS=<deployer>.yield-oracle
VITE_MARKET_ADDRESS=<deployer>.market
VITE_SBTC_TOKEN_ADDRESS=<deployer>.sbtc-token
```

---

## Relayer Bot

The bot (`apps/bot`) is a Node.js service that keeps on-chain data fresh and distributes yield.

**Required environment variables** (copy `apps/bot/.env.example` to `apps/bot/.env`):

```
STACKS_NETWORK=devnet
STACKS_API_URL=http://localhost:3999
BOND_FACTORY_ADDRESS=<deployer>.bond-factory
YIELD_ORACLE_ADDRESS=<deployer>.yield-oracle
BOT_MNEMONIC=<24-word seed phrase>   # or BOT_PRIVATE_KEY=<hex>
REDSTONE_DATA_SERVICE_ID=redstone-primary-prod
REDSTONE_UNIQUE_SIGNERS=3
```

```bash
# Development (hot reload)
pnpm --filter @satcurve/bot dev

# One-shot yield distribution
pnpm --filter @satcurve/bot dev -- --distribute 1000000

# Production build
pnpm --filter @satcurve/bot build
```

---

## Deployment (Testnet)

Deployment to Stacks Testnet, Vercel, and Railway is automated via GitHub Actions on every push to `master`.

- **Contracts** — only redeployed if `contracts/` or `Clarinet.toml` changed since the last deployment.
- **Web** — always deployed to Vercel.
- **Bot** — always deployed to Railway.

Required GitHub Secrets: `TESTNET_DEPLOYER_MNEMONIC`, `TESTNET_DEPLOYER_ADDRESS`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RAILWAY_TOKEN`.

---

## Security Properties

- **No re-entrancy**: Clarity is decidable and non-Turing-complete; state is committed before any inter-contract calls.
- **Explicit post-conditions**: Every sBTC transfer requires the user's wallet to authorize the exact amount, enforced at the VM level.
- **Stale-data protection**: `get-trusted-*` oracle functions revert if data exceeds the staleness window, preventing protocol actions on outdated prices.
- **Double-spend guards**: `principal-redeemed` and `combined` flags are checked before NFT ownership, ensuring correct errors even after NFT burns.
- **Zero-amount guard**: All sBTC transfers are skipped when `amount = 0` to avoid `ft-transfer?` rejections at the token level.
