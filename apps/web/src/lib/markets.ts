import catalog from "../../../../config/bnb-assets.json";

export type TokenReference = (typeof catalog)[number] & {
  priceUsd: number | null;
  priceAnswer: string | null;
  sourceRoundId: string | null;
  sourceUpdatedAt: number | null;
  status: "reference-available" | "stale" | "unavailable";
};
export type MarketSnapshot = {
  chainId: number;
  blockNumber: string;
  sourceBlockHash: string;
  observedAt: number;
  evaluatedAt: number;
  validUntil: number;
  tokens: TokenReference[];
};
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
export function validateMarkets(input: unknown, now = Date.now() / 1000): MarketSnapshot {
  const data = input as MarketSnapshot | null;
  if (
    !data ||
    data.chainId !== 56 ||
    !integer(data.observedAt) ||
    !integer(data.evaluatedAt) ||
    !integer(data.validUntil) ||
    data.validUntil !== data.observedAt + 120 ||
    data.observedAt > now + 15 ||
    data.evaluatedAt < data.observedAt ||
    data.evaluatedAt > now + 15 ||
    data.validUntil < now ||
    typeof data.blockNumber !== "string" ||
    !/^[1-9]\d*$/.test(data.blockNumber) ||
    typeof data.sourceBlockHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(data.sourceBlockHash) ||
    !Array.isArray(data.tokens) ||
    data.tokens.length !== catalog.length
  ) {
    throw new Error("The BNB Chain observation could not be verified.");
  }
  data.tokens.forEach((token, i) => {
    const expected = catalog[i]!;
    if (
      !token ||
      Object.keys(expected).some(
        (key) => token[key as keyof TokenReference] !== expected[key as keyof typeof expected],
      ) ||
      !["reference-available", "stale", "unavailable"].includes(token.status)
    ) {
      throw new Error("A token does not match the BNB Chain source registry.");
    }
    if (token.status === "unavailable") {
      if ([token.priceUsd, token.priceAnswer, token.sourceRoundId, token.sourceUpdatedAt].some((v) => v !== null)) {
        throw new Error("An unavailable source contained an unverified price.");
      }
    } else if (
      typeof token.priceUsd !== "number" ||
      !Number.isFinite(token.priceUsd) ||
      token.priceUsd <= 0 ||
      typeof token.priceAnswer !== "string" ||
      !/^[1-9]\d*$/.test(token.priceAnswer) ||
      Number(token.priceAnswer) / 10 ** token.decimals !== token.priceUsd ||
      !integer(token.sourceUpdatedAt) ||
      token.sourceUpdatedAt > data.observedAt ||
      typeof token.sourceRoundId !== "string" ||
      !/^[1-9]\d*$/.test(token.sourceRoundId)
    ) {
      throw new Error("A token price could not be verified.");
    }
  });
  return data;
}
export function referenceIsFresh(token: TokenReference, now: number) {
  return (
    token.status === "reference-available" &&
    token.sourceUpdatedAt !== null &&
    token.sourceUpdatedAt <= now + 15 &&
    now - token.sourceUpdatedAt <= token.maxPriceAgeSeconds
  );
}
export async function fetchMarkets(): Promise<MarketSnapshot> {
  const response = await fetch("/api/markets", { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Live prices are temporarily unavailable. Please try again.");
  return validateMarkets(await response.json());
}
export function calculateScenario(price: number, units: number, change: number, collateral: number) {
  if (
    ![price, units, change, collateral].every(Number.isFinite) ||
    price <= 0 ||
    units <= 0 ||
    units > 10000 ||
    change < -100 ||
    change > 50 ||
    collateral < 0 ||
    collateral > 150
  )
    throw new Error("Invalid scenario inputs");
  const entry = price * units;
  return { entry, hold: entry * (1 + change / 100), collateralExit: Math.min(entry, (entry * collateral) / 100) };
}
