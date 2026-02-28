import { describe, it, expect, beforeAll } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

// sBTC constants
const SBTC = 100_000_000n; // 1 sBTC in satoshis

// Bond term constants (blocks)
const TERM_1Y = 6_307_200n; // ~1 year at 5s/block
const TERM_SHORT = 100n;    // short term for maturity tests

// Account variables populated in beforeAll
let deployer: string;
let wallet1: string;
let wallet2: string;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Advance the simnet by n blocks without any transactions. */
function mine(n: bigint) {
  simnet.mineEmptyBlocks(Number(n));
}

/** Create a bond on behalf of `sender`. Returns bond-id as bigint. */
function createBond(
  sender: string,
  amount: bigint = SBTC,
  term: bigint = TERM_1Y
): bigint {
  const { result } = simnet.callPublicFn(
    "bond-factory",
    "create-bond",
    [Cl.uint(amount), Cl.uint(term)],
    sender
  );
  expect(result).toHaveProperty("type", ClarityType.ResponseOk);
  return (result as any).value.value;
}

/** Fund bond yield as deployer (relayer role). */
function depositYield(bondId: bigint, amount: bigint, sender = deployer) {
  return simnet.callPublicFn(
    "bond-factory",
    "deposit-yield",
    [Cl.uint(bondId), Cl.uint(amount)],
    sender
  );
}

// -----------------------------------------------------------------------

