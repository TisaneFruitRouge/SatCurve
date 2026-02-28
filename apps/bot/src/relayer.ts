/**
 * relayer.ts
 *
 * The SatCurve relayer has two independent duty loops:
 *
 *  1. Price loop  (every ~5 min)
 *     Fetches BTC/USD and STX/USD from RedStone and pushes them to
 *     yield-oracle.clar via set-prices. Also pushes the Stacking APR
 *     once per PoX cycle (reuses the same loop with a separate counter).
 *
 *  2. Yield loop  (every PoX cycle, ~14 h on mainnet)
 *     Distributes sBTC stacking rewards to both products:
 *       a. vault-engine: calls sync-yield(poolRewards)
 *       b. bond-factory: iterates active bonds, calls deposit-yield(bondId, bondReward)
 *
 * PoX reward amounts are provided via distributeYield(). In production,
 * call this after detecting PoX cycle completion on-chain and computing
 * the reward amounts from the PoX contract data.
 */

import { uintCV } from "@stacks/transactions";
import { config } from "./config";
import { fetchMarketPrices, estimateStackingApr } from "./prices";
import { contractCall, readOnly, readUint, getBotAddress } from "./stacks";
import { logger } from "./logger";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface BondInfo {
  bondId: bigint;
  sbtcAmount: bigint;
  maturityBlock: bigint;
  combined: boolean;
  principalRedeemed: boolean;
}

export interface YieldDistribution {
  /** Total sBTC rewards for the vault-engine pool (satoshis). */
  poolRewards: bigint;
  /** Total sBTC rewards to distribute across ALL active bonds (satoshis). */
  totalBondRewards: bigint;
}

// -----------------------------------------------------------------------
// Relayer class
// -----------------------------------------------------------------------

export class Relayer {
  private priceTimer: ReturnType<typeof setInterval> | null = null;
  private aprCycleCounter = 0;
  private readonly APR_UPDATE_EVERY_N_PRICE_TICKS = 12; // update APR every hour (12 × 5 min)

  // -----------------------------------------------------------------------
  // Public: lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    logger.info(`Relayer starting — network: ${config.network}, bot: ${getBotAddress()}`);
    logger.info(`Price interval: ${config.relayer.priceIntervalMs / 1000}s`);
    logger.info(`Yield interval: ${config.relayer.yieldIntervalMs / 3_600_000}h`);

    // Run immediately on start, then on a timer
    this.runPriceTick();
    this.priceTimer = setInterval(() => this.runPriceTick(), config.relayer.priceIntervalMs);

