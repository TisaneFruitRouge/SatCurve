import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const SBTC         = 100_000_000n; // 1 sBTC in satoshis
const TERM_1Y      = 6_307_200n;
const MATURITY_FAR = 100_000n;     // far future — never reached during tests
const PRICE        = 90_000_000n;  // 0.9 sBTC — discounted PT price

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

/** Wire redemption-pool → vault-engine and initialize pool. */
function setupVault(maturity = MATURITY_FAR) {
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

/** Deposit `amount` into vault-engine as `sender`. */
function vaultDeposit(sender: string, amount = SBTC) {
  return simnet.callPublicFn("vault-engine", "deposit", [Cl.uint(amount)], sender);
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

/** Get vault PT balance for an address. */
function vaultPtBalance(address: string): bigint {
  const { result } = simnet.callReadOnlyFn(
    "vault-engine", "get-pt-balance", [Cl.principal(address)], deployer
  );
  return (result as any).value.value;
}

/** Get vault YT balance for an address. */
function vaultYtBalance(address: string): bigint {
  const { result } = simnet.callReadOnlyFn(
    "vault-engine", "get-yt-balance", [Cl.principal(address)], deployer
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
    it("ft-nonce starts at 0", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-ft-nonce", [], deployer);
      expect(result).toEqual(Cl.uint(0));
    });

    it("get-pt-listing returns none for unlisted bond", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-pt-listing", [Cl.uint(1)], deployer);
      expect(result).toBeNone();
    });

    it("get-yt-listing returns none for unlisted bond", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-yt-listing", [Cl.uint(1)], deployer);
      expect(result).toBeNone();
    });

    it("get-vault-pt-listing returns none for non-existent id", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-vault-pt-listing", [Cl.uint(1)], deployer);
      expect(result).toBeNone();
    });

    it("get-vault-yt-listing returns none for non-existent id", () => {
      const { result } = simnet.callReadOnlyFn("market", "get-vault-yt-listing", [Cl.uint(1)], deployer);
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

  // =====================================================================
  // Vault-engine PT (FT) market
  // =====================================================================
  describe("vault-engine PT (FT)", () => {
    it("list-vault-pt escrows tokens and returns listing id", () => {
      setupVault();
      vaultDeposit(wallet1);
      const marketAddr = `${deployer}.market`;

      expect(vaultPtBalance(wallet1)).toBe(SBTC);

      const { result } = simnet.callPublicFn(
        "market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1
      );
      expect(result).toBeOk(Cl.uint(1));

      // Tokens moved to market contract
      expect(vaultPtBalance(wallet1)).toBe(0n);
      expect(vaultPtBalance(marketAddr)).toBe(SBTC);

      // Nonce incremented
      const { result: nonce } = simnet.callReadOnlyFn("market", "get-ft-nonce", [], deployer);
      expect(nonce).toEqual(Cl.uint(1));

      // Listing readable
      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-vault-pt-listing", [Cl.uint(1)], deployer
      );
      expect(listing).toBeSome(
        Cl.tuple({
          seller: Cl.principal(wallet1),
          amount: Cl.uint(SBTC),
          "price-sats": Cl.uint(PRICE),
        })
      );
    });

    it("buy-vault-pt transfers sBTC to seller and PT to buyer", () => {
      setupVault();
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      const sellerBefore = sbtcBalance(wallet1);
      const buyerBefore  = sbtcBalance(wallet2);

      const { result } = simnet.callPublicFn(
        "market", "buy-vault-pt", [Cl.uint(1)], wallet2
      );
      expect(result).toBeOk(Cl.bool(true));

      expect(sbtcBalance(wallet1)).toBe(sellerBefore + PRICE);
      expect(sbtcBalance(wallet2)).toBe(buyerBefore  - PRICE);
      expect(vaultPtBalance(wallet2)).toBe(SBTC);

      // Listing cleared
      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-vault-pt-listing", [Cl.uint(1)], deployer
      );
      expect(listing).toBeNone();
    });

    it("cancel-vault-pt returns tokens to seller", () => {
      setupVault();
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-vault-pt", [Cl.uint(1)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      expect(vaultPtBalance(wallet1)).toBe(SBTC);

      const { result: listing } = simnet.callReadOnlyFn(
        "market", "get-vault-pt-listing", [Cl.uint(1)], deployer
      );
      expect(listing).toBeNone();
    });

    it("list-vault-pt rejects amount zero", () => {
      setupVault();
      vaultDeposit(wallet1);
      const { result } = simnet.callPublicFn(
        "market", "list-vault-pt", [Cl.uint(0), Cl.uint(PRICE)], wallet1
      );
      expect(result).toBeErr(Cl.uint(404));
    });

    it("list-vault-pt rejects price zero", () => {
      setupVault();
      vaultDeposit(wallet1);
      const { result } = simnet.callPublicFn(
        "market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(0)], wallet1
      );
      expect(result).toBeErr(Cl.uint(402));
    });

    it("cancel-vault-pt rejects non-seller", () => {
      setupVault();
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-vault-pt", [Cl.uint(1)], wallet2
      );
      expect(result).toBeErr(Cl.uint(403));
    });

    it("buy-vault-pt rejects non-existent listing", () => {
      setupVault();
      const { result } = simnet.callPublicFn(
        "market", "buy-vault-pt", [Cl.uint(999)], wallet2
      );
      expect(result).toBeErr(Cl.uint(400));
    });

    it("nonce increments independently for each vault-pt listing", () => {
      setupVault();
      vaultDeposit(wallet1, SBTC * 2n);

      const { result: r1 } = simnet.callPublicFn(
        "market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1
      );
      const { result: r2 } = simnet.callPublicFn(
        "market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1
      );
      expect(r1).toBeOk(Cl.uint(1));
      expect(r2).toBeOk(Cl.uint(2));
    });
  });

  // =====================================================================
  // Vault-engine YT (FT) market
  // =====================================================================
  describe("vault-engine YT (FT)", () => {
    it("list-vault-yt escrows tokens and returns listing id", () => {
      setupVault();
      vaultDeposit(wallet1);
      const marketAddr = `${deployer}.market`;

      expect(vaultYtBalance(wallet1)).toBe(SBTC);

      const { result } = simnet.callPublicFn(
        "market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1
      );
      expect(result).toBeOk(Cl.uint(1));

      expect(vaultYtBalance(wallet1)).toBe(0n);
      expect(vaultYtBalance(marketAddr)).toBe(SBTC);
    });

    it("buy-vault-yt transfers sBTC to seller and YT to buyer", () => {
      setupVault();
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      const sellerBefore = sbtcBalance(wallet1);
      const buyerBefore  = sbtcBalance(wallet2);

      const { result } = simnet.callPublicFn(
        "market", "buy-vault-yt", [Cl.uint(1)], wallet2
      );
      expect(result).toBeOk(Cl.bool(true));

      expect(sbtcBalance(wallet1)).toBe(sellerBefore + PRICE);
      expect(sbtcBalance(wallet2)).toBe(buyerBefore  - PRICE);
      expect(vaultYtBalance(wallet2)).toBe(SBTC);
    });

    it("cancel-vault-yt returns YT tokens to seller", () => {
      setupVault();
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-vault-yt", [Cl.uint(1)], wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
      expect(vaultYtBalance(wallet1)).toBe(SBTC);
    });

    it("list-vault-yt rejects amount zero", () => {
      setupVault();
      vaultDeposit(wallet1);
      const { result } = simnet.callPublicFn(
        "market", "list-vault-yt", [Cl.uint(0), Cl.uint(PRICE)], wallet1
      );
      expect(result).toBeErr(Cl.uint(404));
    });

    it("list-vault-yt rejects price zero", () => {
      setupVault();
      vaultDeposit(wallet1);
      const { result } = simnet.callPublicFn(
        "market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(0)], wallet1
      );
      expect(result).toBeErr(Cl.uint(402));
    });

    it("cancel-vault-yt rejects non-seller", () => {
      setupVault();
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      const { result } = simnet.callPublicFn(
        "market", "cancel-vault-yt", [Cl.uint(1)], wallet2
      );
      expect(result).toBeErr(Cl.uint(403));
    });

    it("buy-vault-yt rejects non-existent listing", () => {
      setupVault();
      const { result } = simnet.callPublicFn(
        "market", "buy-vault-yt", [Cl.uint(999)], wallet2
      );
      expect(result).toBeErr(Cl.uint(400));
    });

    it("yield accounting remains correct after YT sold through market", () => {
      setupVault();
      // wallet1 deposits, then lists YT
      vaultDeposit(wallet1);
      simnet.callPublicFn("market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1);

      // Sync yield while YT is in escrow (market contract holds YT)
      simnet.callPublicFn(
        "redemption-pool", "escrow",
        // Escrow reward directly for test — use deployer as vault-engine stand-in isn't possible here;
        // sync via vault-engine which is already wired
        [Cl.uint(10_000_000n), Cl.principal(deployer)],
        deployer
      );
      // Use proper sync-yield through vault-engine
      simnet.callPublicFn("sbtc-token", "mint", [Cl.uint(10_000_000n), Cl.principal(deployer)], deployer);
      simnet.callPublicFn("vault-engine", "sync-yield", [Cl.uint(10_000_000n)], deployer);

      // wallet2 buys YT — checkpoint should fire for both market contract and wallet2
      simnet.callPublicFn("market", "buy-vault-yt", [Cl.uint(1)], wallet2);

      // wallet2 can now claim yield (they own YT that accrued while in market escrow)
      const { result } = simnet.callPublicFn("vault-engine", "claim-yield", [], wallet2);
      // Should succeed (ok with some amount) — the YT held by market accrued yield
      expect(result).toHaveProperty("type", ClarityType.ResponseOk);
    });
  });

  // =====================================================================
  // ft-nonce is shared between vault-pt and vault-yt listings
  // =====================================================================
  describe("shared ft-nonce", () => {
    it("vault-pt and vault-yt listings share the same nonce counter", () => {
      setupVault();
      vaultDeposit(wallet1, SBTC * 2n);

      const { result: r1 } = simnet.callPublicFn(
        "market", "list-vault-pt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1
      );
      const { result: r2 } = simnet.callPublicFn(
        "market", "list-vault-yt", [Cl.uint(SBTC), Cl.uint(PRICE)], wallet1
      );
      expect(r1).toBeOk(Cl.uint(1));
      expect(r2).toBeOk(Cl.uint(2));

      const { result: nonce } = simnet.callReadOnlyFn("market", "get-ft-nonce", [], deployer);
      expect(nonce).toEqual(Cl.uint(2));
    });
  });
});
