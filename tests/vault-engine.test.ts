import { describe, it, expect, beforeAll } from "vitest";
import { Cl } from "@stacks/transactions";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const SBTC      = 100_000_000n; // 1 sBTC in satoshis
const PRECISION = 1_000_000_000_000n; // 1e12 — matches contract PRECISION

// Maturity blocks for different test scenarios
const MATURITY_LONG  = 100_000n; // far future, never reached during tests
const MATURITY_SHORT = 10n;      // mine past this for post-maturity tests

let deployer: string;
let wallet1:  string;
let wallet2:  string;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Advance simnet by n blocks. */
function mine(n: bigint) {
  simnet.mineEmptyBlocks(Number(n));
}

/**
 * Wire up the two contracts and initialize the vault with the given maturity.
 * Must be called at the start of every test that uses vault-engine.
 */
function setup(maturity: bigint = MATURITY_LONG) {
  simnet.callPublicFn(
    "redemption-pool", "set-vault-engine",
    [Cl.principal(`${deployer}.vault-engine`)],
    deployer
  );
  simnet.callPublicFn(
    "vault-engine", "initialize",
    [Cl.uint(maturity)],
    deployer
  );
}

/** Deposit `amount` sBTC from `sender`. Returns PT balance after deposit. */
function deposit(sender: string, amount: bigint = SBTC) {
  return simnet.callPublicFn(
    "vault-engine", "deposit", [Cl.uint(amount)], sender
  );
}

/** Owner syncs `amount` sats of stacking rewards into the pool. */
function syncYield(amount: bigint) {
  return simnet.callPublicFn(
    "vault-engine", "sync-yield", [Cl.uint(amount)], deployer
  );
}

/** Compute expected yield-index increment for a given reward and YT supply. */
function expectedIndexDelta(reward: bigint, supply: bigint): bigint {
  return (reward * PRECISION) / supply;
}

/** Compute expected claimable for a holder given their balance and the index. */
function expectedClaimable(ytBalance: bigint, index: bigint): bigint {
  return (ytBalance * index) / PRECISION;
}

// -----------------------------------------------------------------------

