# SatCurve — Agent Reference

This document is intended for AI coding agents working on the SatCurve codebase. It describes the project's goals, architecture, contracts, and conventions in enough detail to work autonomously.

---

## Project Goal

SatCurve is a **Pendle-style yield-stripping protocol** for sBTC on the Stacks L2 (Nakamoto / Epoch 3.0).

It lets users decompose locked Bitcoin into two independently tradeable claims:

- **PT — Principal Token**: redeemable for the original sBTC principal at a fixed maturity block.
- **YT — Yield Token**: collects variable sBTC stacking rewards accumulated over the lock period.

The core invariant is **1 sBTC locked = 1 PT + 1 YT**.

There is **no borrowing**, **no collateral ratio**, and **no liquidation**. It is a pure yield-stripping / tokenization protocol.

---

## Contracts

### `yield-oracle.clar`

Stores on-chain data feeds pushed by authorized relayers (RedStone pull model).

| Feed | Unit | Staleness window |
|---|---|---|
| BTC/USD | 6 decimals ($1 = u1_000_000) | 300 blocks |
| STX/USD | 6 decimals | 300 blocks |
| Stacking APR | Basis points (100 bps = 1%) | 4320 blocks |

**Error codes:** u100 unauthorized, u101 stale data, u102 invalid price (zero).

**Public functions:**
- `set-prices(btc-price, stx-price)` — atomic dual-feed update
- `set-stacking-apr(apr)` — update stacking APR once per PoX cycle
- `authorize-relayer(principal)` / `revoke-relayer(principal)` — owner-only

**Read-only:**
- `get-trusted-btc-price` / `get-trusted-stx-price` / `get-trusted-stacking-apr` — revert on stale data
- `get-btc-price` / `get-stx-price` / `get-stacking-apr` — unchecked getters
- `is-btc-price-fresh` / `is-stx-price-fresh` / `is-stacking-apr-fresh` — freshness booleans

---

### `bond-factory.clar`

Manages per-bond PT and YT NFTs backed by locked sBTC.

**Tokens:** `principal-token` (SIP-009) and `yield-token` (SIP-009), both keyed by `bond-id`.

**Bond data map (per bond-id):**
```
sbtc-amount        sBTC locked (satoshis)
maturity-block     PT redeemable at/after this block
created-block      Block when bond was created
principal-redeemed true after redeem-principal succeeds
combined           true after combine (early exit)
yield-deposited    Cumulative sBTC deposited by relayer
yield-withdrawn    Cumulative sBTC paid out to YT holders
```

**Constants:** `MAX-TERM-BLOCKS = u12614400` (2-year maximum, ~5 s/block on Nakamoto).

**Error codes:**

| Code | Meaning |
|---|---|
| u100 | Unauthorized |
| u200 | Bond not found |
| u201 | Not yet matured |
| u202 | Principal already redeemed |
| u203 | Not PT owner |
| u204 | Not YT owner |
| u205 | Invalid amount (zero) |
| u206 | Invalid term (zero or exceeds 2-year max) |
| u207 | Bond already combined |
| u208 | Cannot deposit yield after maturity |
| u209 | Cannot combine at or after maturity |

**Public functions:**
- `create-bond(sbtc-amount, term-blocks)` — locks sBTC, mints PT + YT NFTs to caller
- `deposit-yield(bond-id, amount)` — contract-owner only; before maturity only; deposits stacking rewards
- `collect-yield(bond-id)` — YT holder claims accumulated rewards; YT is NOT burned; returns `(ok u0)` if nothing available
- `redeem-principal(bond-id)` — PT holder, at/after maturity; burns PT, returns principal sBTC
- `combine(bond-id)` — both PT and YT held by caller; before maturity only; burns both, returns principal + uncollected yield
- `transfer-pt(bond-id, sender, recipient)` / `transfer-yt(bond-id, sender, recipient)` — SIP-009 transfers

**Read-only:** `get-bond`, `get-pt-owner`, `get-yt-owner`, `get-available-yield`, `get-bond-count`.

**Critical ordering:** Check `combined` and `principal-redeemed` BEFORE NFT ownership. After an NFT is burned, `get-owner` returns `none`, which would produce a misleading u203/u204 error if checked first.

