import type { ContractAddresses } from "@satcurve/types";

export const CONTRACT_ADDRESSES: ContractAddresses = {
  bondFactory: import.meta.env.VITE_BOND_FACTORY_ADDRESS ?? "",
  yieldOracle: import.meta.env.VITE_YIELD_ORACLE_ADDRESS ?? "",
  sbtcToken: import.meta.env.VITE_SBTC_TOKEN_ADDRESS ?? "",
  market: import.meta.env.VITE_MARKET_ADDRESS ?? "",
};
