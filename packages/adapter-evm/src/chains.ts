import { base, baseSepolia, bsc, bscTestnet as viemBscTestnet } from "viem/chains";
export { base, baseSepolia, bsc };
import { defineChain, type Chain, type ChainContract } from "viem";

// viem >= 2.57.10 infers a ChainTransactionReplacement type it doesn't export, so declaration
// emit can't name the inferred chain types (TS2883). Annotate with exported types instead.
type DefinedChain<id extends number> = Chain & { id: id; contracts: { multicall3: ChainContract } };

// Current official BSC RPC list: https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/
// Share this endpoint between application reads and wallet network-registration metadata.
export const bscTestnet: DefinedChain<97> = defineChain({
  ...viemBscTestnet,
  rpcUrls: {
    ...viemBscTestnet.rpcUrls,
    default: { ...viemBscTestnet.rpcUrls.default, http: ["https://bsc-testnet-dataseed.bnbchain.org"] },
  },
});

// Canonical Multicall3 — verified deployed on Robinhood testnet (eth_getCode returns bytecode).
const multicall3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } as const;

/** Robinhood Chain mainnet (L2). */
export const robinhood: DefinedChain<4663> = defineChain({
  id: 4663,
  contracts: { multicall3 },
  name: "Robinhood Chain",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
      webSocket: ["wss://feed.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api/",
    },
  },
  testnet: false,
});

/** Robinhood Chain testnet — the seeded YieldShield deployment lives here (see deployments.ts). */
export const robinhoodTestnet: DefinedChain<46630> = defineChain({
  id: 46630,
  contracts: { multicall3 },
  name: "Robinhood Chain Testnet",
  nativeCurrency: { decimals: 18, name: "Sepolia Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
      webSocket: ["wss://feed.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api/",
    },
  },
  testnet: true,
});

export const evmChains: {
  readonly base: typeof base;
  readonly baseSepolia: typeof baseSepolia;
  readonly bsc: typeof bsc;
  readonly bscTestnet: typeof bscTestnet;
  readonly robinhood: typeof robinhood;
  readonly robinhoodTestnet: typeof robinhoodTestnet;
} = { base, baseSepolia, bsc, bscTestnet, robinhood, robinhoodTestnet };
export type EvmChainName = keyof typeof evmChains;
