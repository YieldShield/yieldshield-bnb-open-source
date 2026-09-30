import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  maxUint256,
  zeroAddress,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type { CreatePoolIntentParams } from "@yieldshield/core";
import {
  BSC_TESTNET_GENESIS,
  CREATION_DEPLOYMENTS,
  creationDeploymentFor,
  type CreationDeployment,
} from "../src/creation-deployments";
import { assertCreatedPools, assertCreationFactory } from "../src/pool-registry";
import {
  CREATION_FIXED,
  creationFactoryForPair,
  minimumCreationBond,
  readPoolCreationOptions,
  validateCreationParams,
} from "../src/pool-creation";
import { planIntent } from "../src/intents";
import { splitRiskPoolFactoryAbi } from "../src/abis/splitRiskPoolFactory";

// Retain published addresses and asset membership; give every pinned contract deterministic test bytecode.
vi.mock("../src/creation-deployments", async (original) => {
  const actual = await original<typeof import("../src/creation-deployments")>();
  const { keccak256 } = await import("viem");
  const hash = keccak256("0x6000");
  const deployments = actual.CREATION_DEPLOYMENTS.map((d) => ({
    ...d,
    factoryCodehash: hash,
    factoryImplementationCodehash: hash,
    poolImplementationCodehash: hash,
    compositeOracleCodehash: hash,
    demo: {
      ...d.demo,
      oracleCodehash: hash,
      quoteTokenCodehash: hash,
      assets: d.demo.assets.map((asset) => ({ ...asset, codehash: hash })),
    },
  }));
  return {
    ...actual,
    CREATION_DEPLOYMENTS: deployments,
    creationDeploymentFor: (factory: string) =>
      deployments.find((d) => d.factory.toLowerCase() === factory.toLowerCase()),
  };
});

const owner = "0x1111111111111111111111111111111111111111" as const;
const foreign = "0x2222222222222222222222222222222222222222" as const;
const pool = "0x3333333333333333333333333333333333333333" as const;
const blockHash = `0x${"ab".repeat(32)}`;
const now = 1_800_000_000n;
const factories = CREATION_DEPLOYMENTS.map((d) => d.factory);
const original = CREATION_DEPLOYMENTS[0]!;
const yieldDeployment = CREATION_DEPLOYMENTS[1]!;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
type Read = { address: Address; functionName: string; args?: readonly unknown[]; blockNumber?: bigint };

