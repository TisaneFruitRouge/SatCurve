/**
 * stacks.ts
 *
 * Low-level helpers for building, signing, and broadcasting Stacks
 * contract-call transactions, and for calling read-only functions.
 *
 * Uses @stacks/transactions v6 API (uintCV, cvToJSON, makeContractCall…).
 */

import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  ClarityValue,
  ClarityType,
  cvToJSON,
  getAddressFromPrivateKey,
  TransactionVersion,
} from "@stacks/transactions";
import { StacksMainnet, StacksTestnet, StacksDevnet } from "@stacks/network";
import { config } from "./config";
import { logger } from "./logger";

// -----------------------------------------------------------------------
// Network
// -----------------------------------------------------------------------

function getNetwork() {
  switch (config.network) {
    case "mainnet":
      return new StacksMainnet({ url: config.apiUrl });
    case "testnet":
      return new StacksTestnet({ url: config.apiUrl });
    default:
      return new StacksDevnet({ url: config.apiUrl });
  }
}

function getTxVersion(): TransactionVersion {
  return config.network === "mainnet"
    ? TransactionVersion.Mainnet
    : TransactionVersion.Testnet;
}

/** Stacks address derived from the bot private key. */
export function getBotAddress(): string {
  return getAddressFromPrivateKey(config.botPrivateKey, getTxVersion());
}

// -----------------------------------------------------------------------
// Contract address parsing
// -----------------------------------------------------------------------

/** Split "ST1ABC…XYZ.contract-name" into [contractAddress, contractName]. */
function parseContractId(id: string): [string, string] {
  const dot = id.lastIndexOf(".");
  if (dot < 0) throw new Error(`Invalid contract id: "${id}"`);
  return [id.slice(0, dot), id.slice(dot + 1)];
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

/**
 * Build, sign, and broadcast a contract-call transaction.
 * Returns the txid on success. Throws on broadcast failure.
 */
export async function contractCall(
  contractId: string,
  functionName: string,
  functionArgs: ClarityValue[]
): Promise<string> {
  const [contractAddress, contractName] = parseContractId(contractId);
  const network = getNetwork();

  const tx = await makeContractCall({
    network,
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderKey: config.botPrivateKey,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: config.relayer.feeMicroStx,
  });

  const result = await broadcastTransaction(tx, network);

  if ("error" in result && result.error) {
    throw new Error(`Broadcast failed [${contractName}::${functionName}]: ${result.error} — ${result.reason ?? ""}`);
  }

  const txid = (result as { txid: string }).txid;
  logger.info(`${contractName}::${functionName} → txid ${txid}`);
  return txid;
}

/**
 * Call a read-only contract function and return the parsed JSON value.
 * Unwraps a top-level (ok …) automatically; throws on (err …).
 */
export async function readOnly(
  contractId: string,
  functionName: string,
  functionArgs: ClarityValue[] = []
): Promise<ReturnType<typeof cvToJSON>> {
  const [contractAddress, contractName] = parseContractId(contractId);
  const network = getNetwork();
  const senderAddress = getBotAddress();

  const result = await callReadOnlyFunction({
    network,
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderAddress,
  });

  if (result.type === ClarityType.ResponseErr) {
    const json = cvToJSON(result);
    throw new Error(`${contractName}::${functionName} returned err ${JSON.stringify(json.value)}`);
  }

  if (result.type === ClarityType.ResponseOk) {
    return cvToJSON((result as { value: ClarityValue }).value);
  }

  return cvToJSON(result);
}

/** Convenience: read a uint from a read-only function that returns (ok uint). */
export async function readUint(contractId: string, functionName: string): Promise<bigint> {
  const json = await readOnly(contractId, functionName);
  return BigInt(json.value as string);
}

/** Re-export uintCV so callers don't need a second import. */
export { uintCV };
