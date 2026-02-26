import type { ContractAddresses } from "@satcurve/types";

export const CONTRACT_ADDRESSES: ContractAddresses = {
  vaultEngine: import.meta.env.VITE_VAULT_ENGINE_ADDRESS ?? "",
  bondFactory: import.meta.env.VITE_BOND_FACTORY_ADDRESS ?? "",
  yieldOracle: import.meta.env.VITE_YIELD_ORACLE_ADDRESS ?? "",
  redemptionPool: import.meta.env.VITE_REDEMPTION_POOL_ADDRESS ?? "",
};