function fixture(d: CreationDeployment = original) {
  const state = {
    paused: false,
    pending: zeroAddress as Address,
    bootstrap: false,
    active: 1n,
    limit: 100n,
    hardLimit: 100n,
    bondUsd: 50_000_000_000n,
    recipient: owner as Address,
    balance: 1_000_000_000n,
    allowance: 0n,
    price: 100_000_000n,
    listed: true,
    parent: d.factory,
    timestamp: now,
  };
  const readContract = vi.fn(async ({ address, functionName, args }: Read): Promise<unknown> => {
    switch (functionName) {
      case "splitRiskPoolImplementation":
        return d.poolImplementation;
      case "compositeOracle":
        return d.compositeOracle;
      case "POOL_FACTORY":
        return state.parent;
      case "paused":
        return state.paused;
      case "pendingGovernanceTimelock":
        return state.pending;
      case "bootstrapModeEnabled":
        return state.bootstrap;
      case "activePoolCount":
        return state.active;
      case "maxActivePools":
        return state.limit;
      case "MAX_POOLS":
        return state.hardLimit;
      case "minimumCreationBondUsd":
        return state.bondUsd;
      case "defaultProtocolFeeRecipient":
        return state.recipient;
      case "isWhitelisted":
        return state.listed;
      case "getPrice":
        return state.price;
      case "balanceOf":
        return state.balance;
      case "allowance":
        return state.allowance;
      case "decimals":
        return same(address, d.demo.quoteToken) ? 6 : d.demo.assets.find((a) => same(a.token, address))!.decimals;
      case "tokenInfo": {
        const token = args![0] as Address;
        const asset = d.demo.assets.find((a) => same(a.token, token));
        return [asset?.name ?? "Test USDC", asset?.symbol ?? "TestUSDC", token, d.demo.oracle, zeroAddress, 10000n];
      }
      default:
        throw new Error(`Unexpected read ${functionName}`);
    }
  });
  const rpc = {
    getChainId: vi.fn(async () => 97),
    getBlock: vi.fn(async ({ blockNumber }: { blockNumber?: bigint; blockTag?: string }) =>
      blockNumber === 0n
        ? { hash: BSC_TESTNET_GENESIS }
        : { number: 100n, hash: blockHash, timestamp: state.timestamp },
    ),
    getCode: vi.fn(async (_args: { address: Address; blockNumber?: bigint }) => "0x6000"),
    getStorageAt: vi.fn(
      async ({ address }: { address: Address; slot: string; blockNumber: bigint }) =>
        `0x${"0".repeat(24)}${(same(address, d.factory) ? d.factoryImplementation : d.poolImplementation).slice(2)}`,
    ),
    readContract,
  };
  return { state, rpc, client: rpc as unknown as PublicClient };
}
const paramsFor = (d = original): CreatePoolIntentParams => ({
  ...CREATION_FIXED,
  shieldedToken: d.demo.assets[0]!.token,
  backingToken: d.demo.quoteToken,
  commissionRateBp: 725,
  poolFeeBp: 235,
  collateralRatioBp: 16575,
  creationBondAmount: 500_000_000n,
});
const deps = { factory: original.factory, factories };
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Number(now) * 1000);
});
afterEach(() => vi.restoreAllMocks());

