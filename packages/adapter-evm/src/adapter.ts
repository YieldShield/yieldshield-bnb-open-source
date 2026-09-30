/**
 * Adapter assembly: config in → { info, reader, publicClient } out. The wagmi side (wallet
 * connection, tx submission) is layered on in react.tsx; everything here runs headless too
 * (Node scripts, smoke tests).
 */
import { createPublicClient, http, zeroAddress, type Address, type Chain, type PublicClient } from "viem";
import type { ChainAdapter, ChainInfo } from "@yieldshield/core";
import { DEPLOYMENTS } from "./deployments.js";
import { ADDITIONAL_DEPLOYMENTS, type EvmFaucetDeployment } from "./yield-deployments.js";
import { createCombinedReader } from "./combined-reader.js";

export type EvmAdapterConfig = {
  /** viem chain definition (see chains.ts for Robinhood mainnet/testnet). */
  chain: Chain;
  /** Defaults to the chain's default RPC. */
  rpcUrl?: string;
  /** Protocol entry points; default from deployments.ts by chain id. */
  factory?: Address;
  compositeOracle?: Address;
  /** Chain badge label; defaults to the chain name's first word ("Robinhood"). */
  label?: string;
  /** On-chain demo-asset faucet; defaults from deployments.ts. Pass null to disable. */
  faucetAddress?: Address | null;
};

export type EvmAdapter = ChainAdapter & {
  chain: Chain;
  rpcUrl: string;
  publicClient: PublicClient;
  addresses: {
    factory: Address;
    factories?: readonly Address[];
    compositeOracle: Address;
    faucet?: Address;
    faucets?: readonly EvmFaucetDeployment[];
  };
};

export function createEvmAdapter(config: EvmAdapterConfig): EvmAdapter {
  const deployment = DEPLOYMENTS[config.chain.id];
  const factory = config.factory ?? deployment?.factory;
  const compositeOracle = config.compositeOracle ?? deployment?.compositeOracle;
  const rpcUrl = config.rpcUrl ?? config.chain.rpcUrls.default.http[0]!;
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(rpcUrl),
    // Aggregate public getters at their requested block. Account-specific simulations retain their caller.
    batch: config.chain.id === 97 ? { multicall: true } : undefined,
  });
  const faucet = config.faucetAddress === null ? undefined : (config.faucetAddress ?? deployment?.faucet);

  // Explicit protocol overrides cannot acquire access to additional published deployments.
  const additional = config.factory || config.compositeOracle ? [] : (ADDITIONAL_DEPLOYMENTS[config.chain.id] ?? []);
  const protocols =
    factory && compositeOracle
      ? [{ factory, compositeOracle, deploymentBlock: deployment?.deploymentBlock }, ...additional]
      : [];
  const faucets: EvmFaucetDeployment[] =
    config.faucetAddress === null
      ? []
      : [
          ...(faucet ? [{ address: faucet, label: "Original test tokens" }] : []),
          ...additional.flatMap((source) => (source.faucetProof ? [source.faucetProof] : [])),
        ];

  const explorer = config.chain.blockExplorers?.default.url;
  const info: ChainInfo = {
    family: "evm",
    label: config.label ?? config.chain.name.split(" ")[0]!,
    network: config.chain.testnet ? "testnet" : "mainnet",
    explorerTxUrl: (tx) => (explorer ? `${explorer}/tx/${tx}` : tx),
    protocolId: factory ?? zeroAddress,
    oracleLabel:
      config.chain.id === 97
        ? "Synthetic demo prices"
        : config.chain.id === 84532
          ? "Relayed Chainlink · alpha"
          : "Chainlink",
    capabilities: {
      faucet: !!faucet,
      needsTokenApprovals: true,
    },
  };

  return {
    info,
    reader:
      factory && compositeOracle
        ? createCombinedReader(publicClient, protocols)
        : new Proxy({} as ChainAdapter["reader"], {
            get: () => async () => {
              throw new Error(
                "Protection contracts are awaiting deployment. Live token references remain available on Markets.",
              );
            },
          }),
    chain: config.chain,
    rpcUrl,
    publicClient,
    addresses: {
      factory: factory ?? zeroAddress,
      factories: protocols.map((source) => source.factory),
      compositeOracle: compositeOracle ?? zeroAddress,
      faucet,
      faucets,
    },
  };
}
