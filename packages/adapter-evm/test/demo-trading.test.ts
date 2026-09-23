import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, type Address, type PublicClient } from "viem";
import { demoExchangeAbi } from "../src/abis/demoExchange";
import { readDemoMarket, readDemoTradeQuote, assertDemoTrade } from "../src/demo-trading";
import { planIntent } from "../src/intents";
import { DEMO_DEPLOYMENTS, type DemoDeployment } from "../src/demo-deployments";

const address = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;
const now = 1_800_000_000;
const unit = 10n ** 18n;
const owner = address(9);
const amount = unit;
const usdBuy = 601_800_000n;
const usdSell = 598_200_000n;
const config: DemoDeployment = {
  chainId: 97,
  exchange: address(1),
  exchangeCodehash: keccak256("0x6001"),
  oracle: address(2),
  oracleCodehash: keccak256("0x6002"),
  quoteToken: address(3),
  quoteTokenCodehash: keccak256("0x6003"),
  assets: [
    {
      token: address(4),
      codehash: keccak256("0x6003"),
      symbol: "tWBNB",
      name: "YieldShield test WBNB - no value",
      decimals: 18,
    },
  ],
};

function fixture() {
  const state = {
    chain: 97,
    code: "valid",
    badCodeAt: address(0),
    canonical: true,
    supported: true,
    synthetic: true,
    fee: 30n,
    cycle: 240n,
    price: 600n * 10n ** 8n,
    quotePrice: 600n * 10n ** 8n,
    usdBuy,
    usdSell,
    inventory: 10n ** 24n,
    wallet: 10n ** 24n,
    native: 1n,
    allowance: 0n,
  };
  const client = {
    getChainId: async () => state.chain,
    getBlock: async (o: { blockTag?: string; blockNumber?: bigint }) => ({
      number: 10n,
      hash: "0x" + (o.blockTag === "latest" || state.canonical ? "11" : "22").repeat(32),
      timestamp: BigInt(now - 1),
    }),
    getCode: async (o: { address: Address; blockNumber?: bigint }) => {
      expect(o.blockNumber).toBe(10n);
      if (state.code === "bad" && o.address === state.badCodeAt) return "0x6000";
      if (o.address === config.exchange) return "0x6001";
      if (o.address === config.oracle) return "0x6002";
      return "0x6003";
    },
    getBalance: async () => state.native,
    readContract: async (o: { address: Address; functionName: string; args?: unknown[]; blockNumber?: bigint }) => {
      if (o.blockNumber !== undefined) expect(o.blockNumber).toBe(10n);
      switch (o.functionName) {
        case "oracle":
          return config.oracle;
        case "quoteToken":
          return config.quoteToken;
        case "feeBps":
          return state.fee;
        case "maxStockAmount":
        case "maxAssetAmount":
          return 25n * unit;
        case "supportedStock":
          return state.supported;
        case "isDemo":
        case "isSyntheticDemo":
          return state.synthetic;
        case "tokenCount":
          return 1n;
        case "demoTokens":
          return config.assets[0].token;
        case "cycleSeconds":
          return state.cycle;
        case "basePrice":
          return 600n * 10n ** 8n;
        case "decimals":
          return o.address === config.quoteToken ? 6 : 18;
        case "symbol":
          return o.address === config.quoteToken ? "TestUSDC" : "tWBNB";
        case "name":
          return config.assets[0].name;
        case "getPrice":
          return state.price;
        case "quote":
          return [o.args?.[1] ? state.usdBuy : state.usdSell, 1_800_000n, state.quotePrice];
        case "balanceOf":
          return o.args?.[0] === config.exchange ? state.inventory : state.wallet;
        case "allowance":
          return state.allowance;
        default:
          throw new Error("Unexpected read " + o.functionName);
      }
    },
  } as unknown as PublicClient;
  return { client, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  Object.assign(DEMO_DEPLOYMENTS, { 97: config });
});
afterEach(() => {
  delete (DEMO_DEPLOYMENTS as Record<number, DemoDeployment>)[97];
  vi.useRealTimers();
});