**sBTC outflows from contract:** Use `(let ((recipient tx-sender)) (as-contract (contract-call? .sbtc-token transfer amt tx-sender recipient none)))` — `as-contract` flips `tx-sender` to the contract principal.

---

### `market.clar`

Fixed-price P2P orderbook for bond-factory PT and YT NFTs. No vault FT support.

**State:** `pt-listings` and `yt-listings` maps, keyed by bond-id. Each entry: `{seller: principal, price-sats: uint}`.

**Error codes:** u400 listing-not-found, u401 already-listed, u402 price-zero, u403 not-seller.

**Public functions:**
- `list-pt(bond-id, price-sats)` / `list-yt(bond-id, price-sats)` — escrows NFT into contract, creates listing
- `cancel-pt(bond-id)` / `cancel-yt(bond-id)` — seller-only; returns NFT from escrow
- `buy-pt(bond-id)` / `buy-yt(bond-id)` — buyer sends sBTC to seller, receives NFT from escrow

**NFT escrow pattern:**
- To list: `transfer-pt(bond-id, tx-sender, as-contract tx-sender)` (contract becomes owner)
- To release: `(as-contract (transfer-pt bond-id tx-sender buyer))` (contract sends as itself)

**Read-only:** `get-pt-listing(bond-id)`, `get-yt-listing(bond-id)`.

---

### `sbtc-token.clar`

sBTC mock for devnet/simnet only. Implements SIP-010 + protocol extension functions. Anyone can call `mint` in devnet — this is intentional for testing.

**Not deployed to testnet or mainnet.** The real sBTC token on testnet is `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.

---

## Architecture

```
Bitcoin L1
    |  (sBTC peg — threshold multisig via sBTC protocol)
    v
Stacks L2 (Nakamoto, Epoch 3.0, ~5s blocks)
    |
    +-- yield-oracle.clar      <-- relayer pushes BTC/USD, STX/USD, Stacking APR
    |
    +-- bond-factory.clar      <-- users lock sBTC, receive PT + YT NFTs
    |       |
    |       +-- PT NFT  -->  market.clar
    |       +-- YT NFT  -->  market.clar
    |
    +-- market.clar            <-- fixed-price P2P orderbook for PT/YT NFTs
```

---

## Relayer Bot Responsibilities

The off-chain relayer (`apps/bot`) must:

1. **Price feeds** — call `yield-oracle.set-prices(btc-price, stx-price)` every ~5 minutes to keep data fresh (staleness window: 300 blocks).
2. **Stacking APR** — call `yield-oracle.set-stacking-apr(apr)` once per PoX cycle (staleness window: 4320 blocks).
3. **Bond yield** — for each active bond-factory bond, call `bond-factory.deposit-yield(bond-id, amount)` when stacking rewards arrive. Active = not combined, not redeemed, before maturity.

The bot derives its private key from `BOT_MNEMONIC` (BIP39, derivation path `m/44'/5757'/0'/0/0`) or from a raw `BOT_PRIVATE_KEY` hex string.

---

## Deployment Order

Contracts must be deployed in this order (enforced by `deployments/`):

1. `sbtc-token` (devnet only; on testnet/mainnet the real sBTC token is a requirement)
2. `yield-oracle`
3. `bond-factory`
4. `market`

No post-deployment configuration is required — `bond-factory` and `market` are ready to use immediately. The relayer must be authorized in `yield-oracle` via `authorize-relayer` before it can push prices.

---

## Testing

**Stack:** Clarinet 3.14.0, `@stacks/clarinet-sdk@^3.9.0`, `vitest-environment-clarinet@^3.0.0`, vitest `^4.0.7`.

```bash
clarinet check        # validate all contracts (0 errors expected)
pnpm test:contracts   # run all 104 tests
```

| File | Tests | What it covers |
|---|---|---|
| `tests/yield-oracle.test.ts` | 48 | Price feeds, staleness, relayer auth |
| `tests/bond-factory.test.ts` | 42 | Full bond lifecycle, NFT ownership, yield accounting |
| `tests/market.test.ts` | 14 | List, cancel, buy for PT and YT |

### Key test patterns

