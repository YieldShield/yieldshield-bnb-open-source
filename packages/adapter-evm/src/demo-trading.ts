import {
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  maxUint256,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import type { DemoMarket, DemoTradeQuote, DemoTradeRequest } from "@yieldshield/core";
import { demoDeploymentsFor, type DemoDeployment, type DemoAssetDeployment } from "./demo-deployments.js";
import { demoExchangeAbi, demoOracleAbi } from "./abis/demoExchange.js";
import { readSnapshot } from "./snapshot.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function requireState(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const validAddress = (value: string) => isAddress(value) && !same(value, zeroAddress);
const LEGACY_MAX_AMOUNT = 25n * 10n ** 18n;
const LEGACY_BASE_PRICE = 600n * 10n ** 8n;

const assetLimits = (asset: DemoAssetDeployment) => {
  const legacy = asset.symbol === "tWBNB" && asset.decimals === 18;
  return {
    ...asset,
    basePriceUsd8: asset.basePriceUsd8 ?? (legacy ? LEGACY_BASE_PRICE : 0n),
    maxAmount: asset.maxAmount ?? (legacy ? LEGACY_MAX_AMOUNT : 0n),
  };
};

function checkedDeployments(deployment?: DemoDeployment) {
  const configs = deployment ? [deployment] : demoDeploymentsFor(97);
  requireState(configs.length > 0, "Demo trading is being prepared.");
  const tokens = configs.flatMap((config) => config.assets.map((asset) => asset.token.toLowerCase()));
  requireState(new Set(tokens).size === tokens.length, "Demo assets have ambiguous exchange routing.");
  return configs;
}

/** Verify every token and all immutable routing/model fields before exposing an executable venue. */
export async function readDemoContext(client: PublicClient, deployment?: DemoDeployment, token?: string) {
  requireState((await client.getChainId()) === 97, "Demo trading requires BSC Testnet.");
  const configs = checkedDeployments(deployment);
  const config = token
    ? configs.find((candidate) => candidate.assets.some((asset) => same(asset.token, token)))
    : configs[0];
  requireState(config?.chainId === 97, "Choose a reviewed BSC Testnet demo asset.");
  const assets = config.assets.map(assetLimits);
  const addresses = [config.exchange, config.oracle, config.quoteToken, ...assets.map((asset) => asset.token)];
  requireState(
    assets.length > 0 &&
      assets.length <= 64 &&
      addresses.every(validAddress) &&
      new Set(addresses.map((address) => address.toLowerCase())).size === addresses.length &&
      assets.every(
        (asset) =>
          Number.isInteger(asset.decimals) &&
          asset.decimals >= 0 &&
          asset.decimals <= 18 &&
          asset.maxAmount > 0n &&
          asset.maxAmount <= maxUint256 &&
          asset.basePriceUsd8 > 0n,
      ),
    "Demo deployment is invalid.",
  );
  const snapshot = await readSnapshot(client, "Demo trading");
  const blockNumber = snapshot.block.number;
  const asset = token ? assets.find((candidate) => same(candidate.token, token))! : assets[0]!;
  const exchange = { address: config.exchange, abi: demoExchangeAbi, blockNumber } as const;
  const oracle = { address: config.oracle, abi: demoOracleAbi, blockNumber } as const;
  const [
    exchangeCode,
    oracleCode,
    quoteCode,
    exchangeOracle,
    exchangeQuote,
    feeBps,
    maxStockAmount,
    isDemo,
    oracleQuote,
    tokenCount,
    cycle,
    quoteDecimals,
    quoteSymbol,
    quoteSynthetic,
  ] = await Promise.all([
    client.getCode({ address: config.exchange, blockNumber }),
    client.getCode({ address: config.oracle, blockNumber }),
    client.getCode({ address: config.quoteToken, blockNumber }),
    client.readContract({ ...exchange, functionName: "oracle" }),
    client.readContract({ ...exchange, functionName: "quoteToken" }),
    client.readContract({ ...exchange, functionName: "feeBps" }),
    client.readContract({ ...exchange, functionName: "maxStockAmount" }),
    client.readContract({ ...oracle, functionName: "isDemo" }),
    client.readContract({ ...oracle, functionName: "quoteToken" }),
    client.readContract({ ...oracle, functionName: "tokenCount" }),
    client.readContract({ ...oracle, functionName: "cycleSeconds" }),
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "decimals", blockNumber }),
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "symbol", blockNumber }),
    client.readContract({
      address: config.quoteToken,
      abi: syntheticTokenAbi,
      functionName: "isSyntheticDemo",
      blockNumber,
    }),
  ]);
  requireState(
    exchangeCode && exchangeCode !== "0x" && same(keccak256(exchangeCode), config.exchangeCodehash),
    "Demo exchange could not be verified.",
  );
  requireState(
    oracleCode && oracleCode !== "0x" && same(keccak256(oracleCode), config.oracleCodehash),
    "Demo pricing could not be verified.",
  );
  requireState(
    quoteCode && quoteCode !== "0x" && same(keccak256(quoteCode), config.quoteTokenCodehash),
    "Demo test-token code could not be verified.",
  );
  requireState(
    same(exchangeOracle, config.oracle) &&
      same(exchangeQuote, config.quoteToken) &&
      same(oracleQuote, config.quoteToken) &&
      isDemo === true &&
      tokenCount === BigInt(assets.length) &&
      cycle === (config.cycleSeconds ?? 240n) &&
      feeBps === (config.feeBps ?? 30n) &&
      maxStockAmount === (config.maxStockAmount ?? LEGACY_MAX_AMOUNT),
    "Demo configuration differs from the reviewed deployment.",
  );
  requireState(
    quoteDecimals === 6 && quoteSymbol === "TestUSDC" && quoteSynthetic === true,
    "Demo asset configuration differs from the reviewed deployment.",
  );
  if (config.model === "accelerated-yield") {
    requireState(typeof config.epoch === "bigint" && config.epoch > 0n, "Synthetic yield model has no reviewed epoch.");
    const epoch = await client.readContract({ ...oracle, functionName: "epoch" });
    requireState(epoch === config.epoch, "Synthetic yield epoch differs from the reviewed deployment.");
  }
  await Promise.all(
    assets.map(async (expected, index) => {
      const [code, supported, maxAmount, oracleAsset, basePrice, decimals, symbol, name, synthetic] = await Promise.all(
        [
          client.getCode({ address: expected.token, blockNumber }),
          client.readContract({ ...exchange, functionName: "supportedStock", args: [expected.token] }),
          client.readContract({ ...exchange, functionName: "maxAssetAmount", args: [expected.token] }),
          client.readContract({ ...oracle, functionName: "demoTokens", args: [BigInt(index)] }),
          client.readContract({ ...oracle, functionName: "basePrice", args: [expected.token] }),
          client.readContract({ address: expected.token, abi: erc20Abi, functionName: "decimals", blockNumber }),
          client.readContract({ address: expected.token, abi: erc20Abi, functionName: "symbol", blockNumber }),
          client.readContract({ address: expected.token, abi: erc20Abi, functionName: "name", blockNumber }),
          client.readContract({
            address: expected.token,
            abi: syntheticTokenAbi,
            functionName: "isSyntheticDemo",
            blockNumber,
          }),
        ],
      );
      requireState(
        code && code !== "0x" && same(keccak256(code), expected.codehash),
        "Demo test-token code could not be verified.",
      );
      requireState(
        supported === true &&
          maxAmount === expected.maxAmount &&
          same(oracleAsset, expected.token) &&
          basePrice === expected.basePriceUsd8,
        "Demo configuration differs from the reviewed deployment.",
      );
      requireState(
        decimals === expected.decimals && symbol === expected.symbol && name === expected.name && synthetic === true,
        "Demo asset configuration differs from the reviewed deployment.",
      );
      if (config.model === "accelerated-yield") {
        requireState(
          typeof expected.demoYieldBpsPerCycle === "bigint" &&
            expected.demoYieldBpsPerCycle >= 0n &&
            typeof expected.downsideBps === "bigint" &&
            expected.downsideBps > 0n &&
            expected.downsideBps < 10_000n,
          "Synthetic yield asset model is invalid.",
        );
        const [yieldBps, downside, scale] = await Promise.all([
          client.readContract({ ...oracle, functionName: "demoYieldBpsPerCycle", args: [expected.token] }),
          client.readContract({ ...oracle, functionName: "downsideBps", args: [expected.token] }),
          client.readContract({ ...exchange, functionName: "assetScale", args: [expected.token] }),
        ]);
        requireState(
          yieldBps === expected.demoYieldBpsPerCycle &&
            downside === expected.downsideBps &&
            scale === 10n ** BigInt(expected.decimals),
          "Synthetic yield model differs from the reviewed deployment.",
        );
      }
    }),
  );
  return { config, asset, assets, snapshot, blockNumber, exchange, feeBps, maxStockAmount };
}

