import { expect, it, vi } from "vitest";
import { installedWallets } from "../src/wallet-discovery";
import { friendlyError } from "../src/errors";

it("exposes only installed EIP-1193 wallets without requesting accounts or signatures", async () => {
  const request = vi.fn();
  const installed = { getProvider: vi.fn(async () => ({ request })) };
  const missing = { getProvider: vi.fn(async () => undefined) };
  const failed = {
    getProvider: vi.fn(async () => {
      throw new Error("Provider unavailable");
    }),
  };
  const invalid = { getProvider: vi.fn(async () => ({})) };
  expect(await installedWallets([missing, installed, failed, invalid])).toEqual([installed]);
  expect(request).not.toHaveBeenCalled();
  expect(await installedWallets([])).toEqual([]);
});

it("explains missing wallets, testnet gas and expired trade bounds", () => {
  expect(friendlyError(new Error("Provider not found."))).toContain("No installed wallet");
  expect(friendlyError(new Error("Add BSC Testnet test BNB to pay the transaction fee."))).toContain("test BNB");
  expect(friendlyError(new Error("The synthetic price moved beyond your reviewed limit."))).toContain("fresh quote");
  expect(friendlyError(new Error("insufficient funds"))).not.toContain("ETH");
});