describe("vault-engine", () => {
  beforeAll(() => {
    const accounts = simnet.getAccounts();
    deployer = accounts.get("deployer")!;
    wallet1  = accounts.get("wallet_1")!;
    wallet2  = accounts.get("wallet_2")!;
  });

  // =====================================================================
  // initialize
  // =====================================================================
  describe("initialize", () => {
    it("rejects non-owner caller", () => {
      // Set up redemption-pool so contracts are wired, but DON'T call initialize yet
      simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(`${deployer}.vault-engine`)], deployer
      );
      const { result } = simnet.callPublicFn(
        "vault-engine", "initialize", [Cl.uint(MATURITY_LONG)], wallet1
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects mb = 0", () => {
      simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(`${deployer}.vault-engine`)], deployer
      );
      const { result } = simnet.callPublicFn(
        "vault-engine", "initialize", [Cl.uint(0)], deployer
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("happy path: sets maturity and marks initialized", () => {
      setup(MATURITY_LONG);
      const { result } = simnet.callReadOnlyFn(
        "vault-engine", "get-maturity-block", [], deployer
      );
      expect(result).toBeOk(Cl.uint(MATURITY_LONG));
    });

    it("rejects double-initialize", () => {
      setup();
      const { result } = simnet.callPublicFn(
        "vault-engine", "initialize", [Cl.uint(MATURITY_LONG)], deployer
      );
      expect(result).toBeErr(Cl.uint(211));
    });

    it("get-maturity-block fails before init", () => {
      // No setup() called
      const { result } = simnet.callReadOnlyFn(
        "vault-engine", "get-maturity-block", [], deployer
      );
      expect(result).toBeErr(Cl.uint(210));
    });
  });

  // =====================================================================
  // deposit
  // =====================================================================
  describe("deposit", () => {
    it("rejects before initialize", () => {
      simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(`${deployer}.vault-engine`)], deployer
      );
      const { result } = simnet.callPublicFn(
        "vault-engine", "deposit", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeErr(Cl.uint(210));
    });

    it("rejects amount = 0", () => {
      setup();
      const { result } = deposit(wallet1, 0n);
      expect(result).toBeErr(Cl.uint(205));
    });

    it("rejects deposit after maturity", () => {
      setup(MATURITY_SHORT);
      mine(MATURITY_SHORT);
      const { result } = deposit(wallet1);
      expect(result).toBeErr(Cl.uint(202));
    });

    it("mints PT and YT 1:1 with deposit amount", () => {
      setup();
      deposit(wallet1, SBTC);

      const { result: pt } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-balance", [Cl.principal(wallet1)], deployer
      );
      const { result: yt } = simnet.callReadOnlyFn(
        "vault-engine", "get-yt-balance", [Cl.principal(wallet1)], deployer
      );
      expect(pt).toBeOk(Cl.uint(SBTC));
      expect(yt).toBeOk(Cl.uint(SBTC));
    });

    it("total supplies equal sum of deposits", () => {
      setup();
      deposit(wallet1, SBTC);
      deposit(wallet2, SBTC * 2n);

      const { result: ptSupply } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-total-supply", [], deployer
      );
      expect(ptSupply).toBeOk(Cl.uint(SBTC * 3n));
    });

    it("returns total PT balance of caller after deposit", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = deposit(wallet1, SBTC);
      expect(result).toBeOk(Cl.uint(SBTC * 2n));
    });

    it("new depositor after sync-yield gets no retroactive yield", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);
      deposit(wallet2, SBTC); // joins AFTER yield distributed

      const { result } = simnet.callReadOnlyFn(
        "vault-engine", "get-claimable-yield", [Cl.principal(wallet2)], deployer
      );
      expect(result).toBeOk(Cl.uint(0));
    });
  });

  // =====================================================================
  // sync-yield
  // =====================================================================
  describe("sync-yield", () => {
    it("rejects non-owner caller", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "sync-yield", [Cl.uint(5_000_000n)], wallet1
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects when no YT supply (no depositors)", () => {
      setup();
      const { result } = syncYield(5_000_000n);
      expect(result).toBeErr(Cl.uint(212));
    });

    it("rejects amount = 0", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = syncYield(0n);
      expect(result).toBeErr(Cl.uint(205));
    });

    it("happy path: updates yield-index correctly", () => {
      setup();
      deposit(wallet1, SBTC); // supply = 1e8
      const reward = 5_000_000n;
      const { result } = syncYield(reward);

      const expectedIndex = expectedIndexDelta(reward, SBTC);
      expect(result).toBeOk(Cl.uint(expectedIndex));

      const { result: indexResult } = simnet.callReadOnlyFn(
        "vault-engine", "get-yield-index", [], deployer
      );
      expect(indexResult).toBeOk(Cl.uint(expectedIndex));
    });

    it("accumulates index across multiple syncs", () => {
      setup();
      deposit(wallet1, SBTC);
      const reward = 5_000_000n;
      syncYield(reward);
      const { result } = syncYield(reward);

      const expectedIndex = expectedIndexDelta(reward, SBTC) * 2n;
      expect(result).toBeOk(Cl.uint(expectedIndex));
    });
  });

  // =====================================================================
  // claim-yield
  // =====================================================================
  describe("claim-yield", () => {
    it("returns (ok u0) when no yield has been synced", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("returns (ok u0) for non-depositor", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);
      const { result } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("happy path: pays correct yield after one sync", () => {
      setup();
      deposit(wallet1, SBTC);
      const reward = 5_000_000n;
      syncYield(reward);

      const { result } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      const expected = expectedClaimable(SBTC, expectedIndexDelta(reward, SBTC));
      expect(result).toBeOk(Cl.uint(expected));
    });

    it("YT is NOT burned after claim-yield", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);
      simnet.callPublicFn("vault-engine", "claim-yield", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "vault-engine", "get-yt-balance", [Cl.principal(wallet1)], deployer
      );
      expect(result).toBeOk(Cl.uint(SBTC));
    });

    it("re-claim immediately after claim returns (ok u0)", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);
      simnet.callPublicFn("vault-engine", "claim-yield", [], wallet1);
      const { result } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("can claim again after a subsequent sync-yield", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);
      simnet.callPublicFn("vault-engine", "claim-yield", [], wallet1);
      syncYield(5_000_000n);

      const { result } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      const expected = expectedClaimable(SBTC, expectedIndexDelta(5_000_000n, SBTC));
      expect(result).toBeOk(Cl.uint(expected));
    });

    it("get-claimable-yield preview matches actual claim", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);

      const { result: preview } = simnet.callReadOnlyFn(
        "vault-engine", "get-claimable-yield", [Cl.principal(wallet1)], deployer
      );
      const { result: actual } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      // Both should return the same value
      expect(preview).toBeOk(Cl.uint((actual as any).value.value));
    });
  });

  // =====================================================================
  // Yield proportionality
  // =====================================================================
  describe("yield proportionality", () => {
    it("equal depositors receive equal shares", () => {
      setup();
      deposit(wallet1, SBTC);
      deposit(wallet2, SBTC);
      // supply = 2 sBTC, reward = 10M sats → 5M each
      syncYield(10_000_000n);

      const { result: r1 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      const { result: r2 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      expect(r1).toBeOk(Cl.uint(5_000_000n));
      expect(r2).toBeOk(Cl.uint(5_000_000n));
    });

    it("proportional shares for unequal deposits", () => {
      setup();
      deposit(wallet1, SBTC);      // 25% share
      deposit(wallet2, SBTC * 3n); // 75% share
      // supply = 4 sBTC, reward = 4M sats → 1M to wallet1, 3M to wallet2
      syncYield(4_000_000n);

      const { result: r1 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      const { result: r2 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      expect(r1).toBeOk(Cl.uint(1_000_000n));
      expect(r2).toBeOk(Cl.uint(3_000_000n));
    });

    it("late depositor earns no retroactive yield", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n); // wallet1 earns this
      deposit(wallet2, SBTC); // joins after sync

      const { result: r2 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      expect(r2).toBeOk(Cl.uint(0));

      const { result: r1 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      expect(r1).toBeOk(Cl.uint(5_000_000n));
    });

    it("second sync after late deposit splits correctly", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n); // only wallet1
      deposit(wallet2, SBTC);
      syncYield(4_000_000n); // split 50/50 = 2M each

      const { result: r1 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      const { result: r2 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      // wallet1: 5M from first sync + 2M from second = 7M
      expect(r1).toBeOk(Cl.uint(7_000_000n));
      // wallet2: 0 from first + 2M from second = 2M
      expect(r2).toBeOk(Cl.uint(2_000_000n));
    });
  });

  // =====================================================================
  // redeem-principal
  // =====================================================================
  describe("redeem-principal", () => {
    it("rejects before maturity", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "redeem-principal", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeErr(Cl.uint(201));
    });

    it("rejects amount = 0", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC);
      mine(MATURITY_SHORT);
      const { result } = simnet.callPublicFn(
        "vault-engine", "redeem-principal", [Cl.uint(0)], wallet1
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("rejects amount exceeding PT balance", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC);
      mine(MATURITY_SHORT);
      const { result } = simnet.callPublicFn(
        "vault-engine", "redeem-principal", [Cl.uint(SBTC + 1n)], wallet1
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("rejects non-depositor", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC);
      mine(MATURITY_SHORT);
      const { result } = simnet.callPublicFn(
        "vault-engine", "redeem-principal", [Cl.uint(SBTC)], wallet2
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("happy path: burns PT and releases sBTC at maturity", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC);
      mine(MATURITY_SHORT);

      const { result } = simnet.callPublicFn(
        "vault-engine", "redeem-principal", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC));

      // PT burned
      const { result: ptBal } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-balance", [Cl.principal(wallet1)], deployer
      );
      expect(ptBal).toBeOk(Cl.uint(0));
    });

    it("partial redeem works", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC * 2n);
      mine(MATURITY_SHORT);

      const { result } = simnet.callPublicFn(
        "vault-engine", "redeem-principal", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC));

      const { result: ptBal } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-balance", [Cl.principal(wallet1)], deployer
      );
      expect(ptBal).toBeOk(Cl.uint(SBTC));
    });
  });

  // =====================================================================
  // combine
  // =====================================================================
  describe("combine", () => {
    it("rejects after maturity", () => {
      setup(MATURITY_SHORT);
      deposit(wallet1, SBTC);
      mine(MATURITY_SHORT);
      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeErr(Cl.uint(202));
    });

    it("rejects amount = 0", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(0)], wallet1
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("rejects if insufficient PT", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(SBTC + 1n)], wallet1
      );
      expect(result).toBeErr(Cl.uint(205));
    });

    it("happy path: burns PT+YT and returns principal when no yield", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC));

      // Both tokens burned
      const { result: pt } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-balance", [Cl.principal(wallet1)], deployer
      );
      const { result: yt } = simnet.callReadOnlyFn(
        "vault-engine", "get-yt-balance", [Cl.principal(wallet1)], deployer
      );
      expect(pt).toBeOk(Cl.uint(0));
      expect(yt).toBeOk(Cl.uint(0));
    });

    it("happy path: returns principal + pending yield", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);

      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC + 5_000_000n));
    });

    it("partial combine: remaining position still accrues yield", () => {
      setup();
      deposit(wallet1, SBTC * 2n); // 2 sBTC deposited
      syncYield(10_000_000n);       // 10M sats yield on 2 sBTC supply

      // Combine half (1 sBTC) — should get 1 sBTC principal + 10M yield (all pending)
      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(SBTC)], wallet1
      );
      expect(result).toBeOk(Cl.uint(SBTC + 10_000_000n));

      // Remaining: 1 sBTC PT + 1 sBTC YT
      const { result: pt } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-balance", [Cl.principal(wallet1)], deployer
      );
      expect(pt).toBeOk(Cl.uint(SBTC));

      // New sync — remaining YT earns new yield
      syncYield(5_000_000n); // supply = 1e8, all goes to wallet1
      const { result: claimed } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      expect(claimed).toBeOk(Cl.uint(5_000_000n));
    });

    it("non-depositor combine fails", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "combine", [Cl.uint(SBTC)], wallet2
      );
      expect(result).toBeErr(Cl.uint(205));
    });
  });

  // =====================================================================
  // transfer-pt
  // =====================================================================
  describe("transfer-pt", () => {
    it("rejects wrong sender", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "transfer-pt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("transfers PT to recipient", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "transfer-pt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: bal2 } = simnet.callReadOnlyFn(
        "vault-engine", "get-pt-balance", [Cl.principal(wallet2)], deployer
      );
      expect(bal2).toBeOk(Cl.uint(SBTC));
    });

    it("PT transfer has no effect on yield accounting", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n);

      // Transfer PT — should not change yield claimable by wallet1 (YT stays)
      simnet.callPublicFn(
        "vault-engine", "transfer-pt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)], wallet1
      );

      const { result } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      expect(result).toBeOk(Cl.uint(5_000_000n));
    });
  });

  // =====================================================================
  // transfer-yt
  // =====================================================================
  describe("transfer-yt", () => {
    it("rejects wrong sender", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "transfer-yt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("transfers YT to recipient", () => {
      setup();
      deposit(wallet1, SBTC);
      const { result } = simnet.callPublicFn(
        "vault-engine", "transfer-yt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: bal2 } = simnet.callReadOnlyFn(
        "vault-engine", "get-yt-balance", [Cl.principal(wallet2)], deployer
      );
      expect(bal2).toBeOk(Cl.uint(SBTC));
    });

    it("sender's pre-transfer yield is preserved after transfer", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n); // wallet1 earns 5M

      // Transfer YT to wallet2 — sender's pending yield should be settled
      simnet.callPublicFn(
        "vault-engine", "transfer-yt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)], wallet1
      );

      // wallet1 should still be able to claim the 5M earned before transfer
      const { result: r1 } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet1
      );
      expect(r1).toBeOk(Cl.uint(5_000_000n));
    });

    it("recipient accrues only yield deposited after the transfer", () => {
      setup();
      deposit(wallet1, SBTC);
      syncYield(5_000_000n); // wallet1 earns this, wallet2 gets nothing

      simnet.callPublicFn(
        "vault-engine", "transfer-yt",
        [Cl.uint(SBTC), Cl.principal(wallet1), Cl.principal(wallet2)], wallet1
      );

      // wallet2 should have 0 claimable (no retroactive yield)
      const { result: r2before } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      expect(r2before).toBeOk(Cl.uint(0));

      // After a new sync, wallet2 (now holding all YT) earns it all
      syncYield(5_000_000n);
      const { result: r2after } = simnet.callPublicFn(
        "vault-engine", "claim-yield", [], wallet2
      );
      expect(r2after).toBeOk(Cl.uint(5_000_000n));
    });
  });
});