describe("published factory and pool authentication", () => {
  it("routes all five assets uniquely, without extending public creation to arbitrary whitelist entries", () => {
    expect(CREATION_DEPLOYMENTS.flatMap((d) => d.demo.assets)).toHaveLength(5);
    for (const d of CREATION_DEPLOYMENTS)
      for (const asset of d.demo.assets) {
        expect(creationFactoryForPair(factories, asset.token, d.demo.quoteToken)).toBe(d.factory);
        expect(creationDeploymentFor(d.factory.toLowerCase())).toBe(d);
      }
    for (const [allowed, shielded, backing] of [
      [[foreign], original.demo.assets[0]!.token, original.demo.quoteToken],
      [[original.factory, original.factory], original.demo.assets[0]!.token, original.demo.quoteToken],
      [factories, foreign, original.demo.quoteToken],
      [factories, original.demo.quoteToken, original.demo.assets[0]!.token],
      [factories, original.demo.assets[0]!.token, yieldDeployment.demo.assets[0]!.token],
    ] as const)
      expect(() => creationFactoryForPair(allowed, shielded, backing)).toThrow();
  });
  it.each(CREATION_DEPLOYMENTS)("authenticates newly created pools for factory $factory", async (d) => {
    const f = fixture(d);
    await expect(assertCreatedPools(f.client, d.factory, [pool], 100n)).resolves.toBeUndefined();
    expect(f.rpc.getCode.mock.calls.every(([args]) => args.blockNumber === 100n)).toBe(true);
    expect(f.rpc.readContract.mock.calls.every(([args]) => args.blockNumber === 100n)).toBe(true);
  });
  it("rejects unknown factories before RPC reads", async () => {
    const f = fixture();
    await expect(assertCreationFactory(f.client, foreign, 100n)).rejects.toThrow(/verified deployment/);
    expect(f.rpc.getChainId).not.toHaveBeenCalled();
  });
  it("rejects another chain and an impostor chain with a different genesis", async () => {
    const f = fixture();
    f.rpc.getChainId.mockResolvedValue(56);
    await expect(assertCreationFactory(f.client, original.factory, 100n)).rejects.toThrow(/BSC Testnet/);
    f.rpc.getChainId.mockResolvedValue(97);
    const block = f.rpc.getBlock.getMockImplementation()!;
    f.rpc.getBlock.mockImplementation(async (args) => (args.blockNumber === 0n ? { hash: blockHash } : block(args)));
    await expect(assertCreationFactory(f.client, original.factory, 100n)).rejects.toThrow(/changed/);
  });
  it.each([
    original.factory,
    original.factoryImplementation,
    original.poolImplementation,
    original.compositeOracle,
    original.demo.oracle,
    original.demo.quoteToken,
    original.demo.assets[0]!.token,
  ])("rejects changed runtime code at %s", async (address) => {
    const f = fixture();
    f.rpc.getCode.mockImplementation(async (args) => (same(args.address, address) ? "0x6001" : "0x6000"));
    await expect(assertCreationFactory(f.client, original.factory, 100n)).rejects.toThrow(/changed/);
  });
  it("rejects an upgraded proxy, substituted pool router, or substituted oracle", async () => {
    for (const field of ["slot", "splitRiskPoolImplementation", "compositeOracle"]) {
      const f = fixture();
      if (field === "slot") f.rpc.getStorageAt.mockResolvedValue(`0x${"0".repeat(64)}`);
      else {
        const read = f.rpc.readContract.getMockImplementation()!;
        f.rpc.readContract.mockImplementation(async (args) => (args.functionName === field ? foreign : read(args)));
      }
      await expect(assertCreationFactory(f.client, original.factory, 100n)).rejects.toThrow(/changed/);
    }
  });
  it("rejects a discovered pool with wrong parent, code or implementation", async () => {
    for (const field of ["parent", "code", "slot"]) {
      const f = fixture();
      if (field === "parent") f.state.parent = foreign;
      if (field === "code")
        f.rpc.getCode.mockImplementation(async ({ address }) => (same(address, pool) ? "0x6001" : "0x6000"));
      if (field === "slot") {
        const slot = f.rpc.getStorageAt.getMockImplementation()!;
        f.rpc.getStorageAt.mockImplementation(async (args) =>
          same(args.address, pool) ? `0x${"0".repeat(64)}` : slot(args),
        );
      }
      await expect(assertCreatedPools(f.client, original.factory, [pool], 100n)).rejects.toThrow(/authenticated/);
    }
  });
});

