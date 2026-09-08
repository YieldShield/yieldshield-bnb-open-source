import { parseAbi } from "viem";
import catalog from "../config/bnb-assets.json" with { type: "json" };

export const SOURCE_CHAIN_ID = 56;
export const MAX_BLOCK_AGE_SECONDS = 120;
export const ASSETS = Object.freeze(catalog.map((asset) => Object.freeze({ ...asset })));
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);
const uint80 = (value) => typeof value === "bigint" && value > 0n && value < 2n ** 80n;
const seconds = (now) => {
  const value = Math.floor(now() / 1000);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid observation clock");
  return value;
};
function validateBlock(block, now) {
  if (!block || typeof block.number !== "bigint" || block.number <= 0n ||
      typeof block.timestamp !== "bigint" || block.timestamp <= 0n ||
      !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
      block.timestamp > BigInt(now) || BigInt(now) - block.timestamp > BigInt(MAX_BLOCK_AGE_SECONDS)) {
    throw new Error("Invalid or expired BSC source block");
  }
}
function parseRound(result, decimalsResult, descriptionResult, asset, block) {
  if ([result, decimalsResult, descriptionResult].some((r) => r?.status !== "success")) return null;
  const round = result.result;
  if (!Array.isArray(round) || round.length !== 5 || !uint80(round[0]) ||
      !uint80(round[4]) || round[4] < round[0] || typeof round[1] !== "bigint" ||
      round[1] <= 0n || round[1] >= 2n ** 255n ||
      typeof round[2] !== "bigint" || round[2] <= 0n ||
      typeof round[3] !== "bigint" || round[3] < round[2] || round[3] > block.timestamp ||
      decimalsResult.result !== asset.decimals || descriptionResult.result !== asset.description) return null;
  const priceUsd = Number(round[1]) / 10 ** asset.decimals;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return { priceUsd, priceAnswer: String(round[1]), sourceRoundId: String(round[0]), sourceUpdatedAt: Number(round[3]) };
}

/** Read only. One pinned BSC block, with a ten-block reorg buffer (not a finality assertion).
 * RPC and feed observations are trusted inputs, not an independently verified state proof.
 */
export async function readSourceSnapshot(client, { now = Date.now } = {}) {
  if (await client.getChainId() !== SOURCE_CHAIN_ID) throw new Error("Source RPC must be BSC mainnet (56)");
  const tip = await client.getBlockNumber({ cacheTime: 0 });
  if (typeof tip !== "bigint" || tip <= 10n) throw new Error("Invalid BSC chain tip");
  const requestedBlock = tip - 10n;
  const block = await client.getBlock({ blockNumber: requestedBlock });
  validateBlock(block, seconds(now));
  if (block.number !== requestedBlock) throw new Error("Source RPC returned a different block");
  const contracts = ASSETS.flatMap((asset) => [
    { address: asset.feed, abi: feedAbi, functionName: "latestRoundData" },
    { address: asset.feed, abi: feedAbi, functionName: "decimals" },
    { address: asset.feed, abi: feedAbi, functionName: "description" },
  ]);
  const results = await client.multicall({ contracts, blockNumber: requestedBlock, allowFailure: true });
  if (!Array.isArray(results) || results.length !== contracts.length) throw new Error("Incomplete BSC source observation");
  const readings = ASSETS.map((asset, index) => parseRound(...results.slice(index * 3, index * 3 + 3), asset, block));
  const confirmed = await client.getBlock({ blockNumber: requestedBlock });
  if (confirmed.hash !== block.hash) throw new Error("BSC source block changed during observation");
  validateBlock(block, seconds(now));
  return { block, readings };
}

export function publicSnapshot(snapshot, { now = Date.now } = {}) {
  const evaluatedAt = seconds(now);
  validateBlock(snapshot?.block, evaluatedAt);
  if (!Array.isArray(snapshot.readings) || snapshot.readings.length !== ASSETS.length) throw new Error("Incomplete snapshot");
  const observedAt = Number(snapshot.block.timestamp);
  return {
    chainId: SOURCE_CHAIN_ID,
    blockNumber: String(snapshot.block.number),
    sourceBlockHash: snapshot.block.hash,
    observedAt,
    evaluatedAt,
    validUntil: observedAt + MAX_BLOCK_AGE_SECONDS,
    tokens: ASSETS.map((asset, i) => {
      const reading = snapshot.readings[i];
      const fresh = reading && evaluatedAt - reading.sourceUpdatedAt <= asset.maxPriceAgeSeconds;
      return {
        ...asset,
        priceUsd: reading?.priceUsd ?? null,
        priceAnswer: reading?.priceAnswer ?? null,
        sourceRoundId: reading?.sourceRoundId ?? null,
        sourceUpdatedAt: reading?.sourceUpdatedAt ?? null,
        status: !reading ? "unavailable" : fresh ? "reference-available" : "stale",
      };
    }),
  };
}
