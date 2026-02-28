import { describe, it, expect, beforeAll } from "vitest";
import { Cl } from "@stacks/transactions";

const CONTRACT = "yield-oracle";

// Sample values in contract units
const BTC_PRICE  = 50_000_000_000n; // $50,000 (USD * 10^6)
const STX_PRICE  =      900_000n;   // $0.90   (USD * 10^6)
const APR_1050   =         1050n;   // 10.50%  (basis points)
const APR_ZERO   =            0n;   // 0% — valid state (no rewards this cycle)

describe("yield-oracle", () => {
  let deployer: string;
  let wallet1: string;
  let wallet2: string;

  beforeAll(() => {
    const accounts = simnet.getAccounts();
    deployer = accounts.get("deployer")!;
    wallet1  = accounts.get("wallet_1")!;
    wallet2  = accounts.get("wallet_2")!;
  });

  // Each it() starts with a fresh simnet — every test is fully self-contained.

  // =========================================================================
  // BTC/USD price feed
  // =========================================================================

  describe("BTC/USD — initial state", () => {
    it("btc price is zero before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-btc-price", [], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("is-btc-price-fresh is false before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-btc-price-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(false));
    });

    it("get-trusted-btc-price errors before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-btc-price", [], deployer);
      expect(result).toBeErr(Cl.uint(101)); // err-data-too-old
    });
  });

  describe("BTC/USD — set-btc-price", () => {
    it("rejects unauthorized callers", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], wallet1);
      expect(result).toBeErr(Cl.uint(100)); // err-unauthorized
    });

    it("rejects a price of zero", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(0)], deployer);
      expect(result).toBeErr(Cl.uint(102)); // err-invalid-price
    });

    it("owner can set a valid price", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("BTC/USD — reads after update", () => {
    it("get-btc-price returns the stored value", () => {
      simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-btc-price", [], deployer);
      expect(result).toBeOk(Cl.uint(BTC_PRICE));
    });

    it("is-btc-price-fresh is true right after update", () => {
      simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-btc-price-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(true));
    });

    it("get-trusted-btc-price returns value when fresh", () => {
      simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-btc-price", [], deployer);
      expect(result).toBeOk(Cl.uint(BTC_PRICE));
    });

    it("is-btc-price-fresh is false after 301 blocks", () => {
      simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], deployer);
      simnet.mineEmptyBlocks(301);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-btc-price-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(false));
    });

    it("get-trusted-btc-price errors after 301 blocks", () => {
      simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], deployer);
      simnet.mineEmptyBlocks(301);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-btc-price", [], deployer);
      expect(result).toBeErr(Cl.uint(101));
    });
  });

  // =========================================================================
  // STX/USD price feed
  // =========================================================================

  describe("STX/USD — initial state", () => {
    it("stx price is zero before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-stx-price", [], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("is-stx-price-fresh is false before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stx-price-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(false));
    });

    it("get-trusted-stx-price errors before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-stx-price", [], deployer);
      expect(result).toBeErr(Cl.uint(101));
    });
  });

  describe("STX/USD — set-stx-price", () => {
    it("rejects unauthorized callers", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], wallet1);
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects a price of zero", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(0)], deployer);
      expect(result).toBeErr(Cl.uint(102));
    });

    it("owner can set a valid STX price", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("STX/USD — reads after update", () => {
    it("get-stx-price returns the stored value", () => {
      simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-stx-price", [], deployer);
      expect(result).toBeOk(Cl.uint(STX_PRICE));
    });

    it("is-stx-price-fresh is true right after update", () => {
      simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stx-price-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(true));
    });

    it("get-trusted-stx-price returns value when fresh", () => {
      simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-stx-price", [], deployer);
      expect(result).toBeOk(Cl.uint(STX_PRICE));
    });

    it("is-stx-price-fresh is false after 301 blocks", () => {
      simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], deployer);
      simnet.mineEmptyBlocks(301);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stx-price-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(false));
    });

    it("get-trusted-stx-price errors after 301 blocks", () => {
      simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], deployer);
      simnet.mineEmptyBlocks(301);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-stx-price", [], deployer);
      expect(result).toBeErr(Cl.uint(101));
    });
  });

  // =========================================================================
  // set-prices — atomic dual update
  // =========================================================================

  describe("set-prices (atomic)", () => {
    it("rejects unauthorized callers", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "set-prices", [Cl.uint(BTC_PRICE), Cl.uint(STX_PRICE)], wallet1
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects if BTC price is zero", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "set-prices", [Cl.uint(0), Cl.uint(STX_PRICE)], deployer
      );
      expect(result).toBeErr(Cl.uint(102));
    });

    it("rejects if STX price is zero", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "set-prices", [Cl.uint(BTC_PRICE), Cl.uint(0)], deployer
      );
      expect(result).toBeErr(Cl.uint(102));
    });

    it("updates both prices atomically", () => {
      simnet.callPublicFn(CONTRACT, "set-prices", [Cl.uint(BTC_PRICE), Cl.uint(STX_PRICE)], deployer);
      const btc = simnet.callReadOnlyFn(CONTRACT, "get-btc-price", [], deployer);
      const stx = simnet.callReadOnlyFn(CONTRACT, "get-stx-price", [], deployer);
      expect(btc.result).toBeOk(Cl.uint(BTC_PRICE));
      expect(stx.result).toBeOk(Cl.uint(STX_PRICE));
    });

    it("both feeds are fresh after set-prices", () => {
      simnet.callPublicFn(CONTRACT, "set-prices", [Cl.uint(BTC_PRICE), Cl.uint(STX_PRICE)], deployer);
      const btcFresh = simnet.callReadOnlyFn(CONTRACT, "is-btc-price-fresh", [], deployer);
      const stxFresh = simnet.callReadOnlyFn(CONTRACT, "is-stx-price-fresh", [], deployer);
      expect(btcFresh.result).toEqual(Cl.bool(true));
      expect(stxFresh.result).toEqual(Cl.bool(true));
    });
  });

  // =========================================================================
  // Stacking APR
  // =========================================================================

  describe("Stacking APR — initial state", () => {
    it("stacking apr is zero before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-stacking-apr", [], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("is-stacking-apr-fresh is false before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stacking-apr-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(false));
    });

    it("get-trusted-stacking-apr errors before any update", () => {
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-stacking-apr", [], deployer);
      expect(result).toBeErr(Cl.uint(101));
    });
  });

  describe("Stacking APR — set-stacking-apr", () => {
    it("rejects unauthorized callers", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], wallet1);
      expect(result).toBeErr(Cl.uint(100));
    });

    it("owner can set a non-zero APR", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("owner can set APR to zero (valid: no rewards this cycle)", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_ZERO)], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Stacking APR — reads after update", () => {
    it("get-stacking-apr returns the stored value", () => {
      simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-stacking-apr", [], deployer);
      expect(result).toBeOk(Cl.uint(APR_1050));
    });

    it("is-stacking-apr-fresh is true right after update", () => {
      simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stacking-apr-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(true));
    });

    it("get-trusted-stacking-apr returns value when fresh", () => {
      simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-stacking-apr", [], deployer);
      expect(result).toBeOk(Cl.uint(APR_1050));
    });

    it("APR is still fresh after 300 blocks (price window) — longer window applies", () => {
      simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      simnet.mineEmptyBlocks(301);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stacking-apr-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(true)); // 4320 block window, not 300
    });

    it("is-stacking-apr-fresh is false after 4321 blocks", () => {
      simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      simnet.mineEmptyBlocks(4321);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "is-stacking-apr-fresh", [], deployer);
      expect(result).toEqual(Cl.bool(false));
    });

    it("get-trusted-stacking-apr errors after 4321 blocks", () => {
      simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], deployer);
      simnet.mineEmptyBlocks(4321);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-trusted-stacking-apr", [], deployer);
      expect(result).toBeErr(Cl.uint(101));
    });
  });

  // =========================================================================
  // Relayer management (shared across all feeds)
  // =========================================================================

  describe("authorize-relayer", () => {
    it("rejects authorization from a non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], wallet2
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("owner can grant relayer rights", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("authorized relayer can push BTC price", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], wallet1);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("authorized relayer can push STX price", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callPublicFn(CONTRACT, "set-stx-price", [Cl.uint(STX_PRICE)], wallet1);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("authorized relayer can push both prices atomically", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callPublicFn(
        CONTRACT, "set-prices", [Cl.uint(BTC_PRICE), Cl.uint(STX_PRICE)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("authorized relayer can push Stacking APR", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callPublicFn(CONTRACT, "set-stacking-apr", [Cl.uint(APR_1050)], wallet1);
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("revoke-relayer", () => {
    it("owner can revoke relayer rights", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      simnet.callPublicFn(CONTRACT, "revoke-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callReadOnlyFn(
        CONTRACT, "is-relayer-authorized", [Cl.principal(wallet1)], deployer
      );
      expect(result).toBeOk(Cl.bool(false));
    });

    it("revoked relayer cannot push any prices", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      simnet.callPublicFn(CONTRACT, "revoke-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callPublicFn(CONTRACT, "set-btc-price", [Cl.uint(BTC_PRICE)], wallet1);
      expect(result).toBeErr(Cl.uint(100));
    });

    it("rejects revocation from a non-owner", () => {
      simnet.callPublicFn(CONTRACT, "authorize-relayer", [Cl.principal(wallet1)], deployer);
      const { result } = simnet.callPublicFn(
        CONTRACT, "revoke-relayer", [Cl.principal(wallet1)], wallet2
      );
      expect(result).toBeErr(Cl.uint(100));
    });
  });
});
