# SatCurve Frontend — Implementation Plan

See `DESIGN.md` for the full UX/design specification this plan implements.

## Structural Notes

Three facts from the existing codebase that drive sequencing:

1. `src/index.css` is currently a single line (`@import "tailwindcss"`). All theme tokens go here — Tailwind v4 has no `tailwind.config.ts`; tokens live in an `@theme` block in CSS.
2. `WalletConnectButton` carries local `useState` for the address. This must be lifted into a `WalletProvider` context so every page can read wallet state without prop drilling.
3. `PositionCard` already imports `PoolPosition` from `@satcurve/types`. Never redefine those interfaces locally.

---

## Phase 0 — shadcn/ui Setup + Theme CSS Variables

### Step 0.1 — Install shadcn/ui peer dependencies

Run from `apps/web/`:

```
pnpm add class-variance-authority clsx tailwind-merge lucide-react \
  @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-separator
```

Then initialize shadcn (from `apps/web/`):

```
npx shadcn@latest init
```

CLI prompts:
- Style: **New York**
- Base color: **zinc**
- CSS variables: **yes**

Add all required components in one command:

```
npx shadcn@latest add button card badge input dialog tooltip skeleton separator
```

> After the CLI runs, verify `src/index.css` — the CLI may inject conflicting `@layer base` blocks with zinc defaults. Remove any auto-injected shadcn theme block; it will be replaced in Step 0.2.

---

### Step 0.2 — Rewrite `src/index.css` with SatCurve theme

**File:** `apps/web/src/index.css`

Replace entire contents:

```css
@import "tailwindcss";

@layer base {
  :root {
    /* Backgrounds */
    --color-bg:        0 0% 4%;
    --color-surface:   0 0% 7%;
    --color-surface-2: 0 0% 11%;
    --color-border:    0 0% 15%;

    /* Brand */
    --color-brand:       28 100% 54%;
    --color-brand-hover: 28 96% 46%;
    --color-brand-muted: 28 100% 54%;

    /* Text */
    --color-text:       0 0% 98%;
    --color-text-muted: 0 0% 55%;
    --color-text-faint: 0 0% 35%;

    /* Semantic */
    --color-success: 142 71% 45%;
    --color-warning: 38 92% 50%;
    --color-error:   0 72% 51%;

    /* Radius */
    --radius: 0.5rem;
  }
}

@theme {
  --color-bg:          hsl(var(--color-bg));
  --color-surface:     hsl(var(--color-surface));
  --color-surface-2:   hsl(var(--color-surface-2));
  --color-border:      hsl(var(--color-border));
  --color-brand:       hsl(var(--color-brand));
  --color-brand-hover: hsl(var(--color-brand-hover));
  --color-brand-muted: hsl(var(--color-brand-muted) / 0.12);
  --color-text:        hsl(var(--color-text));
  --color-text-muted:  hsl(var(--color-text-muted));
  --color-text-faint:  hsl(var(--color-text-faint));
  --color-success:     hsl(var(--color-success));
  --color-warning:     hsl(var(--color-warning));
  --color-error:       hsl(var(--color-error));
  --radius:            var(--radius);
}

@layer base {
  html,
  body {
    @apply bg-bg text-text;
    font-family: ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}
```

> `@theme` maps custom properties to Tailwind utility classes: `bg-bg`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `bg-brand`, `text-success`, `text-error`, etc. Values must be plain CSS colors (not HSL tuples), hence `hsl(...)` wrappers.

---

### Step 0.3 — Create `src/lib/utils.ts` (shadcn `cn` helper)

