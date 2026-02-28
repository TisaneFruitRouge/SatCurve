import { describe, it, expect, beforeAll } from "vitest";
import { Cl } from "@stacks/transactions";

const SBTC = 100_000_000n; // 1 sBTC in satoshis

let deployer: string;
let wallet1: string;
let wallet2: string;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Set vault-engine-principal to `as` so we can call escrow/release directly
 * without going through the actual vault-engine contract.
 */
function setupPool(as = deployer) {
  simnet.callPublicFn(
    "redemption-pool",
    "set-vault-engine",
    [Cl.principal(as)],
    deployer
  );
}

// -----------------------------------------------------------------------

describe("redemption-pool", () => {
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
    it("total-escrowed starts at 0", () => {
      const { result } = simnet.callReadOnlyFn(
        "redemption-pool", "get-total-escrowed", [], deployer
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("vault-engine is none before configuration", () => {
      const { result } = simnet.callReadOnlyFn(
        "redemption-pool", "get-vault-engine", [], deployer
      );
      expect(result).toBeOk(Cl.none());
    });
  });

  // =====================================================================
  // set-vault-engine
  // =====================================================================
  describe("set-vault-engine", () => {
    it("rejects non-owner caller", () => {
      const { result } = simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("happy path: sets vault-engine principal", () => {
      const { result } = simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: readResult } = simnet.callReadOnlyFn(
        "redemption-pool", "get-vault-engine", [], deployer
      );
      expect(readResult).toBeOk(Cl.some(Cl.principal(wallet1)));
    });

    it("rejects double-set", () => {
      simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(wallet1)], deployer
      );
      const { result } = simnet.callPublicFn(
        "redemption-pool", "set-vault-engine",
        [Cl.principal(wallet2)], deployer
      );
      expect(result).toBeErr(Cl.uint(300));
    });
  });

  // =====================================================================
  // escrow
  // =====================================================================
  describe("escrow", () => {
    it("rejects caller that is not vault-engine", () => {
      setupPool(deployer); // deployer IS vault-engine
      const { result } = simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC), Cl.principal(wallet1)],
        wallet1 // wallet1 calling, but vault-engine = deployer
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects amount = 0", () => {
      setupPool(deployer);
      const { result } = simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(0), Cl.principal(deployer)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(301));
    });

    it("happy path: escrows sBTC and returns new total", () => {
      setupPool(deployer);
      const { result } = simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC), Cl.principal(deployer)],
        deployer
      );
      expect(result).toBeOk(Cl.uint(SBTC));

      const { result: total } = simnet.callReadOnlyFn(
        "redemption-pool", "get-total-escrowed", [], deployer
      );
      expect(total).toBeOk(Cl.uint(SBTC));
    });

    it("accumulates across multiple escrow calls", () => {
      setupPool(deployer);
      simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC), Cl.principal(deployer)], deployer
      );
      const { result } = simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC), Cl.principal(deployer)], deployer
      );
      expect(result).toBeOk(Cl.uint(SBTC * 2n));
    });
  });

  // =====================================================================
  // release
  // =====================================================================
  describe("release", () => {
    it("rejects caller that is not vault-engine", () => {
      setupPool(deployer);
      simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC), Cl.principal(deployer)], deployer
      );
      const { result } = simnet.callPublicFn(
        "redemption-pool", "release",
        [Cl.uint(SBTC), Cl.principal(wallet1)],
        wallet1 // not the vault-engine
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects amount = 0", () => {
      setupPool(deployer);
      const { result } = simnet.callPublicFn(
        "redemption-pool", "release",
        [Cl.uint(0), Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(301));
    });

    it("happy path: releases sBTC to recipient and returns new total", () => {
      setupPool(deployer);
      simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC), Cl.principal(deployer)], deployer
      );
      const { result } = simnet.callPublicFn(
        "redemption-pool", "release",
        [Cl.uint(SBTC), Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeOk(Cl.uint(0));

      const { result: total } = simnet.callReadOnlyFn(
        "redemption-pool", "get-total-escrowed", [], deployer
      );
      expect(total).toBeOk(Cl.uint(0));
    });

    it("partial release leaves correct total", () => {
      setupPool(deployer);
      simnet.callPublicFn(
        "redemption-pool", "escrow",
        [Cl.uint(SBTC * 2n), Cl.principal(deployer)], deployer
      );
      simnet.callPublicFn(
        "redemption-pool", "release",
        [Cl.uint(SBTC), Cl.principal(wallet1)], deployer
      );

      const { result: total } = simnet.callReadOnlyFn(
        "redemption-pool", "get-total-escrowed", [], deployer
      );
      expect(total).toBeOk(Cl.uint(SBTC));
    });
  });
});
