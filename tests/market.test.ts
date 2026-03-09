import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const SBTC         = 100_000_000n; // 1 sBTC in satoshis
const TERM_1Y      = 6_307_200n;
const PRICE        = 90_000_000n;  // 0.9 sBTC -- discounted PT price

let deployer: string;
let wallet1:  string;
let wallet2:  string;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function mintSbtc() {
  const amount = Cl.uint(1_000_000_000n); // 10 sBTC
  simnet.callPublicFn("sbtc-token", "mint", [amount, Cl.principal(deployer)], deployer);
  simnet.callPublicFn("sbtc-token", "mint", [amount, Cl.principal(wallet1)], deployer);
  simnet.callPublicFn("sbtc-token", "mint", [amount, Cl.principal(wallet2)], deployer);
}

/** Create a bond as `sender`. Returns bond-id. */
function createBond(sender: string, amount = SBTC, term = TERM_1Y): bigint {
  const { result } = simnet.callPublicFn(
    "bond-factory", "create-bond",
    [Cl.uint(amount), Cl.uint(term)],
    sender
  );
  expect(result).toHaveProperty("type", ClarityType.ResponseOk);
  return (result as any).value.value;
}

/** Get current PT NFT owner from bond-factory (returns Clarity optional principal). */
function getPtOwner(bondId: bigint) {
  return simnet.callReadOnlyFn(
    "bond-factory", "get-pt-owner", [Cl.uint(bondId)], deployer
  ).result;
}

/** Get current YT NFT owner from bond-factory. */
function getYtOwner(bondId: bigint) {
  return simnet.callReadOnlyFn(
    "bond-factory", "get-yt-owner", [Cl.uint(bondId)], deployer
  ).result;
}

/** Get sBTC balance for an address. */
function sbtcBalance(address: string): bigint {
  const { result } = simnet.callReadOnlyFn(
    "sbtc-token", "get-balance", [Cl.principal(address)], deployer
  );
  return (result as any).value.value;
}

// -----------------------------------------------------------------------

