import { type Address, type PublicClient } from "viem";
import { splitRiskPoolFactoryAbi } from "./abis/splitRiskPoolFactory.js";

function missingPool(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const value = error as { data?: { errorName?: string }; cause?: unknown };
    if (value.data?.errorName === "PoolDoesNotExist") return true;
    error = value.cause;
  }
  return false;
}

/** Only published factories may authorise a pool; RPC failures never count as a missing pool. */
export async function findFactoryForPool(client: PublicClient, factories: readonly Address[], pool: Address) {
  const unique = [...new Map(factories.map((factory) => [factory.toLowerCase(), factory])).values()];
  const results = await Promise.allSettled(
    unique.map(async (factory) => ({
      factory,
      info: await client.readContract({
        address: factory,
        abi: splitRiskPoolFactoryAbi,
        functionName: "getPoolInfo",
        args: [pool],
      }),
    })),
  );
  for (const result of results) {
    if (result.status === "rejected" && !missingPool(result.reason)) throw result.reason;
  }
  const matches = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (matches.length !== 1) throw new Error("Pool does not belong to exactly one reviewed deployment.");
  return matches[0]!;
}
