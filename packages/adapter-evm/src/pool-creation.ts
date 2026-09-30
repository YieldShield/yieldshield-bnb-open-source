import { maxUint256, zeroAddress, type Address, type PublicClient } from "viem";
import type { CreatePoolIntentParams, PoolCreationOptions, SeedToken } from "@yieldshield/core";
import { splitRiskPoolFactoryAbi as factoryAbi } from "./abis/splitRiskPoolFactory.js";
import { compositeOracleAbi } from "./abis/compositeOracle.js";
import { erc20Abi } from "./abis/erc20.js";
import { readSnapshot } from "./snapshot.js";
import { assertCreationFactory } from "./pool-registry.js";
import { creationDeploymentFor } from "./creation-deployments.js";

const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
export const CREATION_BOUNDS = Object.freeze({
  commissionMinBp: 100,
  commissionMaxBp: 5000,
  poolFeeMinBp: 0,
  poolFeeMaxBp: 2000,
  collateralMinBp: 10000,
  collateralMaxBp: 50000,
});
/** Defaults of the pinned BSC initializer and receipt NFTs, not editable creator terms. */
export const CREATION_FIXED = Object.freeze({
  protocolFeeBp: 100,
  maxTvlUsd: 1_000_000_000_000_000n,
  minimumPoolTime: 60,
  unlockDuration: 120,
  shieldTransferLock: 86400,
  protectorTransferLock: 2419200,
});

export function minimumCreationBond(minimumUsd: bigint, decimals: number, priceUsd8: bigint): bigint {
  if (
    minimumUsd < 0n ||
    minimumUsd > maxUint256 ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    priceUsd8 <= 0n
  )
    throw new Error("Creation bond valuation is unavailable.");
  const amount = (minimumUsd * 10n ** BigInt(decimals) + priceUsd8 - 1n) / priceUsd8;
  if (amount > maxUint256) throw new Error("Creation bond exceeds token limits.");
  return amount;
}

/** Choose from published pairs, never from arbitrary tokens merely added to a whitelist. */
export function creationFactoryForPair(factories: readonly Address[], shielded: string, backing: string): Address {
  const deployments = factories.map((factory) => {
    const d = creationDeploymentFor(factory);
    if (!d) throw new Error("Pool creation factory is not part of the verified deployment.");
    return d;
  });
  const matches = deployments.filter(
    (d) => same(d.demo.quoteToken, backing) && d.demo.assets.some((asset) => same(asset.token, shielded)),
  );
  if (matches.length !== 1) throw new Error("Choose a supported protected asset and TestUSDC backing.");
  return matches[0]!.factory;
}

