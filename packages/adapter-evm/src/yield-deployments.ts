import type { Address, Hash } from "viem";
import type { EvmDeployment } from "./deployments.js";

export type EvmFaucetDeployment = {
  address: Address;
  label: string;
  codehash?: Hash;
  tokens?: readonly Address[];
};
export type PublishedYieldDeployment = EvmDeployment & { faucetProof: EvmFaucetDeployment };

/** Separate protection/faucet sources are enabled only after the published deployment is verified. */
export const ADDITIONAL_DEPLOYMENTS: Readonly<Partial<Record<number, readonly PublishedYieldDeployment[]>>> = {};
