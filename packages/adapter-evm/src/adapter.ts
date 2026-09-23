/**
 * Adapter assembly: config in → { info, reader, publicClient } out. The wagmi side (wallet
 * connection, tx submission) is layered on in react.tsx; everything here runs headless too
 * (Node scripts, smoke tests).
 */
import { createPublicClient, http, zeroAddress, type Address, type Chain, type PublicClient } from "viem";
import type { ChainAdapter, ChainInfo } from "@yieldshield/core";
import { DEPLOYMENTS } from "./deployments.js";
import { createReader } from "./reader.js";

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
  addresses: { factory: Address; compositeOracle: Address; faucet?: Address };
};

export function createEvmAdapter(config: EvmAdapterConfig): EvmAdapter {
  const deployment = DEPLOYMENTS[config.chain.id];
  const factory = config.factory ?? deployment?.factory;
  const compositeOracle = config.compositeOracle ?? deployment?.compositeOracle;
  const rpcUrl = config.rpcUrl ?? config.chain.rpcUrls.default.http[0]!;
  const publicClient = createPublicClient({ chain: config.chain, transport: http(rpcUrl) });
  const faucet = config.faucetAddress === null ? undefined : (config.faucetAddress ?? deployment?.faucet);

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
        ? createReader(publicClient, { factory, compositeOracle, deploymentBlock: deployment?.deploymentBlock })
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
    addresses: { factory: factory ?? zeroAddress, compositeOracle: compositeOracle ?? zeroAddress, faucet },
  };
}