export async function readPoolCreationOptions(
  client: PublicClient,
  factoryAddress: Address,
): Promise<PoolCreationOptions> {
  const snapshot = await readSnapshot(client, "Pool creation");
  const blockNumber = snapshot.block.number;
  const d = await assertCreationFactory(client, factoryAddress, blockNumber);
  const factory = { address: d.factory, abi: factoryAbi, blockNumber } as const;
  const [paused, pending, bootstrap, active, limit, hardLimit, minimumBondUsd, feeRecipient] = await Promise.all([
    client.readContract({ ...factory, functionName: "paused" }),
    client.readContract({ ...factory, functionName: "pendingGovernanceTimelock" }),
    client.readContract({ ...factory, functionName: "bootstrapModeEnabled" }),
    client.readContract({ ...factory, functionName: "activePoolCount" }),
    client.readContract({ ...factory, functionName: "maxActivePools" }),
    client.readContract({ ...factory, functionName: "MAX_POOLS" }),
    client.readContract({ ...factory, functionName: "minimumCreationBondUsd" }),
    client.readContract({ ...factory, functionName: "defaultProtocolFeeRecipient" }),
  ]);
  const maxActivePools = limit === 0n ? hardLimit : limit;
  if (paused || bootstrap || !same(pending, zeroAddress) || same(feeRecipient, zeroAddress))
    throw new Error("Pool creation is temporarily unavailable.");
  if (hardLimit !== 100n || maxActivePools > hardLimit || maxActivePools <= 0n || active >= maxActivePools)
    throw new Error("The factory's active pool limit has been reached or changed.");
  const assets = [...d.demo.assets, { token: d.demo.quoteToken, symbol: "TestUSDC", decimals: 6 }];
  const tokens = await Promise.all(
    assets.map(async (asset): Promise<SeedToken> => {
      const [info, listed, decimals] = await Promise.all([
        client.readContract({ ...factory, functionName: "tokenInfo", args: [asset.token] }),
        client.readContract({ ...factory, functionName: "isWhitelisted", args: [asset.token] }),
        client.readContract({ address: asset.token, abi: erc20Abi, functionName: "decimals", blockNumber }),
      ]);
      if (
        !listed ||
        !same(info[2], asset.token) ||
        info[1] !== asset.symbol ||
        decimals !== asset.decimals ||
        !same(info[3], d.demo.oracle) ||
        !same(info[4], zeroAddress) ||
        (info[5] !== 0n && (info[5] < 10000n || info[5] > 50000n))
      )
        throw new Error("Pool asset whitelist changed. Refresh before continuing.");
      return {
        token: asset.token,
        name: info[0],
        symbol: info[1],
        decimals,
        minCollateralRatioBp: info[5],
        tranche: info[5] >= 15000n ? "volatile" : "stable",
      };
    }),
  );
  const backing = tokens.find((token) => same(token.token, d.demo.quoteToken))!;
  const price = await client.readContract({
    address: d.compositeOracle,
    abi: compositeOracleAbi,
    functionName: "getPrice",
    args: [d.demo.quoteToken],
    blockNumber,
  });
  return snapshot.finish({
    chainId: 97,
    factory: d.factory,
    protectedAssets: tokens.filter((token) => token !== backing),
    backingAssets: [{ ...backing, minimumBondAmount: minimumCreationBond(minimumBondUsd, backing.decimals, price) }],
    minimumBondUsd,
    bounds: { ...CREATION_BOUNDS },
    fixed: { ...CREATION_FIXED },
    activePools: Number(active),
    maxActivePools: Number(maxActivePools),
    evaluatedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
  });
}

export function validateCreationParams(params: CreatePoolIntentParams, options: PoolCreationOptions) {
  const shielded = options.protectedAssets.find((token) => same(token.token, params.shieldedToken));
  const backing = options.backingAssets.find((token) => same(token.token, params.backingToken));
  if (!shielded || !backing || same(params.shieldedToken, params.backingToken))
    throw new Error("Choose a supported protected asset and backing asset.");
  const b = options.bounds;
  for (const [value, min, max, label] of [
    [params.commissionRateBp, b.commissionMinBp, b.commissionMaxBp, "Backer gain share"],
    [params.poolFeeBp, b.poolFeeMinBp, b.poolFeeMaxBp, "Creator gain fee"],
    [
      params.collateralRatioBp,
      Math.max(b.collateralMinBp, Number(backing.minCollateralRatioBp)),
      b.collateralMaxBp,
      "Collateral ratio",
    ],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`${label} is outside the allowed range.`);
  }
  for (const key of Object.keys(options.fixed) as Array<keyof typeof options.fixed>)
    if (params[key] !== options.fixed[key])
      throw new Error(`${key} is a protocol setting and cannot be changed by a pool creator.`);
  if (params.commissionRateBp + params.poolFeeBp + params.protocolFeeBp >= 10000)
    throw new Error("Combined gain fees must leave a share for protected holders.");
  const bond = params.creationBondAmount ?? 0n;
  if (bond < 0n || bond > maxUint256) throw new Error("Invalid creation bond amount.");
  if (bond < backing.minimumBondAmount) throw new Error("The creation bond is below the current minimum.");
  return { shielded, backing };
}
