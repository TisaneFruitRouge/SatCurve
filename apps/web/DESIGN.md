# SatCurve — Frontend Design & UX Specification

## Philosophy

SatCurve is a financial protocol for technical Bitcoin users. The UI must reflect that: **precise, minimal, trustworthy**. No decorative noise. Every element on screen either shows the user their position or lets them take an action. Bitcoin orange anchors the identity; everything else defers to it.

> "Don't make me think about the UI — make me think about my yield."

---

## Theme & Color System

All colors are defined as CSS custom properties in `src/index.css`. Changing the theme means changing one block of variables — no hunting through component files.

### CSS Variables (dark theme, default)

```css
@layer base {
  :root {
    /* Backgrounds */
    --color-bg:           0 0% 4%;       /* #0a0a0a — near black, page bg */
    --color-surface:      0 0% 7%;       /* #121212 — card / panel bg */
    --color-surface-2:    0 0% 11%;      /* #1c1c1c — nested surfaces, inputs */
    --color-border:       0 0% 15%;      /* #262626 — subtle dividers */

    /* Brand */
    --color-brand:        28 100% 54%;   /* #f7931a — Bitcoin orange */
    --color-brand-hover:  28 96% 46%;    /* #e8820a — darker on hover */
    --color-brand-muted:  28 100% 54% / 0.12; /* orange ghost bg */

    /* Text */
    --color-text:         0 0% 98%;      /* #fafafa — primary text */
    --color-text-muted:   0 0% 55%;      /* #8c8c8c — secondary labels */
    --color-text-faint:   0 0% 35%;      /* #595959 — disabled / placeholder */

    /* Semantic */
    --color-success:      142 71% 45%;   /* #22c55e — positive delta, accrued yield */
    --color-warning:      38 92% 50%;    /* #f59e0b — approaching maturity */
    --color-error:        0 72% 51%;     /* #ef4444 — error states */

    /* Sizing */
    --radius:             0.5rem;        /* base border-radius */
  }
}
```

### Tailwind aliases (in `tailwind.config.ts` or CSS `@theme`)

```css
@theme {
  --color-bg:        oklch(from hsl(var(--color-bg)) l c h);
  /* ... mapped so you can write: bg-bg, bg-surface, text-muted, border-border */
}
```

Practical palette summary:

| Token        | Value     | Used for                                  |
|--------------|-----------|-------------------------------------------|
| `bg`         | `#0a0a0a` | Page background                           |
| `surface`    | `#121212` | Cards, panels, nav bar                   |
| `surface-2`  | `#1c1c1c` | Inputs, nested rows, code blocks          |
| `border`     | `#262626` | All borders and dividers                  |
| `brand`      | `#f7931a` | Primary buttons, logo, active nav, links  |
| `brand-hover`| `#e8820a` | Button hover state                        |
| `text`       | `#fafafa` | Body text, headings                       |
| `text-muted` | `#8c8c8c` | Labels, secondary info                    |
| `text-faint` | `#595959` | Placeholders, disabled text               |
| `success`    | `#22c55e` | Positive values (yield accrued, matured)  |
| `warning`    | `#f59e0b` | Bond approaching maturity (<10% term left)|
| `error`      | `#ef4444` | Errors, failed transactions               |

### Typography

- **Font:** System stack (`ui-sans-serif, system-ui, sans-serif`) — no custom font load, keeps it fast.
- **Monospace:** `ui-monospace, monospace` — for all numeric amounts (sBTC, balances, block heights).
- **Scale:** Tailwind defaults (`text-sm` = 14px for data, `text-base` = 16px for body, `text-2xl`+ for headings).

---

## Component Library: shadcn/ui + Tailwind

All UI primitives come from **shadcn/ui** (Radix UI + class-variance-authority). Components live in `src/components/ui/`. Custom domain components (PositionCard, BondRow, etc.) live in `src/components/`.

Key shadcn components used:

| Component   | Used for                                           |
|-------------|----------------------------------------------------|
| `Button`    | All CTAs — variants: `default` (brand), `outline`, `ghost`, `destructive` |
| `Card`      | Pool position, bond row, stats panel               |
| `Badge`     | Bond status (Active / Matured / Combined / Redeemed)|
| `Input`     | Amount fields (sBTC input)                         |
| `Dialog`    | Confirm modals for deposit / redeem / combine      |
| `Tooltip`   | Block height → estimated time hover labels         |
| `Separator` | Section dividers inside cards                      |
| `Skeleton`  | Loading states while contract reads are in flight  |

**Button variants:**

```
default   → bg-brand text-black font-semibold          (primary action)
outline   → border-border text-text hover:bg-surface-2  (secondary action)
ghost     → no border, text-muted hover:text-text        (tertiary / nav)
destructive → bg-error text-white                       (combine before maturity — irreversible)
```

---

## Layout

