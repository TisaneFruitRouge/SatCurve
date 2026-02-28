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

## Two Product Flavors

### 1. bond-factory.clar — Per-bond (NFT-based)

Each user creates an isolated bond. PT and YT are **SIP-009 NFTs** sharing the same `bond-id`. The relayer deposits yield per-bond. Suitable for users who want a specific term and amount.

### 2. vault-engine.clar + redemption-pool.clar — Pool (fungible token-based)

All depositors share a single pool. PT and YT are **fungible tokens** (SIP-010 style, defined via `define-fungible-token`). Yield is distributed via the **Global Yield Index** (MasterChef pattern), so no per-user loops are needed even with many depositors. The relayer calls `sync-yield` once per PoX cycle to distribute rewards to all YT holders proportionally.

---

## Contracts

### `yield-oracle.clar`

Stores on-chain data feeds pushed by authorized relayers (RedStone pull model).

| Feed | Unit | Staleness window |
|---|---|---|
| BTC/USD | 6 decimals ($1 = u1_000_000) | 300 blocks |
| STX/USD | 6 decimals | 300 blocks |
| Stacking APR | Basis points (100 bps = 1%) | 4320 blocks |

Key functions: `set-prices`, `set-stacking-apr`, `get-trusted-btc-price`, `get-trusted-stx-price`, `get-trusted-stacking-apr`, `authorize-relayer`, `revoke-relayer`.

### `bond-factory.clar`

Manages per-bond PT and YT NFTs backed by locked sBTC.

Key functions:
- `create-bond(sbtc-amount, term-blocks)` — locks sBTC, mints PT + YT NFTs
- `deposit-yield(bond-id, amount)` — relayer deposits stacking rewards (owner-only, before maturity)
- `collect-yield(bond-id)` — YT holder claims accumulated rewards; YT is NOT burned
- `redeem-principal(bond-id)` — PT holder burns PT at/after maturity to reclaim sBTC
- `combine(bond-id)` — burns both PT + YT before maturity for an early exit (principal + uncollected yield)
- `transfer-pt(bond-id, sender, recipient)` / `transfer-yt(bond-id, sender, recipient)` — SIP-009 transfers

Bond data map per bond-id: `sbtc-amount`, `maturity-block`, `created-block`, `principal-redeemed`, `combined`, `yield-deposited`, `yield-withdrawn`.

Error codes: u100 unauthorized, u200 not found, u201 not matured, u202 already redeemed, u203 not PT owner, u204 not YT owner, u205 invalid amount, u206 invalid term, u207 already combined, u208 yield deposit after maturity, u209 combine after maturity.

### `redemption-pool.clar`

sBTC escrow layer for the vault-engine pool. Holds all deposited principal sBTC and yield sBTC from the relayer.

- Only the authorized `vault-engine` contract may call `escrow` or `release`.
- Authorization check uses `contract-caller` (not `tx-sender`), which is correct for inter-contract calls.
- `set-vault-engine(ve)` — owner-only, one-time post-deployment configuration.
- `escrow(amount, from)` — transfers sBTC from `from` into this contract (NO `as-contract` wrapper; `tx-sender` = original user so token transfer is authorized).
- `release(amount, recipient)` — transfers sBTC out via `as-contract` (redemption-pool is the sender).

Error codes: u100 unauthorized, u300 already set, u301 invalid amount.

### `vault-engine.clar`

Pool-level yield stripping. Users deposit sBTC and receive fungible PT and YT tokens 1:1.

**State:**
- `maturity-block` — pool expiry (set once via `initialize`)
- `yield-index` — global accumulator, scaled by `PRECISION = u1_000_000_000_000` (1e12)
- `pending-yield` map — settled yield sats per user, ready to claim
- `reward-debt` map — `yt-balance * yield-index / PRECISION` at last checkpoint

**Private: `checkpoint(user)`** — must be called before any change to a user's YT balance. Computes the delta since the last checkpoint and adds it to `pending-yield[user]`, then resets `reward-debt[user]`.

