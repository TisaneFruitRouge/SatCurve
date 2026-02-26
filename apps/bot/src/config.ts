import "dotenv/config";

export const config = {
  network: process.env.STACKS_NETWORK ?? "devnet",
  apiUrl: process.env.STACKS_API_URL ?? "http://localhost:3999",
  botMnemonic: process.env.BOT_MNEMONIC ?? "",
  botAccountIndex: parseInt(process.env.BOT_ACCOUNT_INDEX ?? "0"),
  contracts: {
    vaultEngine: process.env.VAULT_ENGINE_ADDRESS ?? "",
    bondFactory: process.env.BOND_FACTORY_ADDRESS ?? "",
    yieldOracle: process.env.YIELD_ORACLE_ADDRESS ?? "",
    redemptionPool: process.env.REDEMPTION_POOL_ADDRESS ?? "",
  },
  liquidation: {
    pollIntervalMs: 5_000,         // poll every 5 seconds (~1 Stacks block)
    minHealthFactor: 110,          // liquidate below 110% collateral ratio
    selfRepayWindowBlocks: 5,      // 5-block window for vault owner to self-repay
  },
} as const;