describe("BSC Testnet token trading", () => {
  it("accepts only the reviewed tWBNB/TestUSDC venue and labels synthetic evaluation", async () => {
    const f = fixture();
    const market = await readDemoMarket(f.client, config);
    expect(market).toMatchObject({
      chainId: 97,
      exchange: config.exchange,
      feeBps: 30,
      ready: true,
      evaluatedAt: now - 1,
      validUntil: now + 19,
      quoteToken: { token: config.quoteToken, symbol: "TestUSDC", decimals: 6 },
    });
    expect(market.assets).toMatchObject([
      { token: config.assets[0].token, symbol: "tWBNB", priceUsd8: f.state.price, maxAmount: 25n * unit },
    ]);
  });

  it("does not trade without a published reviewed registry", async () => {
    const f = fixture();
    delete (DEMO_DEPLOYMENTS as Record<number, DemoDeployment>)[97];
    await expect(readDemoMarket(f.client)).rejects.toThrow("being prepared");
  });

  it("quotes exact buy input and sell output at one sealed block", async () => {
    const f = fixture();
    const buy = await readDemoTradeQuote(f.client, { asset: config.assets[0].token, side: "buy", amount }, config);
    expect(buy).toMatchObject({
      inputToken: config.quoteToken,
      outputToken: config.assets[0].token,
      inputAmount: usdBuy,
      outputAmount: amount,
      feeAmount: 1_800_000n,
      priceUsd8: f.state.price,
    });
    const sell = await readDemoTradeQuote(
      f.client,
      { asset: config.assets[0].token, side: "sell", amount, owner },
      config,
    );
    expect(sell).toMatchObject({
      inputToken: config.assets[0].token,
      outputToken: config.quoteToken,
      inputAmount: amount,
      outputAmount: usdSell,
      owner,
    });
  });

  it.each([56, 84532, 1, 31337])("rejects chain %s", async (chain) => {
    const f = fixture();
    f.state.chain = chain;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("BSC Testnet");
  });

  it("rejects exchange-code substitution, even with identical getter responses", async () => {
    const f = fixture();
    f.state.code = "bad";
    f.state.badCodeAt = config.exchange;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("could not be verified");
  });

  it("rejects oracle and test-token code substitution", async () => {
    const f = fixture();
    f.state.code = "bad";
    for (const addressToReplace of [config.oracle, config.quoteToken, config.assets[0].token]) {
      f.state.badCodeAt = addressToReplace;
      await expect(readDemoMarket(f.client, config)).rejects.toThrow("could not be verified");
    }
  });

  it("rejects mismatched token or oracle identity", async () => {
    const f = fixture();
    f.state.synthetic = false;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("configuration");
    f.state.synthetic = true;
    f.state.cycle = 300n;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("reviewed deployment");
  });

  it("rejects changed canonical block evidence and mismatched quote price", async () => {
    const f = fixture();
    f.state.canonical = false;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("changed");
    f.state.canonical = true;
    f.state.quotePrice += 1n;
    await expect(
      readDemoTradeQuote(f.client, { asset: config.assets[0].token, side: "buy", amount }, config),
    ).rejects.toThrow("executable");
  });

  it("rejects unsupported, empty and oversized orders and drained inventory", async () => {
    const f = fixture();
    for (const [asset, size] of [
      [address(90), amount],
      [config.assets[0].token, 0n],
      [config.assets[0].token, 26n * unit],
    ] as const)
      await expect(readDemoTradeQuote(f.client, { asset, side: "buy", amount: size }, config)).rejects.toThrow();
    f.state.inventory = amount - 1n;
    await expect(
      readDemoTradeQuote(f.client, { asset: config.assets[0].token, side: "buy", amount }, config),
    ).rejects.toThrow("inventory");
  });

  it("enforces the user's absolute buy/sell limit and short deadline", async () => {
    const f = fixture();
    const request = {
      asset: config.assets[0].token,
      side: "buy" as const,
      amount,
      limit: usdBuy,
      deadline: BigInt(now + 120),
    };
    await expect(assertDemoTrade(f.client, owner, request, config)).resolves.toMatchObject({ owner });
    await expect(assertDemoTrade(f.client, owner, { ...request, limit: usdBuy - 1n }, config)).rejects.toThrow(
      "reviewed limit",
    );
    await expect(
      assertDemoTrade(f.client, owner, { ...request, side: "sell", limit: usdSell + 1n }, config),
    ).rejects.toThrow("reviewed limit");
    await expect(assertDemoTrade(f.client, owner, { ...request, deadline: BigInt(now) }, config)).rejects.toThrow(
      "expired",
    );
    await expect(assertDemoTrade(f.client, owner, { ...request, deadline: BigInt(now + 301) }, config)).rejects.toThrow(
      "expired",
    );
  });

  it("checks wallet input coverage and test BNB before approvals", async () => {
    const f = fixture();
    const request = {
      asset: config.assets[0].token,
      side: "buy" as const,
      amount,
      limit: usdBuy + 1n,
      deadline: BigInt(now + 120),
    };
    f.state.wallet = usdBuy;
    await expect(assertDemoTrade(f.client, owner, request, config)).rejects.toThrow("balance");
    f.state.wallet = 10n ** 24n;
    f.state.native = 0n;
    await expect(assertDemoTrade(f.client, owner, request, config)).rejects.toThrow("test BNB");
  });

  it("re-quotes after approval and stops when a later price exceeds the reviewed bound", async () => {
    const f = fixture();
    const intent = {
      kind: "demoTrade" as const,
      asset: config.assets[0].token,
      side: "buy" as const,
      amount,
      limit: usdBuy,
      deadline: BigInt(now + 120),
    };
    const plan = await planIntent(f.client, owner, { factory: address(8) }, intent);
    expect(plan.steps.map((s) => s.functionName)).toEqual(["approve", "swap"]);
    expect(plan.steps[0]?.args).toEqual([config.exchange, usdBuy]);
    f.state.usdBuy += 1n;
    await expect(plan.beforeStep?.()).rejects.toThrow("reviewed limit");
  });

  it("accepts only a single matching Swapped event from the verified exchange", async () => {
    const f = fixture();
    const intent = {
      kind: "demoTrade" as const,
      asset: config.assets[0].token,
      side: "buy" as const,
      amount,
      limit: usdBuy,
      deadline: BigInt(now + 120),
    };
    const plan = await planIntent(f.client, owner, { factory: address(8) }, intent);
    const event = (trader: Address, usdcAmount: bigint, from = config.exchange) => ({
      address: from,
      topics: encodeEventTopics({
        abi: demoExchangeAbi,
        eventName: "Swapped",
        args: { trader, stock: config.assets[0].token },
      }),
      data: encodeAbiParameters(
        [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [true, amount, usdcAmount, 1_800_000n],
      ),
    });
    expect(plan.extract?.({ logs: [event(owner, usdBuy)] } as never)).toEqual({});
    expect(() => plan.extract?.({ logs: [event(address(99), usdBuy)] } as never)).toThrow("receipt");
    expect(() => plan.extract?.({ logs: [event(owner, usdBuy + 1n)] } as never)).toThrow("receipt");
    expect(() => plan.extract?.({ logs: [event(owner, usdBuy, address(88))] } as never)).toThrow("receipt");
  });
});
