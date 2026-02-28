import "dotenv/config";

export const config = {
  network: process.env.STACKS_NETWORK ?? "devnet",
  apiUrl: process.env.STACKS_API_URL ?? "http://localhost:3999",

  // Hex-encoded Stacks private key for the relayer wallet.
  // This account must be an authorized relayer in yield-oracle.clar
  // and the contract-owner of bond-factory.clar and vault-engine.clar.
  botPrivateKey: process.env.BOT_PRIVATE_KEY ?? "",

  contracts: {
    vaultEngine:    process.env.VAULT_ENGINE_ADDRESS    ?? "",
    bondFactory:    process.env.BOND_FACTORY_ADDRESS    ?? "",
    yieldOracle:    process.env.YIELD_ORACLE_ADDRESS    ?? "",
    redemptionPool: process.env.REDEMPTION_POOL_ADDRESS ?? "",
  },

  relayer: {
    // How often to push price updates to yield-oracle.clar.
    // Oracle staleness window is 300 blocks (~25 min); update every 5 min to stay fresh.
    priceIntervalMs: 5 * 60 * 1000,

    // How often to sync yield. Roughly one PoX cycle (2016 Bitcoin blocks).
    // ~14 h on mainnet (2016 * 10 min / 60 / 24). Adjust per environment.
    yieldIntervalMs: 14 * 60 * 60 * 1000,

    // Default fee per transaction in microSTX.
    feeMicroStx: 2000,
  },
} as const;
