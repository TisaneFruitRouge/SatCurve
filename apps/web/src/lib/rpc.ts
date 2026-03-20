import { callReadOnlyFunction } from "@stacks/transactions";

type CallReadOnlyFunctionParams = Parameters<typeof callReadOnlyFunction>[0];

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1_000;

/** Wrapper around callReadOnlyFunction with exponential backoff on 429 errors. */
export async function callReadOnly(
  params: CallReadOnlyFunctionParams,
): ReturnType<typeof callReadOnlyFunction> {
  let attempt = 0;
  while (true) {
    try {
      return await callReadOnlyFunction(params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("too many requests");
      if (is429 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }
      throw err;
    }
  }
}
