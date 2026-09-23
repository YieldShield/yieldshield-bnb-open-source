import { toBaseUnits } from "@yieldshield/core";
import type { DemoMarket, DemoTradeQuote, DemoTradeRequest } from "@yieldshield/core";

export function parseTradeAmount(value: string, decimals: number): { amount: bigint; error: string | null } {
  if (!value.trim()) return { amount: 0n, error: null };
  if (!/^\d+(?:\.\d*)?$/.test(value.trim()))
    return { amount: 0n, error: "Use a decimal point, without commas, signs or other symbols." };
  if ((value.trim().split(".")[1]?.length ?? 0) > decimals)
    return { amount: 0n, error: `Use no more than ${decimals} decimal places.` };
  try {
    const amount = toBaseUnits(value.trim(), decimals);
    return { amount, error: amount > 0n ? null : "Enter an amount greater than zero." };
  } catch {
    return { amount: 0n, error: "This amount is too large." };
  }
}

const same = (a: string | undefined, b: string | undefined) => a?.toLowerCase() === b?.toLowerCase();
export function demoMarketIsFresh(market: DemoMarket | undefined, now: number): market is DemoMarket {
  return (
    !!market &&
    market.chainId === 97 &&
    market.ready &&
    Number.isSafeInteger(market.evaluatedAt) &&
    Number.isSafeInteger(market.validUntil) &&
    market.evaluatedAt > 0 &&
    market.validUntil > market.evaluatedAt &&
    market.evaluatedAt <= now + 5 &&
    now < market.validUntil &&
    market.validUntil <= market.evaluatedAt + 120
  );
}

/** A cached quote must never become a quote for another wallet, token or direction. */
export function demoQuoteMatches(
  quote: DemoTradeQuote | undefined,
  market: DemoMarket | undefined,
  request: DemoTradeRequest,
  now: number,
): quote is DemoTradeQuote {
  if (!quote || !demoMarketIsFresh(market, now)) return false;
  const asset = market.assets.find((entry) => same(entry.token, request.asset));
  if (!asset || request.amount <= 0n || request.amount > (asset.maxAmount ?? market.maxStockAmount)) return false;
  return (
    quote.chainId === 97 &&
    same(quote.exchange, market.exchange) &&
    same(quote.asset, request.asset) &&
    same(quote.owner, request.owner) &&
    quote.side === request.side &&
    quote.amount === request.amount &&
    same(quote.inputToken, request.side === "buy" ? market.quoteToken.token : asset.token) &&
    same(quote.outputToken, request.side === "buy" ? asset.token : market.quoteToken.token) &&
    quote.inputAmount > 0n &&
    quote.outputAmount > 0n &&
    quote.feeAmount >= 0n &&
    quote.priceUsd8 > 0n &&
    (request.side === "buy" ? quote.outputAmount === request.amount : quote.inputAmount === request.amount) &&
    Number.isSafeInteger(quote.quotedAt) &&
    Number.isSafeInteger(quote.validUntil) &&
    quote.quotedAt > 0 &&
    quote.validUntil > quote.quotedAt &&
    quote.quotedAt <= now + 5 &&
    now < quote.validUntil &&
    quote.validUntil <= quote.quotedAt + 120
  );
}

/** The exact wallet limit chosen on screen: round maximum spend up and minimum proceeds down. */
export function demoTradeLimit(quote: DemoTradeQuote, toleranceBps: number): bigint {
  if (!Number.isInteger(toleranceBps) || toleranceBps < 1 || toleranceBps > 2_000)
    throw new Error("Choose a price tolerance between 0.01% and 20%.");
  return quote.side === "buy"
    ? (quote.inputAmount * BigInt(10_000 + toleranceBps) + 9_999n) / 10_000n
    : (quote.outputAmount * BigInt(10_000 - toleranceBps)) / 10_000n;
}

/** Review freshness ends sooner than the approved transaction deadline. */
export function demoTradeDeadline(quote: DemoTradeQuote): bigint {
  return BigInt(Math.min(quote.quotedAt + 180, quote.validUntil + 120));
}