**Public functions:**
- `initialize(mb)` — owner-only, one-time; sets `maturity-block`
- `deposit(amount)` — checkpoint caller → `escrow` sBTC → mint PT + YT → set `reward-debt`
- `sync-yield(amount)` — owner-only; escrow reward sBTC; `yield-index += amount * PRECISION / yt-supply`
- `claim-yield` — checkpoint caller → pay `pending-yield` → clear pending; YT NOT burned
- `redeem-principal(amount)` — assert `>=` maturity; burn PT; release sBTC
- `combine(amount)` — assert `<` maturity; checkpoint; burn PT + YT; release principal + yield
- `transfer-pt(amount, sender, recipient)` — standard ft transfer; no yield side effects
- `transfer-yt(amount, sender, recipient)` — checkpoint BOTH parties; transfer; rebase both `reward-debt`s

**Error codes:** u100 unauthorized, u201 not matured, u202 already matured (for combine/deposit), u205 invalid amount, u210 not initialized, u211 already initialized, u212 no YT supply.

---

## Architecture

```
Bitcoin L1
    |  (sBTC peg — threshold multisig via sBTC protocol)
    v
Stacks L2 (Nakamoto, Epoch 3.0, ~5s blocks)
    |
    +-- yield-oracle.clar        <-- relayer pushes BTC/USD, STX/USD, Stacking APR
    |
    +-- bond-factory.clar        <-- per-bond model: users lock sBTC, get PT+YT NFTs
    |       |
    |       +-- PT NFT  -->  secondary market (fixed-rate buyers)
    |       +-- YT NFT  -->  secondary market (yield seekers)
    |
    +-- vault-engine.clar        <-- pool model: fungible PT+YT, Global Yield Index
    |       |
    |       +-- calls redemption-pool for all sBTC escrow/release
    |       +-- PT FT  -->  1 unit redeemable for 1 sat at maturity
    |       +-- YT FT  -->  proportional share of pool yield
    |
    +-- redemption-pool.clar     <-- sBTC escrow; only vault-engine may call escrow/release
```

### sBTC Flow (vault-engine)

1. **Deposit**: user calls `vault-engine.deposit(amount)` → vault-engine calls `redemption-pool.escrow(amount, user)` → sBTC moves user → redemption-pool in one hop.
2. **Sync yield**: owner calls `vault-engine.sync-yield(amount)` → vault-engine calls `redemption-pool.escrow(amount, owner)` → reward sBTC escrowed.
3. **Claim yield / redeem / combine**: vault-engine calls `redemption-pool.release(amount, recipient)` → sBTC moves redemption-pool → user.

### Global Yield Index Math

```
On sync-yield(reward):
  yield-index += reward * PRECISION / total-yt-supply

Per user (at checkpoint):
  new-accrued = yt-balance * yield-index / PRECISION
  delta       = new-accrued - reward-debt[user]
  pending-yield[user] += delta
  reward-debt[user]   = new-accrued

Claimable = pending-yield[user]  (after checkpoint)
```

`PRECISION = 1e12` ensures sub-satoshi precision in the accumulator before the final division. Integer division truncates (rounds in favor of the protocol).

---

## Relayer Bot Responsibilities

The off-chain relayer (owner-controlled) must:

1. **Price feeds** — call `yield-oracle.set-prices(btc-price, stx-price)` at regular intervals to keep data fresh (staleness window: 300 blocks).
2. **Stacking APR** — call `yield-oracle.set-stacking-apr(apr)` once per PoX cycle (staleness window: 4320 blocks).
3. **Bond yield** — for each active bond-factory bond, call `bond-factory.deposit-yield(bond-id, amount)` when stacking rewards arrive.
4. **Pool yield** — call `vault-engine.sync-yield(amount)` once per PoX cycle to distribute rewards to all pool YT holders.

---

## Deployment Order

Contracts must be deployed in this order (enforced by `deployments/default.simnet-plan.yaml`):

1. `sbtc-registry` (requirement)
2. `sbtc-token` (requirement)
3. `sbtc-deposit` (requirement)
4. `yield-oracle`
5. `bond-factory`
6. `redemption-pool`
7. `vault-engine`

**Post-deployment setup (one-time):**

