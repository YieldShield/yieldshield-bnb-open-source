import type { Address } from "viem";

/** Protocol entry-point addresses per chain (from smart-contracts/deployments/<chainId>.json). */
export type EvmDeployment = {
  deploymentBlock?: bigint;
  factory: Address;
  compositeOracle: Address;
  /** On-chain demo-asset faucet (ConfigurableTokenFaucet), testnets only. */
  faucet?: Address;
};

export const DEPLOYMENTS: Record<number, EvmDeployment> = {
  // Robinhood Chain testnet — smart-contracts/deployments/46630.json (redeployed 2026-07-10).
  46630: {
    factory: "0x067E0566c8242D57e1aF9FfecD18150C84F98E92",
    compositeOracle: "0x67A89f76Ae9a89866a0E62785d7999efE1c5E592",
    faucet: "0x6c4DdBC132C8e0aee4869334e449d664c40a147C",
  },
};