- Simnet state **resets before each `it()` block** — every test must be fully self-contained.
- Use `beforeAll()` (not top-level) to populate `let deployer/wallet1/wallet2` from `simnet.getAccounts()`.
- Accounts are read from `settings/Devnet.toml` — names must be `wallet_1`, `wallet_2` (underscore).
- Use `simnet.mineEmptyBlocks(n)` for maturity-related tests; do not rely on `simnet.blockHeight` in assertions (not reset between tests).
- `callPublicFn` / `callReadOnlyFn` return `{ result, events }` — destructure `result`.
- Custom matchers: `toBeOk(Cl.uint(n))`, `toBeErr(Cl.uint(n))`, `toEqual(Cl.bool(b))`.
- For complex tuple assertions, use `Cl.prettyPrint(result).toContain("key: val")` instead of `toBeOk(Cl.tuple({...}))`.

---

## Monorepo Structure

```
SatCurve/
  contracts/
    sbtc-token.clar           sBTC mock (devnet/simnet only)
    yield-oracle.clar
    bond-factory.clar
    market.clar
  tests/
    yield-oracle.test.ts
    bond-factory.test.ts
    market.test.ts
  deployments/
    default.simnet-plan.yaml
    default.devnet-plan.yaml
    default.testnet-plan.yaml
  settings/
    Devnet.toml               Account mnemonics (wallet_1, wallet_2, ...)
    Simnet.toml               Required by Clarinet 3.x
    Testnet.toml
    Mainnet.toml
  packages/
    types/                    @satcurve/types
      src/
        bond.ts               Bond, BondClaimable
        contracts.ts          ContractAddresses
  apps/
    web/                      @satcurve/web (React + Vite + TanStack Router)
      src/
        lib/stacks.ts         Network config
        lib/contracts.ts      Contract address constants (from env vars)
        lib/bondValuation.ts  Bond pricing calculations
        hooks/                useBonds, useSbtcBalance, useOraclePrices, useMarketListings, ...
        components/           BondRow, AmountInput, StatsCard, YieldChart, TxButton, ...
        routes/
          HomePage.tsx
          BondsPage.tsx
          BondDetailPage.tsx
          MarketPage.tsx
    bot/                      @satcurve/bot (Node.js relayer)
      src/
        index.ts              Entry point + CLI args
        config.ts             Config loader (env vars + mnemonic derivation)
        logger.ts             Winston logger
        stacks.ts             Low-level Stacks tx helpers
        prices.ts             RedStone price feed integration
        relayer.ts            Relayer class (price loop + yield distribution)
      scripts/
        init-devnet.ts        Fund devnet wallets with test sBTC
  .github/
    workflows/
      deploy-testnet.yml      CI/CD: contracts + web + bot
  Clarinet.toml
  Makefile
  pnpm-workspace.yaml
```

---

## Clarity Conventions

- `1 uint = 1 satoshi`. `1 sBTC = u100_000_000`.
- All source files must be **pure ASCII** — no Unicode characters in comments (em-dash, arrows, etc. cause parse errors).
- `contract-caller` vs `tx-sender`: use `contract-caller` to identify who called the current contract in an inter-contract call; use `tx-sender` for the original transaction signer.
- `ft-transfer?` rejects `amount = 0` — always guard with `(asserts! (> amount u0) ...)` or `(if (> amount u0) (try! ...) u0)`.
- In `if` expressions, both arms must return the same type. When `try!` unwraps a `(response uint _)`, the false arm must also be `uint` (e.g. `u0`), not `bool`.
- `as-contract` flips `tx-sender` and `contract-caller` to the current contract's principal — required for contract-initiated sBTC outflows.

---

## Security Properties

- **No re-entrancy**: Clarity is non-Turing-complete; state is committed before any inter-contract call.
- **Explicit post-conditions**: Every sBTC transfer requires the user's wallet to authorize the exact amount, enforced at the VM level.
- **Stale-data protection**: `get-trusted-*` oracle functions revert if data exceeds the staleness window.
- **Double-spend guards**: `principal-redeemed` and `combined` flags are checked before NFT ownership in bond-factory — burns cannot cause misleading error codes.
- **Zero-amount guard**: All sBTC transfers skip when `amount = 0` to avoid `ft-transfer?` rejections.
