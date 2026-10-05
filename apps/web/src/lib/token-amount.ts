import { toBaseUnits } from "@yieldshield/core";

/** Reject ambiguous input instead of silently changing the quantity being reviewed. */
export function parseTokenAmount(value: string, decimals: number): { amount: bigint; error: string | null } {
  const text = value.trim();
  if (!text) return { amount: 0n, error: null };
  if (text.length > 100) return { amount: 0n, error: "This amount is too large." };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
    return { amount: 0n, error: "Use a decimal point, without commas, signs or other symbols." };
  if ((text.split(".")[1]?.length ?? 0) > decimals)
    return { amount: 0n, error: `Use no more than ${decimals} decimal places.` };
  try {
    const amount = toBaseUnits(text, decimals);
    if (amount > (1n << 256n) - 1n) return { amount: 0n, error: "This amount is too large." };
    return { amount, error: amount > 0n ? null : "Enter an amount greater than zero." };
  } catch {
    return { amount: 0n, error: "This amount is too large." };
  }
}
