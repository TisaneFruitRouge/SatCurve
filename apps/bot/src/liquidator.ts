import type { Vault } from "@satcurve/types";
import { config } from "./config";

// Builds and broadcasts a liquidation transaction for an at-risk vault.
// Respects the 5-block self-repay window from the README spec.
//
// TODO: Use @stacks/transactions to build contract-call tx
// TODO: Sign with bot wallet derived from config.botMnemonic
// TODO: Broadcast via Stacks API

export async function liquidateVault(vault: Vault): Promise<string> {
  if (!vault.isAtRisk) {
    throw new Error(`Vault ${vault.id} is not at risk`);
  }
  // TODO: Implement liquidation tx
  throw new Error("Not implemented: liquidation tx builder");
}
