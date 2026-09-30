import { beforeEach, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { createCombinedReader } from "../src/combined-reader";
import { encodePositionId } from "../src/positionId";

const { sources } = vi.hoisted(() => ({ sources: new Map<string, any>() }));
vi.mock("../src/reader", () => ({
  createReader: (_client: unknown, deps: { factory: string }) => sources.get(deps.factory),
}));
const address = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;
const legacy = address(1),
  yields = address(2),
  oldPool = address(3),
  newPool = address(4),
  quote = address(5),
  asset = address(6);
const token = (id: Address, symbol: string, decimals: number) => ({
  token: id,
  symbol,
  name: symbol,
  decimals,
  minCollateralRatioBp: 10_000n,
  tranche: "stable",
});
const quoteInfo = token(quote, "TestUSDC", 6);
const yieldInfo = token(asset, "tvUSDT", 8);
const deployments = [
  { factory: legacy, compositeOracle: address(7) },
  { factory: yields, compositeOracle: address(8) },
];

function fixture() {
  const original = {
    loadPools: vi.fn(async () => [{ address: oldPool }]),
    listWhitelistedTokens: vi.fn(async () => [quoteInfo]),
    getTokenBalance: vi.fn(async () => 10n),
    getOwnerPositions: vi.fn(async () => ({ shield: [], protector: [] })),
    getProtectedExitQuote: vi.fn(async () => ({ amount: 1n, token: quote })),
    getActivity: vi.fn(async () => []),
  };
  const added = {
    ...original,
    loadPools: vi.fn(async () => [{ address: newPool }]),
    listWhitelistedTokens: vi.fn(async () => [quoteInfo, yieldInfo]),
    getProtectedExitQuote: vi.fn(async () => ({ amount: 2n, token: quote })),
  };
  sources.set(legacy, original);
  sources.set(yields, added);
  const client = {
    readContract: vi.fn(async (call: any) => {
      if (call.address !== yields) throw { data: { errorName: "PoolDoesNotExist" } };
      return { shieldedToken: asset, backingToken: quote };
    }),
  } as unknown as PublicClient;
  return { original, added, reader: createCombinedReader(client, deployments) };
}
beforeEach(() => sources.clear());

it("lists legacy and yield protection pools and all distinct token balances", async () => {
  const { reader } = fixture();
  expect((await reader.loadPools()).map((pool) => pool.address)).toEqual([oldPool, newPool]);
  expect((await reader.listWhitelistedTokens()).map((token) => [token.symbol, token.decimals])).toEqual([
    ["TestUSDC", 6],
    ["tvUSDT", 8],
  ]);
  expect((await reader.getBalances(address(9))).map(({ token, amount }) => [token.token, amount])).toEqual([
    [quote, 10n],
    [asset, 10n],
  ]);
});

it("routes an existing yield position’s protected exit through its own factory reader", async () => {
  const { reader, original, added } = fixture();
  const position = encodePositionId(newPool, "shield", 0n);
  expect(await reader.getProtectedExitQuote!(position)).toMatchObject({ amount: 2n });
  expect(added.getProtectedExitQuote).toHaveBeenCalledWith(position);
  expect(original.getProtectedExitQuote).not.toHaveBeenCalled();
});

it("fails the combined view when one source is unavailable or token identity disagrees", async () => {
  const first = fixture();
  first.added.loadPools.mockRejectedValueOnce(new Error("Yield deployment RPC unavailable"));
  await expect(first.reader.loadPools()).rejects.toThrow("RPC unavailable");
  first.added.listWhitelistedTokens.mockResolvedValueOnce([{ ...quoteInfo, decimals: 18 }, yieldInfo]);
  await expect(first.reader.listWhitelistedTokens()).rejects.toThrow("metadata differs");
});
