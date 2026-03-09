/**
 * init-devnet.ts
 *
 * One-shot script to initialize the SatCurve contracts on a running Clarinet devnet.
 * Run this once after `make devnet` has finished deploying all contracts.
 *
 * Usage:
 *   pnpm --filter @satcurve/bot exec tsx scripts/init-devnet.ts
 *   MATURITY_BLOCKS=10000 pnpm --filter @satcurve/bot exec tsx scripts/init-devnet.ts
 *
 * What it does:
 *   1. sbtc-token::mint               — funds each test wallet with 10 sBTC
 *   2. yield-oracle::set-btc-price    — seeds BTC/USD price ($95,000)
 *   3. yield-oracle::set-stacking-apr — seeds stacking APR (8.00%)
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  makeContractCall,
  makeSTXTokenTransfer,
  broadcastTransaction,
  uintCV,
  principalCV,
  AnchorMode,
  PostConditionMode,
  type ClarityValue,
} from "@stacks/transactions";
import { StacksDevnet } from "@stacks/network";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const API_URL = process.env.STACKS_API_URL ?? "http://localhost:3999";

// sBTC amount to mint per wallet (1 000 000 000 sats = 10 sBTC)
const SBTC_AMOUNT = 1_000_000_000;

// All devnet test wallets (from settings/Devnet.toml)
const TEST_WALLETS = [
  { label: "deployer", address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM" },
  { label: "wallet_1", address: "STH847V24S32N9PZ0G0RED391PEK2CEVFFHNFX2W" },
  { label: "wallet_2", address: "STH847V24S32N9PZ0G0RED391PEK2CEVFFHNFX2W" },
  {
    label: "liquidation-bot",
    address: "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC",
  },
  {
    label: "vincent",
    address: "ST3DQZN7X9FRR0N2DZZCRAVRSCY7BA2D58BXK4C10",
  },
];

// Wallets not defined in Devnet.toml need STX sent to them explicitly.
// 500 STX per wallet — enough for transaction fees.
const STX_AMOUNT_USTX = 500_000_000n; // 500 STX in microSTX
const EXTRA_STX_WALLETS = ["ST3DQZN7X9FRR0N2DZZCRAVRSCY7BA2D58BXK4C10"];

// ---------------------------------------------------------------------------
// Key derivation — reads the deployer mnemonic from settings/Devnet.toml
// ---------------------------------------------------------------------------

function getDeployerPrivateKey(): string {
  const tomlPath = join(process.cwd(), "../../settings/Devnet.toml");
  const toml = readFileSync(tomlPath, "utf-8");

  const match = /\[accounts\.deployer\][\s\S]*?mnemonic\s*=\s*"([^"]+)"/.exec(
    toml,
  );
  if (!match?.[1])
    throw new Error("Could not find deployer mnemonic in settings/Devnet.toml");

  const seed = mnemonicToSeedSync(match[1]);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/5757'/0'/0/0");

  if (!child.privateKey) throw new Error("Failed to derive private key");
  // Append 01 suffix for compressed key format expected by @stacks/transactions
  return Buffer.from(child.privateKey).toString("hex") + "01";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Poll until all required contracts are deployed on-chain (max ~60 s). */
