import { expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { findFactoryForPool } from "../src/factory-routing";

const address = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;
const oldFactory = address(1),
  yieldFactory = address(2),
  pool = address(3);
const info = { shieldedToken: address(4), backingToken: address(5) };
const missing = { cause: { data: { errorName: "PoolDoesNotExist" } } };

it("routes only a pool recognised by exactly one reviewed factory", async () => {
  const readContract = vi.fn(async ({ address }: { address: Address }) => {
    if (address === oldFactory) throw missing;
    return info;
  });
  const result = await findFactoryForPool(
    { readContract } as unknown as PublicClient,
    [oldFactory, yieldFactory],
    pool,
  );
  expect(result).toEqual({ factory: yieldFactory, info });
  expect(readContract.mock.calls.every(([call]) => call.address === oldFactory || call.address === yieldFactory)).toBe(
    true,
  );
});

it("fails on RPC loss instead of assuming the old factory lacks the new pool", async () => {
  const readContract = async ({ address }: { address: Address }) => {
    if (address === oldFactory) throw new Error("RPC unavailable");
    return info;
  };
  await expect(
    findFactoryForPool({ readContract } as unknown as PublicClient, [oldFactory, yieldFactory], pool),
  ).rejects.toThrow("RPC unavailable");
});

it("rejects unknown and ambiguous pool associations", async () => {
  for (const readContract of [
    async () => {
      throw missing;
    },
    async () => info,
  ]) {
    await expect(
      findFactoryForPool({ readContract } as unknown as PublicClient, [oldFactory, yieldFactory], pool),
    ).rejects.toThrow("exactly one");
  }
});
