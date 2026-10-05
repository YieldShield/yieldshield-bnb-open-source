import { expect, it } from "vitest";
import { parseTokenAmount } from "@/lib/token-amount";

it.each(["1e3", "-1", "+1", "1,5", "1,000", "1.2.3", "Infinity", "NaN"])(
  "rejects ambiguous amount %s without producing a transaction amount",
  (value) => {
    expect(parseTokenAmount(value, 18).amount).toBe(0n);
    expect(parseTokenAmount(value, 18).error).toContain("decimal point");
  },
);

it("preserves exact token precision, accepts leading decimal points and bounds uint256 inputs", () => {
  expect(parseTokenAmount(".5", 18)).toEqual({ amount: 500_000_000_000_000_000n, error: null });
  expect(parseTokenAmount("10.12345678", 8)).toEqual({ amount: 1_012_345_678n, error: null });
  expect(parseTokenAmount("1.000000001", 8).error).toContain("8 decimal places");
  expect(parseTokenAmount("9".repeat(78), 18).amount).toBe(0n);
  expect(parseTokenAmount("9".repeat(101), 18).error).toContain("too large");
  expect(parseTokenAmount("", 18)).toEqual({ amount: 0n, error: null });
  expect(parseTokenAmount("0", 18).error).toContain("greater than zero");
});