async function waitForContracts(
  contracts: string[],
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  console.log(`\nWaiting for contracts to be deployed on devnet…`);
  while (Date.now() < deadline) {
    const results = await Promise.all(
      contracts.map(async (name) => {
        const res = await fetch(
          `${API_URL}/v2/contracts/interface/${DEPLOYER}/${name}`,
        );
        return res.ok;
      }),
    );
    if (results.every(Boolean)) {
      console.log(`All contracts ready.\n`);
      return;
    }
    const missing = contracts.filter((_, i) => !results[i]);
    process.stdout.write(`  Still waiting for: ${missing.join(", ")} …\r`);
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error("Timed out waiting for contracts to be deployed");
}

async function sendStx(
  privateKey: string,
  network: InstanceType<typeof StacksDevnet>,
  recipient: string,
  amountUstx: bigint,
  label: string,
  nonce: number,
) {
  const tx = await makeSTXTokenTransfer({
    network,
    recipient,
    amount: amountUstx,
    senderKey: privateKey,
    anchorMode: AnchorMode.Any,
    fee: 10_000,
    nonce,
  });
  const result = await broadcastTransaction(tx, network);
  if ("error" in result && result.error) {
    throw new Error(
      `${label} failed: ${result.error} — ${(result as { reason?: string }).reason ?? ""}`,
    );
  }
  console.log(`✓ ${label} → ${(result as { txid: string }).txid}`);
}

async function getNonce(): Promise<number> {
  const res = await fetch(`${API_URL}/v2/accounts/${DEPLOYER}?proof=0`);
  const data = (await res.json()) as { nonce: number };
  return data.nonce;
}

async function call(
  privateKey: string,
  network: InstanceType<typeof StacksDevnet>,
  contractName: string,
  functionName: string,
  args: ClarityValue[],
  label: string,
  nonce: number,
) {
  const tx = await makeContractCall({
    network,
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs: args,
    senderKey: privateKey,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 10_000,
    nonce,
  });

  const result = await broadcastTransaction(tx, network);

  if ("error" in result && result.error) {
    throw new Error(
      `${label} failed: ${result.error} — ${(result as { reason?: string }).reason ?? ""}`,
    );
  }

  const { txid } = result as { txid: string };
  console.log(`✓ ${label} → ${txid}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Connecting to devnet at ${API_URL} …`);

  // Wait until all contracts are deployed (anchor-block-only: devnet needs a few blocks)
  await waitForContracts([
    "sbtc-token",
    "bond-factory",
    "market",
    "yield-oracle",
  ]);

  const privateKey = getDeployerPrivateKey();
  const network = new StacksDevnet({ url: API_URL });

  // Fetch the current confirmed nonce once and increment manually so all
  // transactions can be broadcast immediately without ConflictingNonce errors.
  let nonce = await getNonce();

  // 1. Mint sBTC to every test wallet
  console.log(
    `\nMinting ${SBTC_AMOUNT} sats sBTC to ${TEST_WALLETS.length} wallets…`,
  );
  for (const wallet of TEST_WALLETS) {
    await call(
      privateKey,
      network,
      "sbtc-token",
      "mint",
      [uintCV(SBTC_AMOUNT), principalCV(wallet.address)],
      `sbtc-token::mint → ${wallet.label} (${wallet.address})`,
      nonce++,
    );
  }

  // 1b. Send STX to wallets not defined in Devnet.toml (they have no STX by default)
  if (EXTRA_STX_WALLETS.length > 0) {
    console.log(`\nSending STX to ${EXTRA_STX_WALLETS.length} extra wallet(s)…`);
    for (const addr of EXTRA_STX_WALLETS) {
      await sendStx(
        privateKey,
        network,
        addr,
        STX_AMOUNT_USTX,
        `STX transfer → ${addr}`,
        nonce++,
      );
    }
  }

  // 2. Seed the yield oracle with realistic devnet values
  // BTC/USD price: $95,000 = 95_000_000_000 (unit: $0.000001)
  // Stacking APR: 8.00% = 800 basis points
  console.log("\nSeeding yield oracle…");
  await call(
    privateKey,
    network,
    "yield-oracle",
    "set-btc-price",
    [uintCV(95_000_000_000)],
    "yield-oracle::set-btc-price ($95,000)",
    nonce++,
  );
  await call(
    privateKey,
    network,
    "yield-oracle",
    "set-stacking-apr",
    [uintCV(800)],
    "yield-oracle::set-stacking-apr (8.00%)",
    nonce++,
  );

  console.log("\nDone.");
  console.log(`Each wallet has ${SBTC_AMOUNT / 1e8} sBTC available.`);
}

main().catch((err) => {
  console.error("Error:", (err as Error).message);
  process.exit(1);
});
