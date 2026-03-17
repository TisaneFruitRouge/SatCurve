import "dotenv/config";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";

function derivePrivateKey(mnemonic: string): string {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/5757'/0'/0/0");
  if (!child.privateKey) throw new Error("Failed to derive private key from mnemonic");
  return Buffer.from(child.privateKey).toString("hex") + "01";
}

function resolvePrivateKey(): string {
  if (process.env.BOT_PRIVATE_KEY) return process.env.BOT_PRIVATE_KEY;
  if (process.env.BOT_MNEMONIC) return derivePrivateKey(process.env.BOT_MNEMONIC);
  return "";
}

export const config = {
  network: process.env.STACKS_NETWORK ?? "devnet",
  apiUrl: process.env.STACKS_API_URL ?? "http://localhost:3999",

  // Resolved from BOT_PRIVATE_KEY (hex) or BOT_MNEMONIC (24-word seed phrase).
  botPrivateKey: resolvePrivateKey(),

  contracts: {
    bondFactory: process.env.BOND_FACTORY_ADDRESS ?? "",
    yieldOracle: process.env.YIELD_ORACLE_ADDRESS ?? "",
  },

  redstone: {
    dataServiceId: process.env.REDSTONE_DATA_SERVICE_ID ?? "redstone-rapid-demo",
    uniqueSignersCount: Number(process.env.REDSTONE_UNIQUE_SIGNERS ?? "1"),
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
