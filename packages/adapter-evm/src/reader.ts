/**
 * ChainReader implementation over the SplitRiskPool EVM contracts: viem multicall reads mapped to
 * the chain-neutral view models in @yieldshield/core. This is the only place where 0x addresses
 * meet the port's plain-string ids.
 *
 * Read strategy (indexer-less v1): pool discovery via the factory, position discovery by
 * enumerating receipt-NFT ids (capped), activity via event logs. Fine at current scale; swap in
 * an indexer behind this same interface if history needs outgrow RPC.
 */
import { zeroAddress, type AbiEvent, type Address, type PublicClient } from "viem";
import type {
  AccountId,
  ActivityEntry,
  ActivityKind,
  ChainReader,
  FeedHealth,
  OwnerPositions,
  PoolData,
  PoolOracleHealth,
  ProtectorPositionView,
  SeedToken,
  ShieldPositionView,
  TokenBalance,
  TokenId,
  TokenInfo,
} from "@yieldshield/core";
import { compositeOracleAbi } from "./abis/compositeOracle.js";
import { erc20Abi } from "./abis/erc20.js";
import { protectorReceiptNftAbi } from "./abis/protectorReceiptNft.js";
import { shieldReceiptNftAbi } from "./abis/shieldReceiptNft.js";
import { splitRiskPoolAbi } from "./abis/splitRiskPool.js";
import { splitRiskPoolFactoryAbi } from "./abis/splitRiskPoolFactory.js";
import { decodePositionId, encodePositionId } from "./positionId.js";

const BPS = 10_000n;
const ratioBps = (num: bigint, den: bigint): bigint | null => (den > 0n ? (num * BPS) / den : null);
const clampBps = (b: bigint): bigint => (b > BPS ? BPS : b);

