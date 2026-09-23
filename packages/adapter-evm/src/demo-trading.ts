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
import { DEMO_DEPLOYMENTS, type DemoDeployment } from "./demo-deployments.js";
import { demoExchangeAbi, demoOracleAbi } from "./abis/demoExchange.js";
import { readSnapshot } from "./snapshot.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function requireState(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const validAddress = (value: string) => isAddress(value) && !same(value, zeroAddress);
const MAX_AMOUNT = 25n * 10n ** 18n;
const BASE_PRICE = 600n * 10n ** 8n;

/** Only one independently reviewed BSC Testnet token pair can be executed. */
export async function readDemoContext(client: PublicClient, deployment?: DemoDeployment) {
  requireState((await client.getChainId()) === 97, "Demo trading requires BSC Testnet.");
  const config = deployment ?? DEMO_DEPLOYMENTS[97];
  requireState(config?.chainId === 97, "Demo trading is being prepared.");
  requireState(
    config.assets.length === 1 &&
      [config.exchange, config.oracle, config.quoteToken, config.assets[0]!.token].every(validAddress) &&
      new Set([config.exchange, config.oracle, config.quoteToken, config.assets[0]!.token].map((a) => a.toLowerCase()))
        .size === 4 &&
      config.assets[0]!.symbol === "tWBNB" &&
      config.assets[0]!.decimals === 18,
    "Demo deployment is invalid.",
  );
  const snapshot = await readSnapshot(client, "Demo trading");
  const blockNumber = snapshot.block.number;
  const asset = config.assets[0]!;
  const exchange = { address: config.exchange, abi: demoExchangeAbi, blockNumber } as const;
  const oracle = { address: config.oracle, abi: demoOracleAbi, blockNumber } as const;
  const [
    exchangeCode,
    oracleCode,
    quoteCode,
    assetCode,
    exchangeOracle,
    exchangeQuote,
    feeBps,
    maxStockAmount,
    supported,
    maxAssetAmount,
    isDemo,
    oracleQuote,
    tokenCount,
    oracleAsset,
    cycle,
    basePrice,
    quoteDecimals,
    quoteSymbol,
    quoteSynthetic,
    assetDecimals,
    assetSymbol,
    assetName,
    assetSynthetic,
  ] = await Promise.all([
    client.getCode({ address: config.exchange, blockNumber }),
    client.getCode({ address: config.oracle, blockNumber }),
    client.getCode({ address: config.quoteToken, blockNumber }),
    client.getCode({ address: asset.token, blockNumber }),
    client.readContract({ ...exchange, functionName: "oracle" }),
    client.readContract({ ...exchange, functionName: "quoteToken" }),
    client.readContract({ ...exchange, functionName: "feeBps" }),
    client.readContract({ ...exchange, functionName: "maxStockAmount" }),
    client.readContract({ ...exchange, functionName: "supportedStock", args: [asset.token] }),
    client.readContract({ ...exchange, functionName: "maxAssetAmount", args: [asset.token] }),
    client.readContract({ ...oracle, functionName: "isDemo" }),
    client.readContract({ ...oracle, functionName: "quoteToken" }),
    client.readContract({ ...oracle, functionName: "tokenCount" }),
    client.readContract({ ...oracle, functionName: "demoTokens", args: [0n] }),
    client.readContract({ ...oracle, functionName: "cycleSeconds" }),
    client.readContract({ ...oracle, functionName: "basePrice", args: [asset.token] }),
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "decimals", blockNumber }),
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "symbol", blockNumber }),
    client.readContract({
      address: config.quoteToken,
      abi: syntheticTokenAbi,
      functionName: "isSyntheticDemo",
      blockNumber,
    }),
    client.readContract({ address: asset.token, abi: erc20Abi, functionName: "decimals", blockNumber }),
    client.readContract({ address: asset.token, abi: erc20Abi, functionName: "symbol", blockNumber }),
    client.readContract({ address: asset.token, abi: erc20Abi, functionName: "name", blockNumber }),
    client.readContract({ address: asset.token, abi: syntheticTokenAbi, functionName: "isSyntheticDemo", blockNumber }),
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
    quoteCode &&
      quoteCode !== "0x" &&
      same(keccak256(quoteCode), config.quoteTokenCodehash) &&
      assetCode &&
      assetCode !== "0x" &&
      same(keccak256(assetCode), asset.codehash),
    "Demo test-token code could not be verified.",
  );
  requireState(
    same(exchangeOracle, config.oracle) &&
      same(exchangeQuote, config.quoteToken) &&
      same(oracleQuote, config.quoteToken) &&
      isDemo === true &&
      tokenCount === 1n &&
      same(oracleAsset, asset.token) &&
      cycle === 240n &&
      basePrice === BASE_PRICE &&
      feeBps === 30n &&
      maxStockAmount === MAX_AMOUNT &&
      maxAssetAmount === MAX_AMOUNT &&
      supported === true,
    "Demo configuration differs from the reviewed deployment.",
  );
  requireState(
    quoteDecimals === 6 &&
      quoteSymbol === "TestUSDC" &&
      quoteSynthetic === true &&
      assetDecimals === 18 &&
      assetSymbol === asset.symbol &&
      assetName === asset.name &&
      assetSynthetic === true,
    "Demo asset configuration differs from the reviewed deployment.",
  );
  return { config, asset, snapshot, blockNumber, exchange, feeBps, maxStockAmount };
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

export async function readDemoMarket(client: PublicClient, deployment?: DemoDeployment): Promise<DemoMarket> {
  const { config, asset, snapshot, blockNumber, feeBps, maxStockAmount } = await readDemoContext(client, deployment);
  const price = await client.readContract({
    address: config.oracle,
    abi: demoOracleAbi,
    functionName: "getPrice",
    args: [asset.token],
    blockNumber,
  });
  requireState(price > 0n, "Demo scenario price is unavailable.");
  return snapshot.finish({
    chainId: 97,
    exchange: config.exchange,
    ready: true,
    evaluatedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
    feeBps: Number(feeBps),
    maxStockAmount,
    assets: [
      {
        token: asset.token,
        symbol: asset.symbol,
        name: asset.name,
        decimals: 18,
        priceUsd8: price,
        maxAmount: MAX_AMOUNT,
      },
    ],
    quoteToken: { token: config.quoteToken, symbol: "TestUSDC", decimals: 6 },
  });
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
  const { config, asset, snapshot, blockNumber, exchange } = await readDemoContext(client, deployment);
  requireState(
    same(request.asset, asset.token) && request.amount <= MAX_AMOUNT,
    "Choose tWBNB and an amount up to 25 tokens.",
  );
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