describe("live creation options and exact native bonds", () => {
  it.each(CREATION_DEPLOYMENTS)("reads only published pairs and sealed settings for $factory", async (d) => {
    const f = fixture(d);
    const options = await readPoolCreationOptions(f.client, d.factory);
    expect(options.protectedAssets.map((a) => a.token)).toEqual(d.demo.assets.map((a) => a.token));
    expect(options.backingAssets).toMatchObject([
      { token: d.demo.quoteToken, decimals: 6, minimumBondAmount: 500_000_000n },
    ]);
    expect(options).toMatchObject({
      chainId: 97,
      factory: d.factory,
      evaluatedAt: Number(now),
      validUntil: Number(now) + 20,
      fixed: CREATION_FIXED,
    });
    expect(f.rpc.readContract.mock.calls.every(([args]) => args.blockNumber === 100n)).toBe(true);
  });
  it.each([
    { paused: true },
    { pending: foreign },
    { bootstrap: true },
    { recipient: zeroAddress },
    { active: 100n },
    { hardLimit: 101n },
    { limit: 101n },
    { listed: false },
    { price: 0n },
  ])("fails closed for unavailable live settings %#", async (patch) => {
    const f = fixture();
    Object.assign(f.state, patch);
    await expect(readPoolCreationOptions(f.client, original.factory)).rejects.toThrow();
  });
  it("supports a zero configured pool limit only via the pinned hard limit", async () => {
    const f = fixture();
    f.state.limit = 0n;
    expect((await readPoolCreationOptions(f.client, original.factory)).maxActivePools).toBe(100);
  });
  it.each([1, 2, 3, 4, 5, "decimals"])("rejects changed whitelist identity/feed/precision/floor %s", async (field) => {
    const f = fixture();
    const read = f.rpc.readContract.getMockImplementation()!;
    f.rpc.readContract.mockImplementation(async (args) => {
      if (args.functionName === "decimals" && field === "decimals") return 7;
      const result = await read(args);
      if (args.functionName !== "tokenInfo" || field === "decimals") return result;
      const tuple = [...(result as unknown[])];
      tuple[field] = field === 5 ? 9999n : field === 1 ? "Unreviewed token" : foreign;
      return tuple;
    });
    await expect(readPoolCreationOptions(f.client, original.factory)).rejects.toThrow(/whitelist/);
  });
  it("rejects stale and reorganized snapshots, including expiry during RPC work", async () => {
    const stale = fixture();
    stale.state.timestamp = now - 20n;
    await expect(readPoolCreationOptions(stale.client, original.factory)).rejects.toThrow(/out of date/);
    const reorg = fixture();
    const block = reorg.rpc.getBlock.getMockImplementation()!;
    reorg.rpc.getBlock.mockImplementation(async (args) =>
      args.blockNumber === 100n ? { number: 100n, timestamp: now, hash: `0x${"cd".repeat(32)}` } : block(args),
    );
    await expect(readPoolCreationOptions(reorg.client, original.factory)).rejects.toThrow(/changed during/);
    const slow = fixture();
    const read = slow.rpc.readContract.getMockImplementation()!;
    slow.rpc.readContract.mockImplementation(async (args) => {
      if (args.functionName === "getPrice") vi.mocked(Date.now).mockReturnValue(Number(now + 20n) * 1000);
      return read(args);
    });
    await expect(readPoolCreationOptions(slow.client, original.factory)).rejects.toThrow(/out of date/);
  });
  it("ceil-divides at native precision and rejects invalid or overflowing token amounts", () => {
    expect(minimumCreationBond(50_000_000_000n, 6, 100_120_000n)).toBe(499_400_720n);
    expect(minimumCreationBond(1n, 18, 3n)).toBe(333333333333333334n);
    expect(minimumCreationBond(maxUint256, 0, 1n)).toBe(maxUint256);
    for (const args of [
      [1n, 6, 0n],
      [-1n, 6, 1n],
      [1n, 19, 1n],
      [1n, 1.5, 1n],
      [maxUint256, 18, 1n],
    ] as const)
      expect(() => minimumCreationBond(...args)).toThrow();
  });
  it("validates custom terms, exact bounds, bond limits and every protocol-set field", async () => {
    const options = await readPoolCreationOptions(fixture().client, original.factory);
    const params = paramsFor();
    expect(validateCreationParams(params, options).backing.symbol).toBe("TestUSDC");
    for (const patch of [
      { commissionRateBp: 99 },
      { commissionRateBp: 5001 },
      { commissionRateBp: 100.1 },
      { poolFeeBp: -1 },
      { poolFeeBp: 2001 },
      { collateralRatioBp: 9999 },
      { collateralRatioBp: 50001 },
      { creationBondAmount: 499_999_999n },
      { creationBondAmount: maxUint256 + 1n },
      { backingToken: foreign },
    ])
      expect(() => validateCreationParams({ ...params, ...patch }, options)).toThrow();
    for (const key of Object.keys(CREATION_FIXED) as Array<keyof typeof CREATION_FIXED>) {
      const value = params[key];
      expect(() =>
        validateCreationParams({ ...params, [key]: typeof value === "bigint" ? value + 1n : value + 1 }, options),
      ).toThrow(/protocol setting/);
    }
  });
});