**File:** `apps/web/src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

> Verify `tailwind-merge` version is `^3.0.0` or later (required for Tailwind v4).

---

### Step 0.4 — Add path alias to `tsconfig.app.json`

**File:** `apps/web/tsconfig.app.json`

Add inside `compilerOptions`:

```json
"paths": {
  "@/*": ["./src/*"]
}
```

---

## Phase 1 — Wallet Context + WalletProvider

### Step 1.1 — Create `src/providers/WalletProvider.tsx`

**File:** `apps/web/src/providers/WalletProvider.tsx`

Lifts wallet state (address, connect, disconnect) into a React context. Re-hydrates from an existing session on mount. Address is selected based on `VITE_STACKS_NETWORK`: mainnet → `stxAddress.mainnet`, everything else → `stxAddress.testnet`.

Exports:
- `WalletProvider` component
- `useWallet()` hook

```typescript
import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from "react";
import { showConnect, disconnect as stacksDisconnect, getUserData, type UserSession } from "@stacks/connect";

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function pickAddress(profile: Record<string, unknown>): string | null {
  const stxAddress = profile?.stxAddress as Record<string, string> | undefined;
  if (!stxAddress) return null;
  return import.meta.env.VITE_STACKS_NETWORK === "mainnet"
    ? (stxAddress.mainnet ?? null)
    : (stxAddress.testnet ?? null);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    void getUserData().then((data) => {
      if (data) setAddress(pickAddress(data.profile ?? {}));
    });
  }, []);

  const connect = useCallback(() => {
    showConnect({
      appDetails: { name: "SatCurve", icon: "/logo.svg" },
      onFinish: ({ userSession }: { userSession: UserSession }) => {
        const data = userSession.loadUserData();
        setAddress(pickAddress(data.profile ?? {}));
      },
      onCancel: () => {},
    });
  }, []);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider value={{ address, isConnected: address !== null, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}
```

---

### Step 1.2 — Wrap app in `WalletProvider` in `src/main.tsx`

**File:** `apps/web/src/main.tsx`

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import "./index.css";
import { routeTree } from "./routeTree";
import { WalletProvider } from "./providers/WalletProvider";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router; }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  </StrictMode>
);
```

---

### Step 1.3 — Rewrite `src/components/WalletConnectButton.tsx`

Remove all local state. Use `useWallet()`. Apply shadcn `Button`:

```typescript
import { useWallet } from "../providers/WalletProvider";
import { Button } from "./ui/button";

export function WalletConnectButton() {
  const { address, isConnected, connect, disconnect } = useWallet();

  if (isConnected && address) {
    return (
      <Button variant="outline" size="sm" onClick={disconnect}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={connect}
      className="bg-brand text-black font-semibold hover:bg-brand-hover"
    >
      Connect Wallet
    </Button>
  );
}
```

---

### Step 1.4 — Create `src/hooks/useWallet.ts` re-export

```typescript
export { useWallet } from "../providers/WalletProvider";
```

---

### Step 1.5 — Rewrite `src/components/RootLayout.tsx`

Apply design tokens, sticky nav, active link styling via TanStack Router's `active` class:

```typescript
import { Link } from "@tanstack/react-router";
import { WalletConnectButton } from "./WalletConnectButton";
import type { ReactNode } from "react";

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-surface/80 backdrop-blur border-b border-border">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-xl font-bold text-brand tracking-tight">
            SatCurve
          </Link>
          {[
            { to: "/" as const, label: "Dashboard" },
            { to: "/vault" as const, label: "Vault" },
            { to: "/bonds" as const, label: "Bonds" },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-sm text-text-muted hover:text-text transition-colors [&.active]:text-brand [&.active]:border-b [&.active]:border-brand pb-0.5"
            >
              {label}
            </Link>
          ))}
        </div>
        <WalletConnectButton />
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
```

---

## Phase 2 — Utility Functions + Shared Hooks

### Step 2.1 — Create `src/lib/format.ts`

```typescript
/** Format satoshis as sBTC string with 8 decimal places. */
export function formatSats(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const frac = sats % 100_000_000n;
  return `${whole}.${frac.toString().padStart(8, "0")}`;
}

export function formatBlockNumber(block: number): string {
  return block.toLocaleString("en-US");
}

/** Estimate a Date for a given block at ~5s/block. */
export function estimatedBlockDate(targetBlock: number, currentBlock: number): Date {
  return new Date(Date.now() + (targetBlock - currentBlock) * 5_000);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) < 1) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  if (Math.abs(diffDays) < 365) return rtf.format(Math.round(diffDays / 30), "month");
  return rtf.format(Math.round(diffDays / 365), "year");
}

export const TERM_PRESET_BLOCKS: Record<string, number> = {
  "3M": 1_555_200,
  "6M": 3_110_400,
  "1Y": 6_307_200,
  "2Y": 12_614_400,
};
```

---

### Step 2.2 — Create `src/hooks/useBlockHeight.ts`

Polls `{coreApiUrl}/v2/info` every 30 seconds. Returns `number | null`.

```typescript
import { useState, useEffect } from "react";
import { stacksNetwork } from "../lib/stacks";

export function useBlockHeight(): number | null {
  const [blockHeight, setBlockHeight] = useState<number | null>(null);

  useEffect(() => {
    const url = `${stacksNetwork.coreApiUrl}/v2/info`;

    async function load() {
      try {
        const res = await window.fetch(url);
        if (!res.ok) return;
        const data = await res.json() as { stacks_tip_height: number };
        setBlockHeight(data.stacks_tip_height);
      } catch { /* silently ignore */ }
    }

    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  return blockHeight;
}
```

---

### Step 2.3 — Create `src/hooks/useOraclePrices.ts`

Reads `get-btc-price` and `get-stacking-apr` from `yield-oracle` (non-trusted reads — never revert on stale data, unlike `get-trusted-*`). Polls every 60 seconds.

Returns `{ btcPriceUsd: bigint | null, stackingAprBps: bigint | null, loading, error }`.

> Use `callReadOnlyFunction` + `cvToValue` from `@stacks/transactions` v6. Parse contract address by splitting `CONTRACT_ADDRESSES.yieldOracle` on `.`.

---

### Step 2.4 — Create `src/hooks/usePoolState.ts`

Reads `get-maturity-block`, `get-pt-total-supply`, `get-yt-total-supply`, `get-yield-index` from `vault-engine` in parallel. Returns `PoolState | null`.

> `get-maturity-block` returns `(err u210)` if not initialized — handle in the catch block, leave `poolState: null`.

---

### Step 2.5 — Create `src/hooks/useVaultPosition.ts`

Takes `address: string | null`. Reads `get-pt-balance`, `get-yt-balance`, `get-claimable-yield` in parallel (all take a `principal` arg). Returns `{ position: PoolPosition | null, loading, error, refetch }`.

> `refetch` is a `() => void` that bumps an internal `tick` counter to re-trigger the `useEffect`.

---

### Step 2.6 — Create `src/hooks/useBonds.ts`

Takes `address: string | null`. Strategy:
1. Call `get-bond-count` → total bond IDs.
2. For each ID in parallel, call `get-pt-owner` → filter IDs where owner === address.
3. For matching IDs in parallel, call `get-bond` → parse into `Bond[]`.

Returns `{ bonds: Bond[], loading, error, refetch }`.

> `get-pt-owner` returns `(optional principal)` — `cvToValue` returns principal string or `null`.
> `get-bond` returns `(ok { sbtc-amount, maturity-block, created-block, ... })` — `cvToValue` on a `TupleCV` returns a plain object preserving Clarity kebab-case keys.

---

## Phase 3 — Shared UI Components

### Step 3.1 — Create `src/components/BlockTooltip.tsx`

Wraps a block number in a Radix `Tooltip` showing `Block #X,XXX,XXX` + estimated date + relative label (`~14 Mar 2026 · in 3 months`). Uses `estimatedBlockDate`, `formatDate`, `formatRelative` from `lib/format`. Optional `children` override the trigger text.

---

### Step 3.2 — Create `src/components/AmountInput.tsx`

sBTC amount field with MAX button. Props: `value`, `onChange`, `maxBalance?: bigint`, `error?: string`, `disabled?`.

- `type="text"` with `inputMode="decimal"` — filters to `/^[0-9]*\.?[0-9]*$/`.
- `MAX` button calls `onChange(formatSats(maxBalance))`.
- Error shown as `<p className="text-error text-xs">`.

---

### Step 3.3 — Create `src/components/TxButton.tsx`

Wraps shadcn `Button`. Extra props: `pending?: boolean`, `pendingLabel?: string`. When `pending`, shows an inline SVG spinner + label. Button is disabled while `pending`.

---

### Step 3.4 — Create `src/components/StatsCard.tsx`

Protocol stat card. Props: `label`, `value: string | null`, `unit?`, `loading?`. Shows `Skeleton` while loading, `"—"` when value is null. Uses shadcn `Card` + `CardHeader` + `CardContent`. Number in `font-mono text-2xl`.

---

### Step 3.5 — Rewrite `src/components/PositionCard.tsx`

Replace raw Tailwind with shadcn primitives. New props: `position?`, `maturityBlock?`, `currentBlock?`, `loading?`, `onActionSuccess?`.

Three action flows all using `openContractCall` from `@stacks/connect`:
1. **Claim yield** — calls `vault-engine.claim-yield`. Disabled when `claimableYield === 0n`.
2. **Redeem Principal** — calls `vault-engine.redeem-principal(ptBalance)`. Shown only at/after maturity.
3. **Combine** — `destructive` button → opens Dialog with warning → calls `vault-engine.combine(ptBalance)`. Shown only before maturity.

Maturity badge: Active (`text-success`) / Matured (`text-brand`) via `BlockTooltip`.

---

### Step 3.6 — Create `src/components/BondRow.tsx`

Single bond card. Derives status: `active | matured | combined | redeemed` from `bond.combined`, `bond.principalRedeemed`, and `currentBlock >= bond.maturityBlock`.

Status badge colors: active=`success`, matured=`brand`, combined/redeemed=`text-faint`.

Three action flows using `openContractCall` → `bond-factory`:
1. **Collect Yield** — `collect-yield(tokenId)`. Disabled with tooltip if `claimable === 0n`.
2. **Combine** — `destructive` → Dialog → `combine(tokenId)`. Active status only.
3. **Redeem Principal** — `redeem-principal(tokenId)`. Matured status only.

---

### Step 3.7 — Update `src/components/YieldChart.tsx`

Accept optional `data?: YieldDataPoint[]` and `loading?: boolean` props. Fall back to placeholder data with a `"(placeholder)"` label when `data` is undefined. Use `bg-surface` card shell from shadcn.

---

## Phase 4 — Dashboard Page

### Step 4.1 — Rewrite `src/routes/HomePage.tsx`

Uses `useOraclePrices` + `usePoolState`. Renders:
- Hero section (static text)
- 3-column `StatsCard` row: TVL (`poolState.ptTotalSupply`), Pool APY (`stackingAprBps / 100`), Active Bonds (null for now)
- Yield curve: derive `YieldDataPoint[]` from `stackingAprBps` using simple linear scaling: `apy = (aprDecimal * termYears * 100)`

---

## Phase 5 — Vault Page

### Step 5.1 — Rewrite `src/routes/VaultPage.tsx`

Uses `useWallet`, `useVaultPosition`, `usePoolState`, `useBlockHeight`.

**Deposit panel** (Card):
- `AmountInput` + maturity preview + "You receive X PT + X YT" preview
- `TxButton` → `openContractCall` → `vault-engine.deposit(uintCV(sats))`
- Shows "Connect wallet" placeholder when disconnected

**Position panel** (`PositionCard`) — only rendered when connected; passes `refetch` as `onActionSuccess`.

---

## Phase 6 — Bonds Page

### Step 6.1 — Rewrite `src/routes/BondsPage.tsx`

Uses `useWallet`, `useBonds`, `useBlockHeight`.

**Create Bond panel** (Card):
- `AmountInput` + term selector (pill buttons: 3M / 6M / 1Y / 2Y / Custom)
- Custom term: plain number input for block count
- Maturity preview via `BlockTooltip`
- Max term guard: `termBlocks > 12_614_400` → show error, disable button
- `TxButton` → `openContractCall` → `bond-factory.create-bond(uintCV(sats), uintCV(termBlocks))`

**My Bonds list**:
- Loading: two `Skeleton` cards
- Error: error message + retry button
- Empty: empty state card with CTA
- Populated: `bonds.map(bond => <BondRow ... />)`

---

## Phase 7 — Cleanup & Correctness

### Step 7.1 — Add `size="xs"` to shadcn Button

The Claim button in `PositionCard` uses `size="xs"`. Add to the CVA `sizeVariants` in `src/components/ui/button.tsx`:

```typescript
xs: "h-6 rounded px-2 text-xs",
```

### Step 7.2 — Create `apps/web/.env.local`

```
VITE_STACKS_NETWORK=devnet
VITE_VAULT_ENGINE_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.vault-engine
VITE_BOND_FACTORY_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.bond-factory
VITE_YIELD_ORACLE_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-oracle
VITE_REDEMPTION_POOL_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.redemption-pool
```

> `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM` is the standard Clarinet devnet deployer address.

---

## Execution Order

| Phase | Steps     | Prerequisite                              |
|-------|-----------|-------------------------------------------|
| 0     | 0.1 → 0.4 | None — must complete before any component imports shadcn |
| 1     | 1.1 → 1.5 | Phase 0 (Button used in WalletConnectButton) |
| 2     | 2.1 → 2.6 | Phase 1 (hooks used by pages)             |
| 3     | 3.1 → 3.7 | Phases 0–2 (components consume hooks + utils) |
| 4     | 4.1       | Phase 3 (StatsCard, YieldChart)           |
| 5     | 5.1       | Phase 3 (PositionCard, AmountInput, TxButton, BlockTooltip) |
| 6     | 6.1       | Phase 3 (BondRow, AmountInput, TxButton, BlockTooltip) |
| 7     | 7.1 → 7.2 | All phases                                |

## Critical Files

| File | Why critical |
|------|-------------|
| `src/index.css` | Single Tailwind v4 entry; wrong `@theme` breaks every utility class |
| `src/providers/WalletProvider.tsx` | Must exist before any hook/page reads wallet state |
| `src/hooks/useBonds.ts` | Most complex hook; O(n) bond enumeration is the only approach without an indexer |
| `src/components/PositionCard.tsx` | Most complex component; three distinct action flows |
| `packages/types/src/bond.ts` | Reference for `Bond` shape — `cvToValue` parsing must match field names exactly |
