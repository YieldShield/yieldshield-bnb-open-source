import { describe, expect, it } from "vitest";
import type { DemoMarket, DemoTradeQuote } from "@yieldshield/core";
import { demoMarketIsFresh, demoQuoteMatches, demoTradeLimit, parseTradeAmount } from "@/screens/trade-state";

const now = 1_800_000_000;
const asset = "0x1111111111111111111111111111111111111111";
const quoteToken = "0x2222222222222222222222222222222222222222";
const exchange = "0x3333333333333333333333333333333333333333";
const owner = "0x4444444444444444444444444444444444444444";
const market: DemoMarket = {
  chainId: 97, exchange, ready: true, evaluatedAt: now - 2, validUntil: now + 18,
  feeBps: 30, maxStockAmount: 5n * 10n ** 18n,
  assets: [{ token: asset, symbol: "tWBNB", name: "Test BNB token", decimals: 18, priceUsd8: 600n * 10n ** 8n, maxAmount: 5n * 10n ** 18n }],
  quoteToken: { token: quoteToken, symbol: "TestUSDC", decimals: 6 },
};
const quote: DemoTradeQuote = {
  chainId: 97, exchange, asset, owner, side: "buy", amount: 10n ** 18n,
  inputToken: quoteToken, outputToken: asset, inputAmount: 600_000_001n, outputAmount: 10n ** 18n,
  feeAmount: 1_800_000n, priceUsd8: 600n * 10n ** 8n, quotedAt: now - 2, validUntil: now + 18,
};

describe("BSC test-token trade review", () => {
  it("accepts only a fresh chain-97 market and a quote for the same wallet, asset, and side", () => {
    const request = { asset, owner, side: "buy" as const, amount: 10n ** 18n };
    expect(demoMarketIsFresh(market, now)).toBe(true);
    expect(demoQuoteMatches(quote, market, request, now)).toBe(true);
    expect(demoQuoteMatches({ ...quote, owner: "0x5555555555555555555555555555555555555555" }, market, request, now)).toBe(false);
    expect(demoQuoteMatches({ ...quote, chainId: 56 as 97 }, market, request, now)).toBe(false);
    expect(demoQuoteMatches(quote, market, request, now + 18)).toBe(false);
  });

  it("rounds the chosen payment ceiling up and sale proceeds floor down", () => {
    expect(demoTradeLimit(quote, 500)).toBe(630_000_002n);
    const sale = { ...quote, side: "sell" as const, inputToken: asset, outputToken: quoteToken, inputAmount: 10n ** 18n, outputAmount: 600_000_001n };
    expect(demoTradeLimit(sale, 500)).toBe(570_000_000n);
    expect(() => demoTradeLimit(quote, 2_001)).toThrow();
  });

  it("parses only valid tWBNB quantities", () => {
    expect(parseTradeAmount("0.1", 18).amount).toBe(10n ** 17n);
    expect(parseTradeAmount("0.0000000000000000001", 18).error).toMatch(/18 decimal/);
  });
});