function event(
  d = original,
  patch: {
    creator?: Address;
    shielded?: Address;
    backing?: Address;
    fee?: bigint;
    commission?: bigint;
    collateral?: bigint;
    emitter?: Address;
    pool?: Address;
  } = {},
) {
  return {
    address: patch.emitter ?? d.factory,
    topics: encodeEventTopics({
      abi: splitRiskPoolFactoryAbi,
      eventName: "PoolCreated",
      args: {
        poolAddress: patch.pool ?? pool,
        shieldedToken: patch.shielded ?? d.demo.assets[0]!.token,
        backingToken: patch.backing ?? d.demo.quoteToken,
      },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
      [patch.commission ?? 725n, patch.fee ?? 235n, patch.collateral ?? 16575n, patch.creator ?? owner],
    ),
  };
}
const receipt = (...logs: ReturnType<typeof event>[]) => ({ logs }) as unknown as TransactionReceipt;
describe("creation intent approval and receipt boundaries", () => {
  it.each(CREATION_DEPLOYMENTS)("approves the exact bond and routes the reviewed terms to $factory", async (d) => {
    const f = fixture(d);
    const plan = await planIntent(f.client, owner, deps, { kind: "createPool", params: paramsFor(d) });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toMatchObject({
      address: d.demo.quoteToken,
      functionName: "approve",
      args: [d.factory, 500_000_000n],
    });
    expect(plan.steps[1]).toMatchObject({
      address: d.factory,
      functionName: "createPool",
      args: [
        d.demo.assets[0]!.token,
        d.demo.assets[0]!.symbol,
        d.demo.quoteToken,
        "TestUSDC",
        725n,
        235n,
        16575n,
        500_000_000n,
      ],
    });
    expect(plan.extract!(receipt(event(d)))).toEqual({ poolId: pool });
  });
  it("resets a partial allowance and skips approval when the exact amount is already covered", async () => {
    const f = fixture();
    f.state.allowance = 1n;
    const plan = await planIntent(f.client, owner, deps, { kind: "createPool", params: paramsFor() });
    expect(plan.steps.slice(0, 2).map((s) => s.args)).toEqual([
      [original.factory, 0n],
      [original.factory, 500_000_000n],
    ]);
    f.state.allowance = 500_000_000n;
    expect((await planIntent(f.client, owner, deps, { kind: "createPool", params: paramsFor() })).steps).toHaveLength(
      1,
    );
  });
  it.each([
    { paused: true },
    { pending: foreign },
    { bondUsd: 60_000_000_000n },
    { listed: false },
    { balance: 499_999_999n },
    { timestamp: now - 20n },
  ])("rechecks changed settings after the approval step %#", async (patch) => {
    const f = fixture();
    const plan = await planIntent(f.client, owner, deps, { kind: "createPool", params: paramsFor() });
    expect(plan.steps[0]!.functionName).toBe("approve");
    Object.assign(f.state, patch);
    await expect(plan.beforeStep!()).rejects.toThrow();
  });
  it("rejects mismatched creators, tokens, terms, emitters, zero pools and ambiguous events", async () => {
    const plan = await planIntent(fixture().client, owner, deps, { kind: "createPool", params: paramsFor() });
    for (const patch of [
      { creator: foreign },
      { shielded: foreign },
      { backing: foreign },
      { fee: 236n },
      { commission: 726n },
      { collateral: 16576n },
      { emitter: foreign },
      { pool: zeroAddress },
    ])
      expect(() => plan.extract!(receipt(event(original, patch)))).toThrow(/reviewed/);
    expect(() => plan.extract!(receipt())).toThrow(/reviewed/);
    expect(() => plan.extract!(receipt(event(), event()))).toThrow(/reviewed/);
    // Foreign events cannot impersonate the reviewed factory, but do not invalidate its unique authentic event.
    expect(plan.extract!(receipt(event(original, { emitter: foreign }), event()))).toEqual({ poolId: pool });
  });
});