/** Safety cap on receipt-NFT enumeration per pool side (testnet-scale discovery). */
const MAX_TOKEN_IDS = 2_000n;
/** Activity entries returned (newest first). */
const ACTIVITY_LIMIT = 25;
const MAX_POOLS = 1_000n;
const PROTECTOR_UNLOCK_WINDOW = 7n * 24n * 60n * 60n;
const ACTIVITY_BLOCK_RANGE = 2_000n;
const requireRead = <T>(r: Result<unknown> | undefined): T => {
  if (!r || r.status !== "success") throw new Error("On-chain data unavailable. Please refresh before continuing.");
  return r.result as T;
};
// A burned receipt is the only expected failure during ownerOf enumeration. RPC failures
// must never be counted as burned NFTs or silently hide an owner's positions.
function receiptOwner(r: Result<unknown> | undefined): Address | null {
  if (r?.status === "success") return r.result as Address;
  let error: unknown = r && r.status === "failure" ? r.error : undefined;
  const visited = new Set<unknown>();
  while (error && typeof error === "object" && !visited.has(error)) {
    visited.add(error);
    const cause = error as { data?: { errorName?: string }; cause?: unknown };
    if (cause.data?.errorName === "ERC721NonexistentToken") return null;
    error = cause.cause;
  }
  throw new Error("Position discovery data unavailable. Please refresh before continuing.");
}
const ceilDiv = (num: bigint, den: bigint): bigint => (num + den - 1n) / den;
/** Same two-stage ceil rounding and high-water mark used by SplitRiskPool fee settlement. */
export function netShieldAmount(
  amount: bigint,
  valueAtDeposit: bigint,
  feeBaseline: bigint,
  price: bigint,
  decimals: number,
  rates: readonly bigint[],
): bigint {
  if (price <= 0n) throw new Error("Current price feed unavailable for withdrawal quote.");
  const scale = 10n ** BigInt(decimals);
  const current = (amount * price) / scale;
  const baseline = feeBaseline === 0n ? valueAtDeposit : feeBaseline;
  const gain = current > baseline ? current - baseline : 0n;
  const fees = rates.reduce((total, rate) => total + ceilDiv(ceilDiv(gain * rate, BPS) * scale, price), 0n);
  return fees >= amount ? 0n : amount - fees;
}
const closedSessionPriceAbi = [
  {
    type: "function",
    name: "getPriceForClosedSessionExit",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export type EvmReaderDeps = {
  factory: Address;
  compositeOracle: Address;
  /** Deployment block bounds indexed activity reads on public RPC providers. */
  deploymentBlock?: bigint;
};

type Result<T> = { status: "success"; result: T } | { status: "failure"; error: Error };
const ok = <T>(r: Result<unknown> | undefined): T | null => (r && r.status === "success" ? (r.result as T) : null);

/** Untyped multicall call descriptor — results are read back through explicit `ok<T>()` casts.
 * (Letting viem infer types across hundreds of heterogeneous calls against these large ABIs
 * blows TypeScript's instantiation limit, so inference is deliberately opted out of here.) */
type RawCall = { address: Address; abi: unknown; functionName: string; args?: readonly unknown[] };

async function rawMulticall(
  client: PublicClient,
  contracts: RawCall[],
  blockNumber?: bigint,
): Promise<Result<unknown>[]> {
  if (contracts.length === 0) return [];
  const res = await client.multicall({ contracts: contracts as never, allowFailure: true, blockNumber });
  return res as Result<unknown>[];
}

/** User-facing pool events → activity kinds. Event defs are pulled from the vendored ABI so
 * signatures can never drift from the deployed contracts. */
const ACTIVITY_EVENT_KINDS: Record<string, ActivityKind> = {
  ShieldedAssetDeposited: "deposit",
  ProtectorAssetDeposited: "backing",
  ShieldedWithdrawal: "withdraw",
  PartialWithdrawal: "withdraw",
  ProtectorAssetWithdrawn: "withdraw",
  ShieldActivated: "activate",
  RewardsClaimed: "collect",
  CommissionClaimed: "collect",
  UnlockProcessStarted: "notice",
  UnlockProcessCancelled: "notice",
};

const ACTIVITY_EVENTS = splitRiskPoolAbi.filter(
  (e) => e.type === "event" && e.name in ACTIVITY_EVENT_KINDS,
) as unknown as AbiEvent[];

export function createReader(client: PublicClient, deps: EvmReaderDeps): ChainReader {
  const factory = { address: deps.factory, abi: splitRiskPoolFactoryAbi } as const;
  const poolC = (address: Address) => ({ address, abi: splitRiskPoolAbi }) as const;

  async function allPools(blockNumber: bigint): Promise<Address[]> {
    const count = await client.readContract({ ...factory, functionName: "poolCount", blockNumber });
    if (count > MAX_POOLS) throw new Error("Pool discovery limit reached. An indexer is required for a complete view.");
    if (count === 0n) return [];
    return (await client.readContract({
      ...factory,
      functionName: "getPools",
      args: [0n, count],
      blockNumber,
    })) as Address[];
  }

  /** Feed health for one token from the composite oracle's staleness/backup/challenge probes. */
  function classifyFeed(
    token: Address,
    stale: Result<readonly [boolean, bigint]> | undefined,
    backup: Result<boolean> | undefined,
    dual: Result<readonly [boolean, Address, Address, boolean, boolean, bigint]> | undefined,
    challenge: Result<boolean> | undefined,
    price: Result<bigint> | undefined,
  ): FeedHealth {
    const staleRes = ok<readonly [boolean, bigint]>(stale);
    const isStale = staleRes ? staleRes[0] : false;
    const probeFailed =
      staleRes === null ||
      ok<boolean>(backup) === null ||
      ok(dual) === null ||
      ok(challenge) === null ||
      (ok<bigint>(price) ?? 0n) <= 0n;
    const backupActive = ok<boolean>(backup) ?? false;
    const dualRes = ok<readonly [boolean, Address, Address, boolean, boolean, bigint]>(dual);
    const challenged = (dualRes ? dualRes[4] : false) || ok<boolean>(challenge) === true;

    let status: FeedHealth["status"] = "healthy";
    let reason: string | null = null;
    if (challenged) {
      status = "paused";
      reason = "price under verification";
    } else if (probeFailed) {
      // Any unavailable protected-price or safety probe is an unavailable market.
      status = "paused";
      reason = "price feed unavailable";
    } else if (isStale) {
      status = "paused";
      reason = "price is stale";
    } else if (backupActive) {
      status = "degraded";
      reason = "serving backup feed";
    }
    return { token, status, reason, challenged, backupActive, stale: isStale || probeFailed };
  }

  return {
    async loadPools(): Promise<PoolData[]> {
      const blockNumber = await client.getBlockNumber();
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return [];
      const infos = await Promise.all(
        pools.map((address) =>
          client.readContract({ ...factory, functionName: "getPoolInfo", args: [address], blockNumber }),
        ),
      );
      const poolConfigs = await rawMulticall(
        client,
        pools.map((p) => ({ ...poolC(p), functionName: "poolConfig" })),
        blockNumber,
      );
      // Keep addresses, metadata and balances pinned to one chain snapshot.
      const perPool = await rawMulticall(
        client,
        pools.flatMap((p, i) => {
          const info = infos[i]!;
          const config = requireRead<
            readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]
          >(poolConfigs[i]);
          const poolOracle = { address: config[9], abi: compositeOracleAbi };
          return [
            { ...poolC(p), functionName: "poolConfig" },
            { ...poolC(p), functionName: "paused" },
            { ...poolC(p), functionName: "totalProtectorTokens" },
            { ...poolC(p), functionName: "totalShieldCollateralAmount" },
            { ...poolC(p), functionName: "totalValueAtDeposit" },
            { ...poolC(p), functionName: "shieldedTokenDecimals" },
            { ...poolC(p), functionName: "backingTokenDecimals" },
            { ...poolC(p), functionName: "accessControl" },
            { ...poolC(p), functionName: "protectorReceiptNFT" },
            { ...factory, functionName: "tokenInfo", args: [info.shieldedToken] },
            { ...factory, functionName: "tokenInfo", args: [info.backingToken] },
            { ...poolOracle, functionName: "isPriceStale", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isBackupActiveForToken", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "getTokenDualFeedStatus", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isPriceStale", args: [info.backingToken] },
            { ...poolOracle, functionName: "isBackupActiveForToken", args: [info.backingToken] },
            { ...poolOracle, functionName: "getTokenDualFeedStatus", args: [info.backingToken] },
            { ...factory, functionName: "isPoolActive", args: [p] },
            { ...poolOracle, functionName: "isTokenChallengeable", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isTokenChallengeable", args: [info.backingToken] },
            { ...poolOracle, functionName: "getPrice", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "getPrice", args: [info.backingToken] },
          ];
        }),
        blockNumber,
      );
      const PER = 22;

      const nftAddrs = pools.map((_, i) => requireRead<Address>(perPool[i * PER + 8]));
      const nexts = await rawMulticall(
        client,
        nftAddrs.map((address) => ({ address, abi: protectorReceiptNftAbi, functionName: "nextTokenId" })),
        blockNumber,
      );
      const countCalls = nftAddrs.flatMap((address, i) => {
        const next = requireRead<bigint>(nexts[i]);
        if (next > MAX_TOKEN_IDS)
          throw new Error("Position discovery limit reached. An indexer is required for accurate counts.");
        return Array.from({ length: Number(next) }, (_, tokenId) => ({
          pool: i,
          contract: { address, abi: protectorReceiptNftAbi, functionName: "ownerOf", args: [BigInt(tokenId)] },
        }));
      });
      const countOwners = await rawMulticall(
        client,
        countCalls.map((c) => c.contract),
        blockNumber,
      );
      const counts = pools.map(() => 0n);
      countCalls.forEach((call, i) => {
        if (receiptOwner(countOwners[i])) counts[call.pool] = counts[call.pool]! + 1n;
      });

      return pools.map((p, i): PoolData => {
        const info = infos[i]!;
        const at = (j: number) => perPool[i * PER + j];
        const config = requireRead<
          readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]
        >(at(0) as Result<never>);
        const paused = requireRead<boolean>(at(1));
        const active = requireRead<boolean>(at(17));
        const totalProtectorTokens = requireRead<bigint>(at(2));
        const totalShieldCollateral = requireRead<bigint>(at(3));
        const totalValueAtDeposit = requireRead<bigint>(at(4));
        const shieldedDecimals = requireRead<number>(at(5));
        const backingDecimals = requireRead<number>(at(6));
        const accessControl = requireRead<Address>(at(7));
        const shInfo = ok<readonly [string, string, Address, Address, Address, bigint]>(at(9) as Result<never>);
        const bkInfo = ok<readonly [string, string, Address, Address, Address, bigint]>(at(10) as Result<never>);

        const shielded: TokenInfo = {
          token: info.shieldedToken,
          symbol: info.shieldedTokenSymbol,
          name: shInfo?.[0] ?? info.shieldedTokenSymbol,
          decimals: shieldedDecimals,
        };
        const backing: TokenInfo = {
          token: info.backingToken,
          symbol: info.backingTokenSymbol,
          name: bkInfo?.[0] ?? info.backingTokenSymbol,
          decimals: backingDecimals,
        };

        const feeds = [
          classifyFeed(
            info.shieldedToken,
            at(11) as Result<never>,
            at(12) as Result<never>,
            at(13) as Result<never>,
            at(18) as Result<never>,
            at(20) as Result<never>,
          ),
          classifyFeed(
            info.backingToken,
            at(14) as Result<never>,
            at(15) as Result<never>,
            at(16) as Result<never>,
            at(19) as Result<never>,
            at(21) as Result<never>,
          ),
        ];
        const worst: Record<FeedHealth["status"], number> = { healthy: 0, degraded: 1, paused: 2 };
        const status = feeds.reduce<FeedHealth["status"]>(
          (w, f) => (worst[f.status] > worst[w] ? f.status : w),
          "healthy",
        );
        const oracleHealth: PoolOracleHealth = { status, feeds, paused: status === "paused" };

        const maxTvlUsd = config?.[4] ?? 0n;
        return {
          address: p,
          stats: {
            address: p,
            shieldedToken: info.shieldedToken,
            backingToken: info.backingToken,
            active: active && !paused,
            premiumRateBp: info.commissionRate,
            poolFeeBp: info.poolFee,
            protocolFeeBp: config?.[8] ?? 0n,
            collateralRatioBp: info.colleteralRatio,
            protectorPositionCount: counts[i]!,
            coverageBps: ratioBps(totalProtectorTokens, totalShieldCollateral),
            utilizationBps: ratioBps(totalShieldCollateral, totalProtectorTokens),
            maxTvlUsd,
            shieldTvlUsd: totalValueAtDeposit,
            capacityBps: maxTvlUsd > 0n ? clampBps((totalValueAtDeposit * BPS) / maxTvlUsd) : null,
            shieldedMinDeposit: config?.[0] ?? 0n,
            shieldedMaxDeposit: config?.[1] ?? 0n,
            backingMinDeposit: config?.[2] ?? 0n,
            backingMaxDeposit: config?.[3] ?? 0n,
            minimumPoolTime: config?.[5] ?? 0n,
            unlockDuration: config?.[6] ?? 0n,
            hasAccessControl: accessControl !== zeroAddress,
          },
          shielded,
          backing,
          oracle: oracleHealth,
        };
      });
    },

    async getOwnerPositions(owner: AccountId): Promise<OwnerPositions> {
      const user = owner as Address;
      const block = await client.getBlock();
      const blockNumber = block.number;
      if (blockNumber === null) throw new Error("On-chain data unavailable.");
      const now = block.timestamp;
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return { shield: [], protector: [] };

      const meta = await rawMulticall(
        client,
        pools.flatMap((p) => [
          { ...poolC(p), functionName: "getUserNFTCounts", args: [user] },
          { ...poolC(p), functionName: "shieldReceiptNFT" },
          { ...poolC(p), functionName: "protectorReceiptNFT" },
          { ...poolC(p), functionName: "poolConfig" },
          { ...poolC(p), functionName: "SHIELDED_TOKEN" },
          { ...poolC(p), functionName: "shieldedTokenDecimals" },
          { ...poolC(p), functionName: "COMMISSION_RATE" },
          { ...poolC(p), functionName: "POOL_FEE" },
        ]),
        blockNumber,
      );
      const M = 8;

      type Side = {
        pool: Address;
        nft: Address;
        kind: "shield" | "protector";
        minimumPoolTime: bigint;
        unlockDuration: bigint;
        shieldedToken: Address;
        expectedCount: bigint;
        decimals: number;
        oracle: Address;
        rates: readonly bigint[];
      };
      const sides: Side[] = [];
      pools.forEach((p, i) => {
        const cnt = requireRead<readonly [bigint, bigint]>(meta[i * M]);
        const config = requireRead<
          readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]
        >(meta[i * M + 3]);
        const shieldedToken = requireRead<Address>(meta[i * M + 4]);
        const base = {
          pool: p,
          minimumPoolTime: config[5],
          unlockDuration: config[6],
          shieldedToken,
          decimals: requireRead<number>(meta[i * M + 5]),
          oracle: config[9],
          rates: [requireRead<bigint>(meta[i * M + 6]), requireRead<bigint>(meta[i * M + 7]), config[8]],
        };
        const shieldNft = requireRead<Address>(meta[i * M + 1]);
        const protectorNft = requireRead<Address>(meta[i * M + 2]);
        if (cnt[0] > 0n) sides.push({ ...base, expectedCount: cnt[0], nft: shieldNft, kind: "shield" });
        if (cnt[1] > 0n) sides.push({ ...base, expectedCount: cnt[1], nft: protectorNft, kind: "protector" });
      });
      if (sides.length === 0) return { shield: [], protector: [] };

      // Receipt NFTs are not enumerable, so scan ownerOf over [0, nextTokenId) per side (capped).
      const nexts = await rawMulticall(
        client,
        sides.map((s) => ({ address: s.nft, abi: shieldReceiptNftAbi, functionName: "nextTokenId" as const })),
        blockNumber,
      );
      const ownerOfCalls = sides.flatMap((s, si) => {
        const next = requireRead<bigint>(nexts[si]);
        if (next > MAX_TOKEN_IDS)
          throw new Error("Position discovery limit reached. An indexer is required to list all positions.");
        const upper = next;
        return Array.from({ length: Number(upper) }, (_, t) => ({
          side: si,
          tokenId: BigInt(t),
          contract: {
            address: s.nft,
            abi: shieldReceiptNftAbi,
            functionName: "ownerOf" as const,
            args: [BigInt(t)] as const,
          },
        }));
      });
      const owners = await rawMulticall(
        client,
        ownerOfCalls.map((c) => c.contract),
        blockNumber,
      );
      const held = ownerOfCalls.filter((c, i) => receiptOwner(owners[i])?.toLowerCase() === user.toLowerCase());

      sides.forEach((s, i) => {
        if (BigInt(held.filter((h) => h.side === i).length) !== s.expectedCount)
          throw new Error("Position discovery is incomplete. Please refresh before continuing.");
      });

      // Position details + live shielded valuations, one batch.
      const details = await rawMulticall(
        client,
        held.map((h) => {
          const s = sides[h.side]!;
          return s.kind === "shield"
            ? ({ address: s.nft, abi: shieldReceiptNftAbi, functionName: "getPosition", args: [h.tokenId] } as const)
            : ({ ...poolC(s.pool), functionName: "getProtectorDepositInfo", args: [h.tokenId] } as const);
        }),
        blockNumber,
      );

      const shieldHeld = held.filter((h) => sides[h.side]!.kind === "shield");
      const values = await rawMulticall(
        client,
        shieldHeld.flatMap((h) => {
          const s = sides[h.side]!;
          const pos = requireRead<{ amount: bigint }>(details[held.indexOf(h)]);
          return [
            {
              address: s.oracle,
              abi: compositeOracleAbi,
              functionName: "getValue",
              args: [s.shieldedToken, pos.amount],
            },
            {
              address: s.oracle,
              abi: compositeOracleAbi,
              functionName: "getPriceForFeeAccrual",
              args: [s.shieldedToken],
            },
            {
              address: s.oracle,
              abi: closedSessionPriceAbi,
              functionName: "getPriceForClosedSessionExit",
              args: [s.shieldedToken],
            },
            { ...poolC(s.pool), functionName: "feeValueBaselineUsd", args: [h.tokenId] },
          ];
        }),
        blockNumber,
      );

      const shield: ShieldPositionView[] = [];
      const protector: ProtectorPositionView[] = [];
      held.forEach((h, i) => {
        const s = sides[h.side]!;
        if (s.kind === "shield") {
          const pos = requireRead<{
            amount: bigint;
            depositTime: bigint;
            valueAtDeposit: bigint;
            collateralAmount: bigint;
            lastFeeClaimTime: bigint;
          }>(details[i] as Result<never>);
          const vi = shieldHeld.indexOf(h) * 4;
          const currentValueUsd = ok<bigint>(values[vi]);
          const feePrice = ok<bigint>(values[vi + 1]) ?? ok<bigint>(values[vi + 2]);
          if (feePrice === null) throw new Error("Current price feed unavailable for withdrawal quote.");
          const netAmount = netShieldAmount(
            pos.amount,
            pos.valueAtDeposit,
            requireRead<bigint>(values[vi + 3]),
            feePrice,
            s.decimals,
            s.rates,
          );
          const depositTime = BigInt(pos.depositTime);
          const unlockAt = depositTime + s.minimumPoolTime;
          shield.push({
            id: encodePositionId(s.pool, "shield", h.tokenId),
            pool: s.pool,
            deposited: pos.amount,
            withdrawableNet: netAmount,
            valueAtDepositUsd: pos.valueAtDeposit,
            collateralAmount: pos.collateralAmount,
            depositTime,
            protectedExitUnlockTime: unlockAt,
            protectedExitUnlocked: now >= unlockAt,
            currentValueUsd,
            earnedUsd:
              currentValueUsd !== null
                ? currentValueUsd > pos.valueAtDeposit
                  ? currentValueUsd - pos.valueAtDeposit
                  : 0n
                : null,
          });
        } else {
          const pos = requireRead<readonly [bigint, bigint, bigint, bigint, bigint, bigint]>(details[i]);
          const [amount, depositTime, unlockRequestTime, lockedAmount, availableAmount] = pos;
          // The contract stores the completion timestamp, not the notice-start timestamp.
          const isUnlocking = unlockRequestTime > 0n && now <= BigInt(unlockRequestTime) + PROTECTOR_UNLOCK_WINDOW;
          const availableAt = isUnlocking ? BigInt(unlockRequestTime) : 0n;
          protector.push({
            id: encodePositionId(s.pool, "protector", h.tokenId),
            pool: s.pool,
            collateral: amount,
            claimableCommission: pos[5],
            availableToWithdraw: availableAmount,
            backingActive: lockedAmount,
            depositTime: BigInt(depositTime),
            isUnlocking,
            availableAt,
            noticeSecondsRemaining: isUnlocking && availableAt > now ? availableAt - now : 0n,
          });
        }
      });
      return { shield, protector };
    },

    async listWhitelistedTokens(): Promise<SeedToken[]> {
      const tokens = (await client.readContract({
        ...factory,
        functionName: "getWhitelistedTokens",
      })) as unknown as Address[];
      const meta = await rawMulticall(
        client,
        tokens.flatMap((t) => [
          { ...factory, functionName: "tokenInfo", args: [t] } as const,
          { address: t, abi: erc20Abi, functionName: "decimals" } as const,
        ]),
      );
      return tokens
        .map((t, i): SeedToken => {
          const info = requireRead<readonly [string, string, Address, Address, Address, bigint]>(meta[i * 2]);
          const minCollateralRatioBp = info?.[5] ?? 0n;
          return {
            token: t,
            symbol: info?.[1] ?? "—",
            name: info?.[0] ?? "Token",
            decimals: requireRead<number>(meta[i * 2 + 1]),
            minCollateralRatioBp,
            tranche: minCollateralRatioBp >= 15_000n ? "volatile" : "stable",
          };
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
    },

    async getTokenBalance(owner: AccountId, token: TokenId): Promise<bigint | null> {
      try {
        const bal = await client.readContract({
          address: token as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner as Address],
        });
        return bal;
      } catch {
        return null;
      }
    },

    async getBalances(owner: AccountId): Promise<TokenBalance[]> {
      const tokens = await this.listWhitelistedTokens();
      const balances = await rawMulticall(
        client,
        tokens.map((t) => ({
          address: t.token as Address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [owner as Address] as const,
        })),
      );
      return tokens.map((token, i) => ({ token, amount: requireRead<bigint>(balances[i]) }));
    },

    async getProtectedExitQuote(position) {
      const { pool, side, tokenId } = decodePositionId(position);
      if (side !== "shield") throw new Error("Position type does not match a protected exit.");
      const block = await client.getBlock();
      if (block.number === null) throw new Error("On-chain data unavailable.");
      const blockNumber = block.number;
      await client.readContract({ ...factory, functionName: "getPoolInfo", args: [pool], blockNumber });
      const [config, nft, backingToken, decimals, paused] = await Promise.all([
        client.readContract({ ...poolC(pool), functionName: "poolConfig", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "shieldReceiptNFT", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "BACKING_TOKEN", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "backingTokenDecimals", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "paused", blockNumber }),
      ]);
      if (paused) throw new Error("Pool is paused.");
      const [pos, price] = await Promise.all([
        client.readContract({
          address: nft,
          abi: shieldReceiptNftAbi,
          functionName: "getPosition",
          args: [tokenId],
          blockNumber,
        }),
        client.readContract({
          address: config[9],
          abi: compositeOracleAbi,
          functionName: "getPriceWithStrictCircuitBreaker",
          args: [backingToken],
          blockNumber,
        }),
      ]);
      if (pos.amount === 0n || price <= 0n) throw new Error("Current price feed unavailable for exit quote.");
      const uncapped = (pos.valueAtDeposit * 10n ** BigInt(decimals)) / price;
      const amount = uncapped < pos.collateralAmount ? uncapped : pos.collateralAmount;
      if (amount <= 0n) throw new Error("No positive protected exit quote is available.");
      return { amount, token: backingToken, blockNumber, quotedAt: block.timestamp };
    },

    async getActivity(owner: AccountId): Promise<ActivityEntry[]> {
      const user = (owner as Address).toLowerCase();
      const blockNumber = await client.getBlockNumber();
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return [];
      if (deps.deploymentBlock === undefined)
        throw new Error("Activity data unavailable until the deployment block is configured.");
      const infos = await Promise.all(
        pools.map((address) =>
          client.readContract({ ...factory, functionName: "getPoolInfo", args: [address], blockNumber }),
        ),
      );
      const infoByPool = new Map(pools.map((address, i) => [address.toLowerCase(), infos[i]!]));
      const readLogs = (fromBlock: bigint, toBlock: bigint) =>
        client.getLogs({ address: pools, events: ACTIVITY_EVENTS, fromBlock, toBlock });
      const mine: Awaited<ReturnType<typeof readLogs>> = [];
      // Small windows work with public Base RPC log-range limits. Read newest windows first
      // and stop once the visible history is full; do not silently swallow RPC failures.
      for (let toBlock = blockNumber; toBlock >= deps.deploymentBlock;) {
        const fromBlock: bigint =
          toBlock - deps.deploymentBlock >= ACTIVITY_BLOCK_RANGE
            ? toBlock - ACTIVITY_BLOCK_RANGE + 1n
            : deps.deploymentBlock;
        const logs = await readLogs(fromBlock, toBlock);
        mine.push(
          ...logs.filter((log) => {
            const a = log.args as Record<string, unknown>;
            const actor = (a.depositor ?? a.withdrawer ?? a.shieldedAddress ?? a.recipient ?? a.protector ?? a.user) as
              Address | undefined;
            return actor?.toLowerCase() === user;
          }),
        );
        if (mine.length >= ACTIVITY_LIMIT * 2 || fromBlock === deps.deploymentBlock) break;
        toBlock = fromBlock - 1n;
      }
      const activated = new Set(
        mine
          .filter((log) => log.eventName === "ShieldActivated")
          .map((log) => `${log.transactionHash}:${log.address.toLowerCase()}`),
      );
      const recent = mine
        .filter(
          (log) =>
            !(
              log.eventName === "ShieldedWithdrawal" &&
              activated.has(`${log.transactionHash}:${log.address.toLowerCase()}`)
            ),
        )
        .sort((x, y) => Number((y.blockNumber ?? 0n) - (x.blockNumber ?? 0n)) || (y.logIndex ?? 0) - (x.logIndex ?? 0))
        .slice(0, ACTIVITY_LIMIT);
      const blockNumbers = [...new Set(recent.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
      const blocks = await Promise.all(blockNumbers.map((b) => client.getBlock({ blockNumber: b }).catch(() => null)));
      const timeByBlock = new Map(blockNumbers.map((b, i) => [b, blocks[i] ? Number(blocks[i]!.timestamp) : null]));
      return recent.map((log): ActivityEntry => {
        const a = log.args as Record<string, unknown>;
        const info = infoByPool.get(log.address.toLowerCase());
        const token = (a.asset ??
          a.preferredAsset ??
          (log.eventName === "ShieldActivated"
            ? info?.backingToken
            : ["CommissionClaimed", "PartialWithdrawal"].includes(log.eventName ?? "")
              ? info?.shieldedToken
              : undefined)) as Address | undefined;
        // RewardsClaimed crystallizes premium fees; feesCharged is not a token payout.
        const amount = (a.amount ?? a.backingTokenAmount ?? a.assets ?? a.withdrawAmount) as bigint | undefined;
        return {
          txId: log.transactionHash ?? "",
          kind: ACTIVITY_EVENT_KINDS[log.eventName ?? ""] ?? "collect",
          timestamp: log.blockNumber !== null ? (timeByBlock.get(log.blockNumber) ?? null) : null,
          rawAmount: amount ?? null,
          token: token ?? null,
        };
      });
    },
  };
}