### Nav Bar

```
[ SatCurve logo (brand) ]   [ Dashboard | Vault | Bonds ]   [ Connect Wallet ]
```

- Fixed to top, `bg-surface/80 backdrop-blur`.
- Active route: nav link gets `text-brand` + bottom border `border-brand`.
- Wallet button: `outline` when disconnected → shows truncated address when connected with a small disconnect dropdown.

### Page Container

```css
max-w-5xl mx-auto px-6 py-10
```

All pages share this container. No full-bleed sections.

---

## Pages

### 1. Dashboard (`/`)

**Goal:** Show the yield curve and protocol-level stats at a glance. No wallet required.

**Layout:**

```
┌─ Hero ──────────────────────────────────────────────────────────────┐
│  "The Bitcoin Yield Curve"                                          │
│  Subtitle: fixed-rate / variable-rate yield stripping on sBTC      │
└─────────────────────────────────────────────────────────────────────┘

┌─ Stats Row (3 cards) ───────────────────────────────────────────────┐
│  Total Value Locked    │  Pool APY (oracle)    │  Active Bonds      │
│  0.00 sBTC             │  —.-- %               │  0                 │
└─────────────────────────────────────────────────────────────────────┘

┌─ Yield Curve ───────────────────────────────────────────────────────┐
│  [recharts LineChart: x = maturity (3M / 6M / 1Y / 2Y),            │
│   y = implied APY % derived from oracle stacking APR]              │
└─────────────────────────────────────────────────────────────────────┘
```

**UX notes:**
- Stats cards show `Skeleton` while loading; fallback to `—` on error.
- Chart tooltip shows exact APY + maturity date (derived from block height + ~5s/block).
- No wallet prompt on this page — it's purely informational.

---

### 2. Vault (`/vault`)

**Goal:** Deposit sBTC into the pool, view current position, claim yield, redeem or combine.

**Layout:**

```
┌─ Deposit Panel ─────────────────────────────────────────────────────┐
│  Amount  [_______ sBTC]  [MAX]                                      │
│  Maturity: Block #XXXXXX (~DD Mon YYYY)                             │
│  You receive: X.XXXX PT  +  X.XXXX YT                              │
│  [ Deposit ]                           (primary, brand button)      │
└─────────────────────────────────────────────────────────────────────┘

┌─ My Position ───────────────────────────────────────────────────────┐
│  Principal (PT)      X.XXXXXXXX sBTC                                │
│  Yield tokens (YT)   X.XXXXXXXX YT                                  │
│  Claimable yield     X.XXXXXXXX sBTC        [ Claim Yield ]         │
│  ─────────────────────────────────────────────────────              │
│  Maturity            Block #XXXXXX  (~DD Mon YYYY)        [badge]   │
│  ─────────────────────────────────────────────────────              │
│  [ Redeem Principal ]  (shown only at/after maturity)               │
│  [ Combine ]           (shown only before maturity, destructive)    │
└─────────────────────────────────────────────────────────────────────┘
```

**UX notes:**
- If wallet not connected: Deposit Panel shows a "Connect wallet to deposit" placeholder; My Position is hidden.
- **Deposit**: input validates > 0 and ≤ wallet sBTC balance. Button disabled while amount is invalid or tx is pending.
- **Claim Yield**: button disabled if `claimableYield === 0n`. Shows spinner while pending.
- **Redeem Principal**: only rendered when `blockHeight >= maturityBlock`. Uses `outline` variant.
- **Combine**: rendered only before maturity. Uses `destructive` variant. Opens a Dialog with a warning: "This will burn both your PT and YT tokens in exchange for your principal + accrued yield. This cannot be undone."
- All amounts displayed in sBTC (`satoshis / 1e8`, 8 decimal places, monospace font).
- Block heights show an estimated date tooltip (computed as `now + (targetBlock - currentBlock) * 5s`).

---

### 3. Bonds (`/bonds`)

**Goal:** Create individual NFT-based bonds, view existing bonds, and perform per-bond actions.

**Layout:**

```
┌─ Create Bond ───────────────────────────────────────────────────────┐
│  Amount  [_______ sBTC]  [MAX]                                      │
│  Term    [ 3M ▼ ]  (dropdown: 3M / 6M / 1Y / 2Y / custom blocks)  │
│  Maturity: Block #XXXXXX  (~DD Mon YYYY)                            │
│  [ Create Bond ]                       (primary, brand button)      │
└─────────────────────────────────────────────────────────────────────┘

┌─ My Bonds ──────────────────────────────────────────────────────────┐
│  Bond #001                                      [Active ●]          │
│  0.01000000 sBTC  ·  Matures block #XXXXXX (~3 months)             │
│  Claimable yield: 0.00001234 sBTC                                   │
│  [ Collect Yield ]  [ Combine ▾ ]                                   │
│  ─────────────────────────────────────────────────────────────────  │
│  Bond #002                                      [Matured ✓]         │
│  0.05000000 sBTC  ·  Matured block #XXXXXX                         │
│  [ Redeem Principal ]                                               │
└─────────────────────────────────────────────────────────────────────┘
```