describe("market", () => {
  beforeAll(() => {
    const accounts = simnet.getAccounts();
    deployer = accounts.get("deployer")!;
    wallet1  = accounts.get("wallet_1")!;
    wallet2  = accounts.get("wallet_2")!;
  });

  beforeEach(() => {
    mintSbtc();
  });

  // =====================================================================
  // Read-only initial state
  // =====================================================================
  describe("initial state", () => {
    it("get-pt-listing returns none for unlisted bond", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-pt-listing", [Cl.uint(1)], deployer);
      expect(result).toBeNone();
    });

    it("get-yt-listing returns none for unlisted bond", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-yt-listing", [Cl.uint(1)], deployer);
      expect(result).toBeNone();
    });

  });

  // =====================================================================
  // Bond-factory PT NFT market
  // =====================================================================
  describe("bond-factory PT (NFT)", () => {
    it("list-pt stores listing and transfers NFT to market contract", () => {
      const bondId = createBond(wallet1);
      const marketAddr = `${deployer}.market`;

      // Before listing: wallet1 owns PT
      expect(getPtOwner(bondId)).toBeSome(Cl.principal(wallet1));

      const { result } = simnet.callPublicFn(
        "market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      // PT ownership moved to market contract
      expect(getPtOwner(bondId)).toBeSome(Cl.principal(marketAddr));

      // Listing is readable
      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-pt-listing", [Cl.uint(bondId)], deployer
      );
      expect(listing).toBeSome(
        Cl.tuple({ seller: Cl.principal(wallet1), "price-sats": Cl.uint(PRICE) })
      );
    });

    it("buy-pt transfers sBTC to seller and NFT to buyer", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      const sellerBefore = sbtcBalance(wallet1);
      const buyerBefore  = sbtcBalance(wallet2);

      const { result } = simnet.callPublicFn(
        "market", "buy-pt", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeOk(Cl.bool(true));

      // sBTC settled correctly
      expect(sbtcBalance(wallet1)).toBe(sellerBefore + PRICE);
      expect(sbtcBalance(wallet2)).toBe(buyerBefore  - PRICE);

      // PT now owned by buyer
      expect(getPtOwner(bondId)).toBeSome(Cl.principal(wallet2));

      // Listing cleared
      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-pt-listing", [Cl.uint(bondId)], deployer
      );
      expect(listing).toBeNone();
    });

    it("cancel-pt returns NFT to seller and clears listing", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-pt", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      // PT back with seller
      expect(getPtOwner(bondId)).toBeSome(Cl.principal(wallet1));

      // Listing cleared
      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-pt-listing", [Cl.uint(bondId)], deployer
      );
      expect(listing).toBeNone();
    });

    it("list-pt rejects price zero", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "market", "list-pt", [Cl.uint(bondId), Cl.uint(0)], wallet1
      );
      expect(result).toBeErr(Cl.uint(402));
    });

    it("list-pt rejects already-listed bond", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      // wallet1 no longer owns PT, so a second list will fail at NFT transfer
      // But bond-factory itself will reject: non-owner trying to transfer
      const bondId2 = createBond(wallet1);
      simnet.callPublicFn("market", "list-pt", [Cl.uint(bondId2), Cl.uint(PRICE)], wallet1);
      // Second list of same bond-id (already listed) → err u401
      const { result } = simnet.callPublicFn(
        "market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet2
      );
      expect(result).toBeErr(Cl.uint(401));
    });

    it("cancel-pt rejects caller who is not the seller", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-pt", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeErr(Cl.uint(403));
    });

    it("buy-pt rejects non-existent listing", () => {
      const { result } = simnet.callPublicFn(
        "market", "buy-pt", [Cl.uint(999)], wallet2
      );
      expect(result).toBeErr(Cl.uint(400));
    });

    it("buy-pt rejects already-purchased listing", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-pt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);
      simnet.callPublicFn("market", "buy-pt", [Cl.uint(bondId)], wallet2);

      // Second buy attempt — listing is gone
      const { result } = simnet.callPublicFn(
        "market", "buy-pt", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeErr(Cl.uint(400));
    });
  });

  // =====================================================================
  // Bond-factory YT NFT market
  // =====================================================================
  describe("bond-factory YT (NFT)", () => {
    it("list-yt stores listing and transfers NFT to market contract", () => {
      const bondId = createBond(wallet1);
      const marketAddr = `${deployer}.market`;

      expect(getYtOwner(bondId)).toBeSome(Cl.principal(wallet1));

      const { result } = simnet.callPublicFn(
        "market", "list-yt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      expect(getYtOwner(bondId)).toBeSome(Cl.principal(marketAddr));

      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-yt-listing", [Cl.uint(bondId)], deployer
      );
      expect(listing).toBeSome(
        Cl.tuple({ seller: Cl.principal(wallet1), "price-sats": Cl.uint(PRICE) })
      );
    });

    it("buy-yt transfers sBTC to seller and NFT to buyer", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-yt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      const sellerBefore = sbtcBalance(wallet1);
      const buyerBefore  = sbtcBalance(wallet2);

      const { result } = simnet.callPublicFn(
        "market", "buy-yt", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeOk(Cl.bool(true));

      expect(sbtcBalance(wallet1)).toBe(sellerBefore + PRICE);
      expect(sbtcBalance(wallet2)).toBe(buyerBefore  - PRICE);
      expect(getYtOwner(bondId)).toBeSome(Cl.principal(wallet2));
    });

    it("cancel-yt returns NFT to seller", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-yt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-yt", [Cl.uint(bondId)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
      expect(getYtOwner(bondId)).toBeSome(Cl.principal(wallet1));
    });

    it("list-yt rejects price zero", () => {
      const bondId = createBond(wallet1);
      const { result } = simnet.callPublicFn(
        "market", "list-yt", [Cl.uint(bondId), Cl.uint(0)], wallet1
      );
      expect(result).toBeErr(Cl.uint(402));
    });

    it("cancel-yt rejects non-seller", () => {
      const bondId = createBond(wallet1);
      simnet.callPublicFn("market", "list-yt", [Cl.uint(bondId), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-yt", [Cl.uint(bondId)], wallet2
      );
      expect(result).toBeErr(Cl.uint(403));
    });

    it("buy-yt rejects non-existent listing", () => {
      const { result } = simnet.callPublicFn(
        "market", "buy-yt", [Cl.uint(999)], wallet2
      );
      expect(result).toBeErr(Cl.uint(400));
    });
  });
});