describe("bond-factory (v2)", () => {
  beforeAll(() => {
    const accounts = simnet.getAccounts();
    deployer = accounts.get("deployer")!;
    wallet1 = accounts.get("wallet_1")!;
    wallet2 = accounts.get("wallet_2")!;
  });

  // =====================================================================
  // Initial state
  // =====================================================================
  describe("initial state", () => {
    it("bond-count starts at 0", () => {
      const { result } = simnet.callReadOnlyFn(
        "bond-factory", "get-bond-count", [], deployer
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-bond returns err-bond-not-found for non-existent bond", () => {
      const { result } = simnet.callReadOnlyFn(
        "bond-factory", "get-bond", [Cl.uint(0)], deployer
      );
      expect(result).toBeErr(Cl.uint(200));
    });

    it("get-available-yield returns err-bond-not-found", () => {
      const { result } = simnet.callReadOnlyFn(
        "bond-factory", "get-available-yield", [Cl.uint(0)], deployer
      );
      expect(result).toBeErr(Cl.uint(200));
    });
  });

  // =====================================================================
  // create-bond
  // =====================================================================
  describe("create-bond", () => {
    it("rejects amount = 0", () => {
      const { result } = simnet.callPublicFn(
        "bond-factory", "create-bond",
        [Cl.uint(0), Cl.uint(TERM_1Y)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("rejects term = 0", () => {
      const { result } = simnet.callPublicFn(
        "bond-factory", "create-bond",
        [Cl.uint(SBTC), Cl.uint(0)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(206));
    });

    it("rejects term > MAX-TERM-BLOCKS", () => {
      const { result } = simnet.callPublicFn(
        "bond-factory", "create-bond",
        [Cl.uint(SBTC), Cl.uint(12_614_401n)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(206));
    });

    it("creates bond, mints PT+YT to caller, stores data", () => {
      const { result } = simnet.callPublicFn(
        "bond-factory", "create-bond",
        [Cl.uint(SBTC), Cl.uint(TERM_1Y)],
        wallet1
      );
      expect(result).toBeOk(Cl.uint(0));

      // bond-count incremented
      const { result: countResult } = simnet.callReadOnlyFn(
        "bond-factory", "get-bond-count", [], deployer
      );
      expect(countResult).toBeOk(Cl.uint(1));

      // PT and YT owned by wallet1
      const { result: ptOwner } = simnet.callReadOnlyFn(
        "bond-factory", "get-pt-owner", [Cl.uint(0)], deployer
      );
      expect(ptOwner).toEqual(Cl.some(Cl.principal(wallet1)));

      const { result: ytOwner } = simnet.callReadOnlyFn(
        "bond-factory", "get-yt-owner", [Cl.uint(0)], deployer
      );
      expect(ytOwner).toEqual(Cl.some(Cl.principal(wallet1)));

      // Bond data stored correctly
      const { result: bondResult } = simnet.callReadOnlyFn(
        "bond-factory", "get-bond", [Cl.uint(0)], deployer
      );
      expect(bondResult.type).toBe(ClarityType.ResponseOk);
      const pretty = Cl.prettyPrint(bondResult);
      expect(pretty).toContain("sbtc-amount: u100000000");
      expect(pretty).toContain("principal-redeemed: false");
      expect(pretty).toContain("combined: false");
      expect(pretty).toContain("yield-deposited: u0");
      expect(pretty).toContain("yield-withdrawn: u0");
    });

    it("second bond gets id 1", () => {
      simnet.callPublicFn(
        "bond-factory", "create-bond",
        [Cl.uint(SBTC), Cl.uint(TERM_1Y)],
        wallet1
      );
      const { result } = simnet.callPublicFn(
        "bond-factory", "create-bond",
        [Cl.uint(SBTC), Cl.uint(TERM_1Y)],
        wallet2
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("no oracle dependency -- works without any oracle setup", () => {
      // Just creating a bond should succeed with no prior oracle call
      const bondId = createBond(wallet1);
      expect(bondId).toBe(0n);
    });
  });

  // =====================================================================
  // deposit-yield
  // =====================================================================
  describe("deposit-yield", () => {
    it("rejects non-owner caller", () => {
      const bondId = createBond(wallet1);
      const { result } = depositYield(bondId, 1_000_000n, wallet1);
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects unknown bond", () => {
      const { result } = depositYield(999n, 1_000_000n);
      expect(result).toBeErr(Cl.uint(200));
    });

    it("rejects amount = 0", () => {
      const bondId = createBond(wallet1);
      const { result } = depositYield(bondId, 0n);
      expect(result).toBeErr(Cl.uint(205));
    });

    it("rejects deposit after maturity", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT + 1n);
      const { result } = depositYield(bondId, 1_000_000n);
      expect(result).toBeErr(Cl.uint(208));
    });

    it("rejects deposit on combined bond", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      // Combine before maturity (no mine needed)
      simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      const { result } = depositYield(bondId, 1_000_000n);
      expect(result).toBeErr(Cl.uint(207));
    });

    it("happy path: updates yield-deposited and returns new total", () => {
      const bondId = createBond(wallet1);
      const deposit1 = 5_000_000n;
      const deposit2 = 3_000_000n;

      const { result: r1 } = depositYield(bondId, deposit1);
      expect(r1).toBeOk(Cl.uint(deposit1));

      const { result: r2 } = depositYield(bondId, deposit2);
      expect(r2).toBeOk(Cl.uint(deposit1 + deposit2));

      // get-available-yield reflects both deposits
      const { result: avail } = simnet.callReadOnlyFn(
        "bond-factory", "get-available-yield", [Cl.uint(bondId)], deployer
      );
      expect(avail).toBeOk(Cl.uint(deposit1 + deposit2));
    });
  });

  // =====================================================================
  // collect-yield
  // =====================================================================
  describe("collect-yield", () => {
    it("rejects non-YT-owner", () => {
      const bondId = createBond(wallet1);
      depositYield(bondId, 5_000_000n);
      const { result } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeErr(Cl.uint(204));
    });

    it("returns (ok u0) when no yield deposited yet", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("happy path: collects all available yield", () => {
      const bondId = createBond(wallet1);
      const yieldAmount = 5_000_000n;
      depositYield(bondId, yieldAmount);

      const { result } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.uint(yieldAmount));

      // No more yield available
      const { result: avail } = simnet.callReadOnlyFn(
        "bond-factory", "get-available-yield", [Cl.uint(bondId)], deployer
      );
      expect(avail).toBeOk(Cl.uint(0));
    });

    it("YT NFT is NOT burned after collect-yield", () => {
      const bondId = createBond(wallet1);
      depositYield(bondId, 5_000_000n);
      simnet.callPublicFn("bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1);

      // YT still owned by wallet1
      const { result } = simnet.callReadOnlyFn(
        "bond-factory", "get-yt-owner", [Cl.uint(bondId)], deployer
      );
      expect(result).toEqual(Cl.some(Cl.principal(wallet1)));
    });

    it("supports multiple partial collections as more yield is deposited", () => {
      const bondId = createBond(wallet1);

      // First deposit + collect
      depositYield(bondId, 3_000_000n);
      const { result: r1 } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1
      );
      expect(r1).toBeOk(Cl.uint(3_000_000n));

      // Second deposit + collect
      depositYield(bondId, 2_000_000n);
      const { result: r2 } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1
      );
      expect(r2).toBeOk(Cl.uint(2_000_000n));

      // Nothing left
      const { result: r3 } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1
      );
      expect(r3).toBeOk(Cl.uint(0));
    });

    it("new YT owner (after transfer) can collect yield", () => {
      const bondId = createBond(wallet1);
      depositYield(bondId, 5_000_000n);

      // Transfer YT from wallet1 to wallet2
      simnet.callPublicFn(
        "bond-factory", "transfer-yt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      // wallet1 can no longer collect
      const { result: r1 } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1
      );
      expect(r1).toBeErr(Cl.uint(204));

      // wallet2 (new owner) can collect
      const { result: r2 } = simnet.callPublicFn(
        "bond-factory", "collect-yield", [Cl.uint(bondId)], wallet2
      );
      expect(r2).toBeOk(Cl.uint(5_000_000n));
    });
  });

  // =====================================================================
  // redeem-principal
  // =====================================================================
  describe("redeem-principal", () => {
    it("rejects before maturity", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      const { result } = simnet.callPublicFn(
        "bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(201));
    });

    it("rejects if not PT owner", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT);
      const { result } = simnet.callPublicFn(
        "bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeErr(Cl.uint(203));
    });

    it("rejects on combined bond", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      simnet.callPublicFn("bond-factory", "combine", [Cl.uint(bondId)], wallet1);
      mine(TERM_SHORT);
      const { result } = simnet.callPublicFn(
        "bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(207));
    });

    it("succeeds at maturity and returns sbtc-amount", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT);
      const { result } = simnet.callPublicFn(
        "bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC));
    });

    it("marks bond as principal-redeemed after success", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT);
      simnet.callPublicFn("bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "bond-factory", "get-bond", [Cl.uint(bondId)], deployer
      );
      const pretty = Cl.prettyPrint(result);
      expect(pretty).toContain("principal-redeemed: true");
    });

    it("double-redeem fails with err-already-redeemed", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT);
      simnet.callPublicFn("bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(202));
    });

    it("PT owner after transfer can redeem", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);

      // Transfer PT to wallet2 before maturity
      simnet.callPublicFn(
        "bond-factory", "transfer-pt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      mine(TERM_SHORT);

      const { result } = simnet.callPublicFn(
        "bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeOk(Cl.uint(SBTC));
    });
  });

  // =====================================================================
  // combine
  // =====================================================================
  describe("combine", () => {
    it("rejects after maturity", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT);
      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(209));
    });

    it("rejects if not PT owner", () => {
      const bondId = createBond(wallet1);
      // wallet2 does not hold PT
      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeErr(Cl.uint(203));
    });

    it("rejects if not YT owner (YT transferred away)", () => {
      const bondId = createBond(wallet1);
      // Transfer YT to wallet2, keep PT with wallet1
      simnet.callPublicFn(
        "bond-factory", "transfer-yt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(204));
    });

    it("happy path: returns principal only when no yield deposited", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC));
    });

    it("happy path: returns principal + uncollected yield", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      const yieldAmount = 5_000_000n;
      depositYield(bondId, yieldAmount);

      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC + yieldAmount));
    });

    it("returns principal + only uncollected portion when partial collect done", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      depositYield(bondId, 10_000_000n);
      // Collect first batch
      simnet.callPublicFn("bond-factory", "collect-yield", [Cl.uint(bondId)], wallet1);
      // Deposit more (uncollected = 5M)
      depositYield(bondId, 5_000_000n);

      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC + 5_000_000n));
    });

    it("burns PT and YT NFTs", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      simnet.callPublicFn("bond-factory", "combine", [Cl.uint(bondId)], wallet1);

      const { result: ptOwner } = simnet.callReadOnlyFn(
        "bond-factory", "get-pt-owner", [Cl.uint(bondId)], deployer
      );
      const { result: ytOwner } = simnet.callReadOnlyFn(
        "bond-factory", "get-yt-owner", [Cl.uint(bondId)], deployer
      );
      expect(ptOwner).toEqual(Cl.none());
      expect(ytOwner).toEqual(Cl.none());
    });

    it("marks bond as combined", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      simnet.callPublicFn("bond-factory", "combine", [Cl.uint(bondId)], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "bond-factory", "get-bond", [Cl.uint(bondId)], deployer
      );
      const pretty = Cl.prettyPrint(result);
      expect(pretty).toContain("combined: true");
    });

    it("second combine fails with err-already-combined", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      simnet.callPublicFn("bond-factory", "combine", [Cl.uint(bondId)], wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(207));
    });

    it("rejects if principal already redeemed", () => {
      const bondId = createBond(wallet1, SBTC, TERM_SHORT);
      mine(TERM_SHORT);
      simnet.callPublicFn("bond-factory", "redeem-principal", [Cl.uint(bondId)], wallet1);
      // Can't combine after principal redeemed (PT is burned)
      const { result } = simnet.callPublicFn(
        "bond-factory", "combine", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeErr(Cl.uint(202));
    });
  });

  // =====================================================================
  // transfer-pt / transfer-yt
  // =====================================================================
  describe("transfer-pt", () => {
    it("rejects wrong sender", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "transfer-pt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet2 // wallet2 calling but sender arg is wallet1
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("transfers PT to new owner", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "transfer-pt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: owner } = simnet.callReadOnlyFn(
        "bond-factory", "get-pt-owner", [Cl.uint(bondId)], deployer
      );
      expect(owner).toEqual(Cl.some(Cl.principal(wallet2)));
    });
  });

  describe("transfer-yt", () => {
    it("rejects wrong sender", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "transfer-yt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("transfers YT to new owner", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "bond-factory", "transfer-yt",
        [Cl.uint(bondId), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: owner } = simnet.callReadOnlyFn(
        "bond-factory", "get-yt-owner", [Cl.uint(bondId)], deployer
      );
      expect(owner).toEqual(Cl.some(Cl.principal(wallet2)));
    });
  });
});
