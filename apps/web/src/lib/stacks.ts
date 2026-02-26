import { StacksMainnet, StacksTestnet, StacksDevnet } from "@stacks/network";

const network = import.meta.env.VITE_STACKS_NETWORK ?? "devnet";

export const stacksNetwork =
  network === "mainnet"
    ? new StacksMainnet()
    : network === "testnet"
    ? new StacksTestnet()
    : new StacksDevnet();
