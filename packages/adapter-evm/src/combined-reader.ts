import { type PublicClient } from "viem";
import type { ChainReader, PoolData, SeedToken } from "@yieldshield/core";
import { createReader, type EvmReaderDeps } from "./reader.js";
import { decodePositionId } from "./positionId.js";
import { findFactoryForPool } from "./factory-routing.js";

/** Each protocol deployment is read through its own verified factory/oracle; shared assets are deduplicated. */
export function createCombinedReader(client: PublicClient, deployments: readonly EvmReaderDeps[]): ChainReader {
  if (deployments.length === 0) throw new Error("Protection deployment is missing.");
  const readers = deployments.map((deployment) => createReader(client, deployment));
  const first = readers[0]!;
  if (readers.length === 1) return first;
  const uniquePools = (pools: PoolData[]) => {
    if (new Set(pools.map((pool) => pool.address.toLowerCase())).size !== pools.length)
      throw new Error("Protection pools have ambiguous factory routing.");
    return pools;
  };
  const reader: ChainReader = {
    ...first,
    async loadPools() {
      return uniquePools((await Promise.all(readers.map((source) => source.loadPools()))).flat());
    },
    async getOwnerPositions(owner) {
      const positions = await Promise.all(readers.map((source) => source.getOwnerPositions(owner)));
      const result = {
        shield: positions.flatMap((value) => value.shield),
        protector: positions.flatMap((value) => value.protector),
      };
      const ids = [...result.shield, ...result.protector].map((position) => position.id.toLowerCase());
      if (new Set(ids).size !== ids.length) throw new Error("Positions have ambiguous factory routing.");
      return result;
    },
    async listWhitelistedTokens() {
      const tokens = (await Promise.all(readers.map((source) => source.listWhitelistedTokens()))).flat();
      const unique = new Map<string, SeedToken>();
      for (const token of tokens) {
        const key = token.token.toLowerCase();
        const old = unique.get(key);
        if (old && (old.decimals !== token.decimals || old.symbol !== token.symbol || old.name !== token.name))
          throw new Error("Shared token metadata differs between reviewed deployments.");
        if (!old || token.minCollateralRatioBp > old.minCollateralRatioBp) unique.set(key, token);
      }
      return [...unique.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    },
    async getBalances(owner) {
      const tokens = await reader.listWhitelistedTokens();
      return Promise.all(
        tokens.map(async (token) => {
          const amount = await first.getTokenBalance(owner, token.token);
          if (amount === null) throw new Error("Token balances are unavailable. Refresh before continuing.");
          return { token, amount };
        }),
      );
    },
    async getProtectedExitQuote(position) {
      const { pool } = decodePositionId(position);
      const source = await findFactoryForPool(
        client,
        deployments.map((deployment) => deployment.factory),
        pool,
      );
      const index = deployments.findIndex(
        (deployment) => deployment.factory.toLowerCase() === source.factory.toLowerCase(),
      );
      return readers[index]!.getProtectedExitQuote!(position);
    },
    async getActivity(owner) {
      return (await Promise.all(readers.map((source) => source.getActivity(owner))))
        .flat()
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, 25);
    },
  };
  return reader;
}
