import { expect, it } from "vitest";
import { createWalletClient, custom } from "viem";
import { bscTestnet } from "../src/chains";
import { createEvmAdapter } from "../src/adapter";

it("uses the official HTTPS endpoint for default reads and adding BSC Testnet to a wallet", async () => {
  const calls: Array<{ method: string; params?: unknown }> = [];
  const wallet = createWalletClient({
    transport: custom({
      request: async (request) => {
        calls.push(request);
        return null;
      },
    }),
  });
  await wallet.addChain({ chain: bscTestnet });
  const adapter = createEvmAdapter({ chain: bscTestnet });
  expect(calls).toMatchObject([
    {
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x61",
          rpcUrls: [adapter.rpcUrl],
          blockExplorerUrls: ["https://testnet.bscscan.com"],
          nativeCurrency: { decimals: 18, name: "BNB", symbol: "tBNB" },
        },
      ],
    },
  ]);
  expect(new URL(adapter.rpcUrl).hostname).toBe("bsc-testnet-dataseed.bnbchain.org");
  expect(new URL(adapter.rpcUrl).port).toBe("");
  expect(bscTestnet.contracts?.multicall3.address).toBe("0xca11bde05977b3631167028862be2a173976ca11");
});
