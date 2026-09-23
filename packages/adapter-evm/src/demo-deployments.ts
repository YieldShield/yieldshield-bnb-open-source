import type { Address, Hash } from "viem";

/** Filled only after the BSC Testnet exchange receipts and runtime code are independently checked. */
export type DemoDeployment = {
  chainId: 97;
  exchange: Address;
  exchangeCodehash: Hash;
  oracle: Address;
  oracleCodehash: Hash;
  quoteToken: Address;
  quoteTokenCodehash: Hash;
  assets: readonly [{ token: Address; codehash: Hash; symbol: "tWBNB"; name: string; decimals: 18 }];
};

export const DEMO_DEPLOYMENTS: Readonly<Partial<Record<97, DemoDeployment>>> = {};
