import { Configuration, TransactionsApi } from "@stacks/blockchain-api-client";
import { config } from "./config";
import { liquidateVault } from "./liquidator";
import type { Vault } from "@satcurve/types";

export class VaultMonitor {
  private api: TransactionsApi;

  constructor() {
    this.api = new TransactionsApi(
      new Configuration({ basePath: config.apiUrl })
    );
  }

  async start(): Promise<void> {
    console.log(
      `[VaultMonitor] Started on ${config.network}. Polling every ${config.liquidation.pollIntervalMs}ms`
    );
    setInterval(() => this.checkAllVaults(), config.liquidation.pollIntervalMs);
  }

  private async checkAllVaults(): Promise<void> {
    // TODO: Call read-only vault-engine::get-all-at-risk-positions
    // TODO: For each at-risk vault, check the 5-block self-repay window
    // TODO: If window has passed, call liquidateVault(vault)
    console.log("[VaultMonitor] Checking vaults... (not yet implemented)");
  }
}
