/**
 * SatCurve Relayer v0.2.0
 *
 * Responsibilities:
 *   - Push BTC/USD + STX/USD prices to yield-oracle.clar every 5 minutes.
 *   - Push Stacking APR to yield-oracle.clar once per PoX cycle.
 *   - Distribute sBTC stacking rewards each PoX cycle:
 *       bond-factory: deposit-yield(bondId, bondReward) per active bond
 *
 * Usage:
 *   pnpm dev                          — start the relayer (price loop only)
 *   pnpm dev -- --distribute 1000000  — start + immediately distribute 1000000 sats
 *
 * Environment variables (see .env.example):
 *   BOT_PRIVATE_KEY, STACKS_NETWORK, STACKS_API_URL,
 *   BOND_FACTORY_ADDRESS, YIELD_ORACLE_ADDRESS
 */

import { config } from "./config";
import { logger } from "./logger";
import { Relayer } from "./relayer";

async function main() {
  logger.info("SatCurve Relayer v0.2.0");
  logger.info(`Network: ${config.network} | API: ${config.apiUrl}`);

  if (!config.botPrivateKey) {
    logger.error("BOT_PRIVATE_KEY is not set. Exiting.");
    process.exit(1);
  }

  const relayer = new Relayer();
  relayer.start();

  // Optional: one-shot yield distribution from CLI argument.
  // Example: pnpm dev -- --distribute 1000000
  const distArg = process.argv.indexOf("--distribute");
  if (distArg !== -1) {
    const amtStr = process.argv[distArg + 1];
    const totalRewards = amtStr ? BigInt(amtStr) : 0n;
    if (totalRewards > 0n) {
      logger.info(`CLI: distributing ${totalRewards} sats across bonds.`);
      await relayer.distributeYield({
        totalBondRewards: totalRewards,
      });
    }
  }

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = () => {
    relayer.stop();
    process.exit(0);
  };
  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`);
  process.exit(1);
});
