import { parseAbi } from "viem";

/** BSC Testnet valueless-token venue. The `stock` ABI name is retained for Base compatibility. */
export const demoExchangeAbi = parseAbi([
  "function quote(address stock, bool buy, uint256 stockAmount) view returns (uint256 usdcAmount, uint256 feeAmount, uint256 price)",
  "function swap(address stock, bool buy, uint256 stockAmount, uint256 usdcLimit, uint256 deadline) returns (uint256 usdcAmount)",
  "function oracle() view returns (address)",
  "function quoteToken() view returns (address)",
  "function feeBps() view returns (uint256)",
  "function maxAssetAmount(address) view returns (uint256)",
  "function maxStockAmount() view returns (uint256)",
  "function supportedStock(address) view returns (bool)",
  "event Swapped(address indexed trader, address indexed stock, bool buy, uint256 stockAmount, uint256 usdcAmount, uint256 feeAmount)",
]);

export const demoOracleAbi = parseAbi([
  "function getPrice(address token) view returns (uint256)",
  "function isDemo() view returns (bool)",
  "function quoteToken() view returns (address)",
  "function tokenCount() view returns (uint256)",
  "function demoTokens(uint256) view returns (address)",
  "function cycleSeconds() view returns (uint64)",
  "function basePrice(address token) view returns (uint256)",
]);
