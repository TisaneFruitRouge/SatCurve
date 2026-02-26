export interface Vault {
  id: string;
  owner: string;
  collateralAmount: bigint;    // in microsBTC (1e8)
  debtAmount: bigint;          // in zBTC units
  healthFactor: number;        // percentage, e.g. 150 = 150%
  isAtRisk: boolean;
}

export interface HealthFactorUpdate {
  vaultId: string;
  previousHealthFactor: number;
  newHealthFactor: number;
  blockHeight: number;
}