const syntheticTokenAbi = [
  {
    type: "function",
    name: "isSyntheticDemo",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

async function readVenueMarket(client: PublicClient, deployment: DemoDeployment): Promise<DemoMarket> {
  const { config, assets, snapshot, blockNumber, feeBps, maxStockAmount } = await readDemoContext(client, deployment);
  const resultAssets = await Promise.all(
    assets.map(async (asset) => {
      const price = await client.readContract({
        address: config.oracle,
        abi: demoOracleAbi,
        functionName: "getPrice",
        args: [asset.token],
        blockNumber,
      });
      requireState(price > 0n, "Demo scenario price is unavailable.");
      return {
        token: asset.token,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        priceUsd8: price,
        maxAmount: asset.maxAmount,
        exchange: config.exchange,
        feeBps: Number(feeBps),
        demoModel: config.model ?? ("price-cycle" as const),
        ...(config.model === "accelerated-yield"
          ? {
              demoYieldBpsPerCycle: Number(asset.demoYieldBpsPerCycle),
              demoCycleSeconds: Number(config.cycleSeconds ?? 240n),
            }
          : {}),
      };
    }),
  );
  return snapshot.finish({
    chainId: 97,
    exchange: config.exchange,
    ready: true,
    evaluatedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
    feeBps: Number(feeBps),
    maxStockAmount,
    assets: resultAssets,
    quoteToken: { token: config.quoteToken, symbol: "TestUSDC", decimals: 6 },
  });
}

/** Aggregate independently verified venues; token routing is unique and shared quote identity is sealed. */
export async function readDemoMarket(client: PublicClient, deployment?: DemoDeployment): Promise<DemoMarket> {
  const configs = checkedDeployments(deployment);
  const markets = await Promise.all(configs.map((config) => readVenueMarket(client, config)));
  const first = markets[0]!;
  requireState(
    markets.every((market) => same(market.quoteToken.token, first.quoteToken.token)),
    "Demo markets use inconsistent quote assets.",
  );
  return {
    ...first,
    assets: markets.flatMap((market) => market.assets),
    evaluatedAt: Math.min(...markets.map((market) => market.evaluatedAt)),
    validUntil: Math.min(...markets.map((market) => market.validUntil)),
  };
}

export async function readDemoTradeQuote(
  client: PublicClient,
  request: DemoTradeRequest,
  deployment?: DemoDeployment,
): Promise<DemoTradeQuote> {
  requireState(request.side === "buy" || request.side === "sell", "Choose Buy or Sell.");
  requireState(
    validAddress(request.asset) &&
      typeof request.amount === "bigint" &&
      request.amount > 0n &&
      request.amount <= maxUint256,
    "Enter a valid token amount.",
  );
  requireState(request.owner === undefined || validAddress(request.owner), "Wallet address is invalid.");
  const { config, asset, snapshot, blockNumber, exchange } = await readDemoContext(client, deployment, request.asset);
  requireState(request.amount <= asset.maxAmount, "Enter an amount within this demo asset’s trade limit.");
  const buy = request.side === "buy";
  const [quote, oraclePrice] = await Promise.all([
    client.readContract({ ...exchange, functionName: "quote", args: [asset.token, buy, request.amount] }),
    client.readContract({
      address: config.oracle,
      abi: demoOracleAbi,
      functionName: "getPrice",
      args: [asset.token],
      blockNumber,
    }),
  ]);
  const [usdcAmount, feeAmount, priceUsd8] = quote;
  requireState(
    usdcAmount > 0n && feeAmount >= 0n && priceUsd8 > 0n && priceUsd8 === oraclePrice,
    "No executable demo quote is available.",
  );
  const inputToken = buy ? config.quoteToken : asset.token;
  const outputToken = buy ? asset.token : config.quoteToken;
  const inputAmount = buy ? usdcAmount : request.amount;
  const outputAmount = buy ? request.amount : usdcAmount;
  const outputBalance = await client.readContract({
    address: outputToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [config.exchange],
    blockNumber,
  });
  requireState(outputBalance >= outputAmount, "Demo trading inventory is insufficient for this amount.");
  return snapshot.finish({
    ...request,
    asset: asset.token,
    owner: request.owner ? getAddress(request.owner) : undefined,
    chainId: 97,
    exchange: config.exchange,
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    feeAmount,
    priceUsd8,
    quotedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
  });
}

/** Re-quote against a fresh sealed block immediately before every wallet signature. */
export async function assertDemoTrade(
  client: PublicClient,
  owner: Address,
  request: DemoTradeRequest & { limit: bigint; deadline: bigint },
  deployment?: DemoDeployment,
) {
  requireState(validAddress(owner), "Wallet address is invalid.");
  const now = BigInt(Math.floor(Date.now() / 1000));
  requireState(
    typeof request.limit === "bigint" &&
      request.limit > 0n &&
      request.limit <= maxUint256 &&
      typeof request.deadline === "bigint" &&
      request.deadline > now &&
      request.deadline <= now + 300n,
    "This trade quote expired. Review a new quote.",
  );
  const quote = await readDemoTradeQuote(client, { ...request, owner }, deployment);
  requireState(
    request.side === "buy" ? quote.inputAmount <= request.limit : quote.outputAmount >= request.limit,
    "The synthetic price moved beyond your reviewed limit. Get a new quote.",
  );
  const balance = await client.readContract({
    address: quote.inputToken as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  requireState(
    balance >= (request.side === "buy" ? request.limit : request.amount),
    "Your test-token balance is insufficient for this trade.",
  );
  requireState(
    (await client.getBalance({ address: owner })) > 0n,
    "Add BSC Testnet test BNB to pay the transaction fee.",
  );
  return quote;
}