**UX notes:**
- Each bond is a `Card` row, not a table (more scannable on mobile).
- **Status badge** colors: Active = `success` border, Matured = `brand`, Combined = `text-faint`, Redeemed = `text-faint`.
- **Collect Yield**: disabled if `claimableYield === 0`. Tooltip: "No yield available yet. Yield is deposited each PoX cycle by the relayer."
- **Combine**: `destructive`, opens same confirmation Dialog as Vault page.
- **Redeem Principal**: `outline`, only shown when matured and not yet redeemed.
- **Create Bond term presets** (convert to blocks at ~5s/block):
  - 3M  → 1,555,200 blocks
  - 6M  → 3,110,400 blocks
  - 1Y  → 6,307,200 blocks
  - 2Y  → 12,614,400 blocks (MAX)
  - Custom → free text input in blocks
- If no bonds: empty state card — "No bonds yet. Create your first bond above."

---

## Interaction Patterns

### Amount Input

```
[ 0.00000000 ]  sBTC  [MAX]
```

- Always shows 8 decimal places.
- `MAX` button fills the field with the user's sBTC wallet balance.
- Validation: must be > 0, must not exceed balance. Error shown inline below the input (`text-error text-xs`).
- Input is `type="text"` with numeric filtering — avoids browser quirks with `type="number"`.

### Transaction Lifecycle

Every write action follows the same pattern:

```
1. Button click → Dialog confirmation (for destructive) OR direct
2. Button shows spinner + "Confirming…" text, disabled
3. On success → toast notification (top-right): "Transaction submitted. Waiting for confirmation."
4. On error → toast: red, shows error message
5. After confirmation → data refetches automatically
```

No full-page loading states. Interactions are scoped to the card/button that triggered them.

### Block Height → Human Time

Everywhere a block height appears, hovering shows a `Tooltip` with the estimated date:

```
Block #3,200,000
"~14 Mar 2026 · in 3 months"
```

Computed as: `estimated = new Date(Date.now() + (targetBlock - currentBlock) * 5_000)`.

---

## Responsive Behavior

- **Desktop (≥1024px):** Side-by-side panels where applicable.
- **Tablet (≥768px):** Stacked, full-width cards. Stats row wraps to 2 columns.
- **Mobile (<768px):** Single column. Nav collapses to logo + wallet button; page links move to a simple top strip below nav.

No complex mobile menu needed — three links fit inline at any reasonable screen size.

---

## Loading & Error States

| State         | Treatment                                                  |
|---------------|------------------------------------------------------------|
| Loading       | `Skeleton` component, same dimensions as loaded content    |
| No wallet     | Soft prompt inside the relevant card, no modal interruption|
| RPC error     | Inline `text-error` message with a retry button            |
| Empty list    | Illustrated empty state card with a clear CTA              |
| Tx pending    | Button spinner + disabled, no full-page overlay            |

---

## File Structure

```
apps/web/src/
  index.css                  ← CSS variables + Tailwind imports
  components/
    ui/                      ← shadcn/ui primitives (auto-generated, do not edit)
      button.tsx
      card.tsx
      badge.tsx
      input.tsx
      dialog.tsx
      tooltip.tsx
      skeleton.tsx
      separator.tsx
    RootLayout.tsx            ← nav bar + page wrapper
    WalletConnectButton.tsx   ← connect / disconnect + address display
    PositionCard.tsx          ← vault-engine position display
    BondRow.tsx               ← single bond in the Bonds list
    StatsCard.tsx             ← protocol stat (TVL, APY, etc.)
    YieldChart.tsx            ← recharts yield curve
    AmountInput.tsx           ← sBTC amount field with MAX button
    BlockTooltip.tsx          ← block height + estimated date tooltip
    TxButton.tsx              ← button with built-in pending/spinner state
  providers/
    WalletProvider.tsx        ← React context: address, session, isConnected
  hooks/
    useWallet.ts              ← consume WalletProvider
    useVaultPosition.ts       ← read vault-engine: PT/YT/claimable
    usePoolState.ts           ← read vault-engine: maturity, index, supply
    useBonds.ts               ← read bond-factory: all user bonds
    useOraclePrices.ts        ← read yield-oracle: BTC price, APR
    useBlockHeight.ts         ← poll current Stacks block height
  lib/
    stacks.ts                 ← network config
    contracts.ts              ← contract address constants
    format.ts                 ← formatSats(n), formatBlock(n, currentBlock)
  routes/
    HomePage.tsx
    VaultPage.tsx
    BondsPage.tsx
```
