import catalog from "../../../../config/bnb-yield-assets.json";

/** Display-only reference metadata. Wallet execution uses the reviewed testnet deployment. */
export const YIELD_ASSETS = catalog;
export type YieldAsset = (typeof YIELD_ASSETS)[number];
export function yieldAssetFor(symbol: string) {
  return YIELD_ASSETS.find((asset) => asset.demoSymbol === symbol || asset.referenceSymbol === symbol);
}
export const CATEGORY_LABELS: Record<string, string> = {
  "bnb-staking": "BNB staking",
  "eth-staking": "ETH staking",
  "stable-yield": "Stablecoin yield",
  lending: "Lending receipt",
};
export function assetLogo(symbol: string) {
  if (["tWBNB", "WBNB", "Test BNB token"].includes(symbol)) return "/assets/tokens/wbnb.png";
  if (["TestUSDC", "USDC", "Test USDC"].includes(symbol)) return "/assets/tokens/usdc.png";
  return yieldAssetFor(symbol)?.logo;
}
export function tradePresets(symbol: string): number[] {
  if (symbol === "tvUSDT") return [500, 1000, 5000];
  if (symbol === "tsUSDe") return [100, 500, 1000];
  return [0.1, 0.5, 1];
}