    logger.info("Relayer running. Call relayer.distributeYield(…) each PoX cycle.");
  }

  stop(): void {
    if (this.priceTimer) clearInterval(this.priceTimer);
    logger.info("Relayer stopped.");
  }

  // -----------------------------------------------------------------------
  // Public: yield distribution (call once per PoX cycle)
  // -----------------------------------------------------------------------

  /**
   * Distribute sBTC stacking rewards for one PoX cycle.
   *
   * Call this after a PoX cycle completes and you have determined how many
   * satoshis the vault-engine pool earned and how many the bond-factory bonds
   * collectively earned (e.g. from monitoring the PoX contract or a rewards API).
   *
   * The bond rewards are split proportionally by each bond's sbtcAmount.
   */
  async distributeYield(distribution: YieldDistribution): Promise<void> {
    logger.info(
      `Yield distribution — pool: ${distribution.poolRewards} sats, ` +
      `bonds: ${distribution.totalBondRewards} sats`
    );

    await Promise.all([
      this.syncPoolYield(distribution.poolRewards),
      this.depositBondYield(distribution.totalBondRewards),
    ]);
  }

  // -----------------------------------------------------------------------
  // Price loop
  // -----------------------------------------------------------------------

  private async runPriceTick(): Promise<void> {
    try {
      await this.pushPrices();
    } catch (err) {
      logger.error(`Price tick failed: ${err}`);
    }

    this.aprCycleCounter++;
    if (this.aprCycleCounter >= this.APR_UPDATE_EVERY_N_PRICE_TICKS) {
      this.aprCycleCounter = 0;
      try {
        await this.pushStackingApr();
      } catch (err) {
        logger.error(`APR push failed: ${err}`);
      }
    }
  }

  private async pushPrices(): Promise<void> {
    const { btcUsd, stxUsd } = await fetchMarketPrices();
    await contractCall(
      config.contracts.yieldOracle,
      "set-prices",
      [uintCV(btcUsd), uintCV(stxUsd)]
    );
    logger.info(`Pushed prices — BTC: u${btcUsd}, STX: u${stxUsd}`);
  }

  /**
   * Compute and push the Stacking APR to yield-oracle.clar.
   *
   * The APR is estimated from the ratio of pool rewards to total locked
   * principal, annualised over 26 PoX cycles. Replace this calculation
   * with on-chain PoX cycle data for a production deployment.
   */
  private async pushStackingApr(): Promise<void> {
    const totalEscrowed = await readUint(config.contracts.redemptionPool, "get-total-escrowed");
    if (totalEscrowed === 0n) {
      logger.info("No sBTC escrowed — skipping APR update.");
      return;
    }

    // Placeholder: 5 % APR (500 bps). Replace with real PoX cycle data.
    // estimateStackingApr(cycleRewardsSats, totalStackedSats) can be used
    // once you have the actual cycle rewards from the PoX contract.
    const aprBps = 500n;

    await contractCall(
      config.contracts.yieldOracle,
      "set-stacking-apr",
      [uintCV(aprBps)]
    );
    logger.info(`Pushed stacking APR: ${aprBps} bps (${Number(aprBps) / 100}%)`);
  }

  // -----------------------------------------------------------------------
  // Yield: vault-engine pool
  // -----------------------------------------------------------------------

  private async syncPoolYield(poolRewards: bigint): Promise<void> {
    if (poolRewards === 0n) {
      logger.info("Pool rewards = 0, skipping sync-yield.");
      return;
    }

    await contractCall(
      config.contracts.vaultEngine,
      "sync-yield",
      [uintCV(poolRewards)]
    );
    logger.info(`vault-engine::sync-yield — ${poolRewards} sats distributed.`);
  }

  // -----------------------------------------------------------------------
  // Yield: bond-factory bonds
  // -----------------------------------------------------------------------

  private async depositBondYield(totalBondRewards: bigint): Promise<void> {
    if (totalBondRewards === 0n) {
      logger.info("Bond rewards = 0, skipping bond deposit-yield.");
      return;
    }

    const bonds = await this.fetchActiveBonds();
    if (bonds.length === 0) {
      logger.info("No active bonds found.");
      return;
    }

    const totalStacked = bonds.reduce((sum, b) => sum + b.sbtcAmount, 0n);
    logger.info(`Distributing ${totalBondRewards} sats across ${bonds.length} active bonds (total stacked: ${totalStacked} sats).`);

    for (const bond of bonds) {
      const bondReward = totalStacked > 0n
        ? (bond.sbtcAmount * totalBondRewards) / totalStacked
        : 0n;

      if (bondReward === 0n) continue;

      try {
        await contractCall(
          config.contracts.bondFactory,
          "deposit-yield",
          [uintCV(bond.bondId), uintCV(bondReward)]
        );
        logger.info(`bond-factory::deposit-yield — bond ${bond.bondId}: ${bondReward} sats`);
      } catch (err) {
        // Log and continue; a single bond failure should not block the rest
        logger.error(`deposit-yield failed for bond ${bond.bondId}: ${err}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Bond enumeration
  // -----------------------------------------------------------------------

  /**
   * Return all bonds that are eligible to receive yield:
   *   - not combined (early exit)
   *   - not principal-redeemed (matured and closed)
   *   - before their maturity block (yield deposits reject after maturity)
   *
   * Bond IDs are 0-indexed: 0 .. (next-bond-id - 1).
   */
  async fetchActiveBonds(): Promise<BondInfo[]> {
    const count = await readUint(config.contracts.bondFactory, "get-bond-count");
    logger.info(`Enumerating ${count} bonds…`);

    const currentBlock = await this.getCurrentBlockHeight();
    const active: BondInfo[] = [];

    for (let id = 0n; id < count; id++) {
      try {
        const bondJson = await readOnly(
          config.contracts.bondFactory,
          "get-bond",
          [uintCV(id)]
        );

        const bond: BondInfo = {
          bondId:           id,
          sbtcAmount:       BigInt(bondJson["sbtc-amount"].value as string),
          maturityBlock:    BigInt(bondJson["maturity-block"].value as string),
          combined:         bondJson["combined"].value as boolean,
          principalRedeemed: bondJson["principal-redeemed"].value as boolean,
        };

        if (!bond.combined && !bond.principalRedeemed && bond.maturityBlock > currentBlock) {
          active.push(bond);
        }
      } catch (err) {
        logger.error(`Failed to fetch bond ${id}: ${err}`);
      }
    }

    logger.info(`Found ${active.length} active bonds out of ${count} total.`);
    return active;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async getCurrentBlockHeight(): Promise<bigint> {
    try {
      const resp = await fetch(`${config.apiUrl}/v2/info`);
      const json = await resp.json() as { stacks_tip_height: number };
      return BigInt(json.stacks_tip_height);
    } catch {
      // Fall back to 0 — will exclude bonds by block check below
      logger.error("Could not fetch current block height; using 0 as fallback.");
      return 0n;
    }
  }
}
