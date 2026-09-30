import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, type Address, type PublicClient } from "viem";
import { demoExchangeAbi } from "../src/abis/demoExchange";
import { readDemoMarket, readDemoTradeQuote, assertDemoTrade } from "../src/demo-trading";
import { planIntent } from "../src/intents";
import { DEMO_DEPLOYMENTS, YIELD_DEMO_DEPLOYMENTS, type DemoDeployment } from "../src/demo-deployments";

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

function fixture(configOverride: DemoDeployment = config) {
  const config = configOverride;
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
    wrongOrder: false,
    wrongScale: false,
    wrongYield: false,
    wrongExchangeOracle: false,
    prices: Object.fromEntries(
      config.assets.map((asset) => [asset.token, asset.basePriceUsd8 ?? 600n * 10n ** 8n]),
    ) as Record<string, bigint>,
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
      const asset =
        config.assets.find(
          (entry) =>
            entry.token.toLowerCase() ===
            (o.functionName === "decimals" ||
            o.functionName === "symbol" ||
            o.functionName === "name" ||
            o.functionName === "isSyntheticDemo"
              ? o.address
              : String(o.args?.[0])
            ).toLowerCase(),
        ) ?? config.assets[0]!;
      switch (o.functionName) {
        case "oracle":
          return state.wrongExchangeOracle ? address(99) : config.oracle;
        case "quoteToken":
          return config.quoteToken;
        case "feeBps":
          return state.fee;
        case "maxStockAmount":
          return config.maxStockAmount ?? 25n * unit;
        case "maxAssetAmount":
          return asset.maxAmount ?? 25n * unit;
        case "supportedStock":
          return state.supported;
        case "isDemo":
        case "isSyntheticDemo":
          return state.synthetic;
        case "tokenCount":
          return BigInt(config.assets.length);
        case "demoTokens":
          return config.assets[state.wrongOrder ? 0 : Number(o.args?.[0])]?.token;
        case "cycleSeconds":
          return state.cycle;
        case "basePrice":
          return asset.basePriceUsd8 ?? 600n * 10n ** 8n;
        case "epoch":
          return config.epoch;
        case "demoYieldBpsPerCycle":
          return (asset.demoYieldBpsPerCycle ?? 0n) + (state.wrongYield ? 1n : 0n);
        case "downsideBps":
          return asset.downsideBps;
        case "assetScale":
          return 10n ** BigInt(asset.decimals) * (state.wrongScale ? 10n : 1n);
        case "decimals":
          return o.address === config.quoteToken ? 6 : asset.decimals;
        case "symbol":
          return o.address === config.quoteToken ? "TestUSDC" : asset.symbol;
        case "name":
          return asset.name;
        case "getPrice":
          return config.model === "accelerated-yield" ? state.prices[asset.token] : state.price;
        case "quote": {
          if (config.model !== "accelerated-yield")
            return [o.args?.[1] ? state.usdBuy : state.usdSell, 1_800_000n, state.quotePrice];
          const price = state.prices[asset.token]!;
          const notional = (BigInt(String(o.args?.[2])) * price) / (10n ** BigInt(asset.decimals) * 100n);
          const fee = (notional * 30n) / 10_000n;
          return [o.args?.[1] ? notional + fee : notional - fee, fee, price];
        }
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
  delete (YIELD_DEMO_DEPLOYMENTS as Record<number, DemoDeployment>)[97];
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

const yieldConfig: DemoDeployment = {
  ...config,
  exchange: address(11),
  oracle: address(12),
  model: "accelerated-yield",
  epoch: BigInt(now - 100),
  assets: [
    {
      token: address(14),
      codehash: keccak256("0x6003"),
      symbol: "tSlisBNB",
      name: "Synthetic staked BNB - no value",
      decimals: 18,
      basePriceUsd8: 600n * 10n ** 8n,
      maxAmount: 25n * unit,
      demoYieldBpsPerCycle: 20n,
      downsideBps: 1500n,
    },
    {
      token: address(15),
      codehash: keccak256("0x6003"),
      symbol: "tWBETH",
      name: "Synthetic wrapped ETH - no value",
      decimals: 18,
      basePriceUsd8: 2000n * 10n ** 8n,
      maxAmount: 10n * unit,
      demoYieldBpsPerCycle: 15n,
      downsideBps: 1500n,
    },
    {
      token: address(16),
      codehash: keccak256("0x6003"),
      symbol: "tsUSDe",
      name: "Synthetic staked USDe - no value",
      decimals: 18,
      basePriceUsd8: 110_000_000n,
      maxAmount: 25_000n * unit,
      demoYieldBpsPerCycle: 10n,
      downsideBps: 1000n,
    },
    {
      token: address(17),
      codehash: keccak256("0x6003"),
      symbol: "tvUSDT",
      name: "Synthetic Venus USDT - no value",
      decimals: 8,
      basePriceUsd8: 2_000_000n,
      maxAmount: 50_000n * 10n ** 8n,
      demoYieldBpsPerCycle: 10n,
      downsideBps: 1000n,
    },
  ],
};

describe("separate BSC yield demo venues", () => {
  it("exposes all four verified assets with decimal-aware limits and synthetic model metadata", async () => {
    const { client } = fixture(yieldConfig);
    const market = await readDemoMarket(client, yieldConfig);
    expect(market.assets.map((asset) => [asset.symbol, asset.decimals, asset.exchange, asset.maxAmount])).toEqual(
      yieldConfig.assets.map((asset) => [asset.symbol, asset.decimals, yieldConfig.exchange, asset.maxAmount]),
    );
    expect(market.assets[3]).toMatchObject({
      demoModel: "accelerated-yield",
      demoYieldBpsPerCycle: 10,
      demoCycleSeconds: 240,
    });
  });

  it("selects only the reviewed exchange for each token, including eight-decimal vUSDT", async () => {
    const { client } = fixture(yieldConfig);
    Object.assign(YIELD_DEMO_DEPLOYMENTS, { 97: yieldConfig });
    for (const asset of yieldConfig.assets) {
      const size = 10n ** BigInt(asset.decimals);
      const quote = await readDemoTradeQuote(client, { asset: asset.token, side: "buy", amount: size });
      expect(quote).toMatchObject({ asset: asset.token, exchange: yieldConfig.exchange, outputAmount: size });
      expect(quote.priceUsd8).toBe(asset.basePriceUsd8);
      await expect(
        readDemoTradeQuote(client, { asset: asset.token, side: "buy", amount: asset.maxAmount! + 1n }),
      ).rejects.toThrow("trade limit");
    }
    await expect(
      readDemoTradeQuote(client, { asset: config.assets[0]!.token, side: "buy", amount }, yieldConfig),
    ).rejects.toThrow("reviewed");
  });

  it("rejects wrong asset ordering, model rate, decimal scale, and substituted exchange oracle", async () => {
    for (const field of ["wrongOrder", "wrongYield", "wrongScale", "wrongExchangeOracle"] as const) {
      const { client, state } = fixture(yieldConfig);
      state[field] = true;
      await expect(readDemoMarket(client, yieldConfig)).rejects.toThrow("reviewed deployment");
    }
  });

  it("requires new assets to have explicit prices and limits in the published manifest", async () => {
    const asset = yieldConfig.assets[3]!;
    const invalid = { ...yieldConfig, assets: [{ ...asset, maxAmount: undefined }] };
    await expect(readDemoMarket(fixture(invalid).client, invalid)).rejects.toThrow("invalid");
  });

  it("combines the existing WBNB and new yield venues without substituting their exchanges", async () => {
    Object.assign(YIELD_DEMO_DEPLOYMENTS, { 97: yieldConfig });
    const original = fixture();
    const yields = fixture(yieldConfig);
    const yieldAddresses = [
      yieldConfig.exchange,
      yieldConfig.oracle,
      ...yieldConfig.assets.map((asset) => asset.token),
    ];
    const client = {
      ...original.client,
      getCode: (call: { address: Address }) =>
        (yieldAddresses.includes(call.address) ? yields.client : original.client).getCode(call as never),
      readContract: (call: { address: Address }) =>
        (yieldAddresses.includes(call.address) ? yields.client : original.client).readContract(call as never),
    } as PublicClient;
    const market = await readDemoMarket(client);
    expect(market.assets.map((asset) => asset.symbol)).toEqual(["tWBNB", "tSlisBNB", "tWBETH", "tsUSDe", "tvUSDT"]);
    expect(market.assets[0]!.exchange).toBe(config.exchange);
    expect(market.assets[4]!.exchange).toBe(yieldConfig.exchange);
  });

  it("binds approvals and swap receipts to the selected asset’s verified yield exchange", async () => {
    Object.assign(YIELD_DEMO_DEPLOYMENTS, { 97: yieldConfig });
    const { client } = fixture(yieldConfig);
    const asset = yieldConfig.assets[3]!;
    const size = 100_000_000n;
    const intent = {
      kind: "demoTrade" as const,
      asset: asset.token,
      side: "buy" as const,
      amount: size,
      limit: 20_100n,
      deadline: BigInt(now + 120),
    };
    const plan = await planIntent(client, owner, { factory: address(8) }, intent);
    expect(plan.steps[0]!.args).toEqual([yieldConfig.exchange, intent.limit]);
    expect(plan.steps[1]!).toMatchObject({
      address: yieldConfig.exchange,
      args: [asset.token, true, size, intent.limit, intent.deadline],
    });
    const event = (token: Address, exchange: Address) => ({
      address: exchange,
      topics: encodeEventTopics({ abi: demoExchangeAbi, eventName: "Swapped", args: { trader: owner, stock: token } }),
      data: encodeAbiParameters(
        [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [true, size, 20_060n, 60n],
      ),
    });
    expect(plan.extract!({ logs: [event(asset.token, yieldConfig.exchange)] } as never)).toEqual({});
    expect(() => plan.extract!({ logs: [event(asset.token, config.exchange)] } as never)).toThrow("receipt");
    expect(() => plan.extract!({ logs: [event(config.assets[0]!.token, yieldConfig.exchange)] } as never)).toThrow(
      "receipt",
    );
  });

  it("rejects ambiguous token routing before any chain reads or approvals", async () => {
    Object.assign(YIELD_DEMO_DEPLOYMENTS, { 97: { ...yieldConfig, assets: config.assets } });
    const { client } = fixture();
    await expect(readDemoTradeQuote(client, { asset: config.assets[0]!.token, side: "buy", amount })).rejects.toThrow(
      "ambiguous",
    );
  });
});
