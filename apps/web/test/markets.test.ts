import { describe, expect, it } from "vitest";
import catalog from "../../../config/bnb-assets.json";
import { calculateScenario, referenceIsFresh, validateMarkets } from "@/lib/markets";
const now = 1_800_000_000;
const snapshot = () => ({
  chainId: 56, blockNumber: "1000", sourceBlockHash: `0x${"a".repeat(64)}`,
  observedAt: now - 5, evaluatedAt: now, validUntil: now + 115,
  tokens: catalog.map((a) => ({ ...a, priceUsd: 100, priceAnswer: "10000000000", sourceRoundId: "2", sourceUpdatedAt: now - 20, status: "reference-available" as const })),
});
describe("BNB reference validation", () => {
  it("accepts only the expected network, complete catalog and original feed identity", () => {
    expect(validateMarkets(snapshot(), now).tokens).toHaveLength(4);
    expect(() => validateMarkets({ ...snapshot(), chainId: 8453 }, now)).toThrow();
    expect(() => validateMarkets({ ...snapshot(), tokens: null }, now)).toThrow();
    expect(() => validateMarkets({ ...snapshot(), tokens: [] }, now)).toThrow();
    const wrong = snapshot(); wrong.tokens[0]!.feed = wrong.tokens[1]!.feed;
    expect(() => validateMarkets(wrong, now)).toThrow();
    const duplicate = snapshot(); duplicate.tokens[1] = duplicate.tokens[0]!;
    expect(() => validateMarkets(duplicate, now)).toThrow();
  });
  it("rejects expired, revived, future and malformed price observations", () => {
    expect(() => validateMarkets(snapshot(), now + 116)).toThrow();
    expect(() => validateMarkets({ ...snapshot(), validUntil: now + 99999 }, now)).toThrow();
    expect(() => validateMarkets({ ...snapshot(), observedAt: now + 50 }, now)).toThrow();
    for (const price of [NaN, Infinity, 0, -1, 123]) {
      const bad = snapshot(); bad.tokens[0]!.priceUsd = price;
      expect(() => validateMarkets(bad, now)).toThrow();
    }
    const bad = snapshot(); bad.tokens[0]!.sourceUpdatedAt = now + 30;
    expect(() => validateMarkets(bad, now)).toThrow();
  });
  it("stops using a price when its own freshness limit expires", () => {
    const token = validateMarkets(snapshot(), now).tokens[0]!;
    expect(referenceIsFresh(token, now)).toBe(true);
    expect(referenceIsFresh(token, now + 281)).toBe(false);
    expect(referenceIsFresh({ ...token, status: "unavailable" }, now)).toBe(false);
  });
});
describe("protection scenarios", () => {
  it("models holding and whole-position collateral exits as alternatives", () => {
    expect(calculateScenario(100, 2, -25, 60)).toEqual({ entry: 200, hold: 150, collateralExit: 120 });
    expect(calculateScenario(100, 2, 50, 150)).toEqual({ entry: 200, hold: 300, collateralExit: 200 });
    expect(calculateScenario(100, 2, -100, 0)).toEqual({ entry: 200, hold: 0, collateralExit: 0 });
  });
  it("rejects out-of-range or non-finite amounts", () => {
    for (const units of [0, -1, 10001, NaN, Infinity]) expect(() => calculateScenario(100, units, -25, 100)).toThrow();
    expect(() => calculateScenario(100, 1, -101, 100)).toThrow();
    expect(() => calculateScenario(100, 1, -25, 151)).toThrow();
  });
});