```clarity
;; Wire redemption-pool to vault-engine
(contract-call? .redemption-pool set-vault-engine .vault-engine)

;; Initialize vault-engine pool with a maturity block
(contract-call? .vault-engine initialize <maturity-block>)
```

---

## Testing

**Stack:** Clarinet 3.14.0, `@stacks/clarinet-sdk@^3.9.0`, `vitest-environment-clarinet@^3.0.0`, vitest `^4.0.7`.

```bash
clarinet check        # validate all contracts (0 errors expected)
pnpm test:contracts   # run all 151 tests
```

| File | Tests | What it covers |
|---|---|---|
| `tests/yield-oracle.test.ts` | 48 | price feeds, staleness, relayer auth |
| `tests/bond-factory.test.ts` | 42 | full bond lifecycle, NFT ownership, yield accounting |
| `tests/redemption-pool.test.ts` | 13 | escrow/release guards, vault-engine authorization |
| `tests/vault-engine.test.ts` | 48 | deposit, yield index math, claim, redeem, combine, transfers |

### Key test patterns

- Simnet state **resets before each `it()` block** — every test must be fully self-contained.
- Use `beforeAll()` (not top-level) to populate `let deployer/wallet1/wallet2` from `simnet.getAccounts()`.
- For vault-engine tests, call `setup()` at the start of every `it()`:
  ```ts
  function setup(maturity = MATURITY_LONG) {
    simnet.callPublicFn("redemption-pool", "set-vault-engine",
      [Cl.principal(`${deployer}.vault-engine`)], deployer);
    simnet.callPublicFn("vault-engine", "initialize",
      [Cl.uint(maturity)], deployer);
  }
  ```
- For redemption-pool isolation, call `set-vault-engine(deployer)` so deployer can call `escrow`/`release` directly.
- Use `simnet.mineEmptyBlocks(n)` for maturity-related tests.

---

## Monorepo Structure

```
SatCurve/
  contracts/                  Clarity smart contracts
    yield-oracle.clar
    bond-factory.clar
    redemption-pool.clar
    vault-engine.clar
  tests/                      Vitest test files (one per contract)
  deployments/
    default.simnet-plan.yaml  Deployment order for clarinet simnet
  settings/
    Devnet.toml               Account mnemonics (wallet_1, wallet_2, ...)
    Simnet.toml               Required by Clarinet 3.x
  packages/
    types/                    Shared TypeScript types (@satcurve/types)
      src/
        pool.ts               PoolState, PoolPosition (vault-engine)
        bond.ts               Bond, BondClaimable (bond-factory)
        contracts.ts          ContractAddresses
  apps/
    web/                      React frontend (Vite + TanStack Router)
      src/
        lib/stacks.ts         Network config
        lib/contracts.ts      Contract address constants
        components/
          PositionCard.tsx    Displays a vault-engine pool position
        routes/
          VaultPage.tsx       Pool position page
```

---

## Clarity Conventions

- `1 uint = 1 satoshi`. `1 sBTC = u100_000_000`.
- All source files must be **pure ASCII** — no Unicode in comments.
- `contract-caller` vs `tx-sender`: use `contract-caller` to identify who called the current contract in an inter-contract call chain; use `tx-sender` for the original transaction signer.
- `ft-transfer?` rejects `amount = 0` — always guard with `(asserts! (> amount u0) ...)` before calling.
- In `if` expressions, both arms must return the same type. When `try!` unwraps a `(response uint _)`, the false arm must also be `uint` (e.g. `u0`), not `bool`.
- `as-contract` flips `tx-sender` and `contract-caller` to the current contract's principal — use it when the contract itself needs to be the sBTC sender on outflows.

---

## Security Properties

- **No re-entrancy**: Clarity is non-Turing-complete; state is committed before any inter-contract call.
- **Explicit post-conditions**: every sBTC transfer requires the user's wallet to authorize the exact amount, enforced at the VM level.
- **Stale-data protection**: `get-trusted-*` oracle functions revert if data exceeds the staleness window.
- **Double-spend guards**: `principal-redeemed` and `combined` flags are checked before NFT ownership in bond-factory, so burns cannot cause misleading error codes.
- **One-time config**: `set-vault-engine` and `initialize` are idempotent-once — both reject if called a second time.
