import { beforeEach, describe, expect, it, vi } from "vitest";
import { zeroAddress, zeroHash, encodeFunctionData, encodeEventTopics } from "viem";
import { erc721TransferEventAbi } from "../src/abis/erc20";
import { splitRiskPoolAbi } from "../src/abis/splitRiskPool";
import { planIntent } from "../src/intents";
import { createReader, netShieldAmount } from "../src/reader";
import { assertWalletSession, sendEvmIntent, readCanonicalStepReceipt } from "../src/react";
import { encodePositionId } from "../src/positionId";
import { friendlyError } from "../src/errors";
import { getAccount, waitForTransactionReceipt, writeContract } from "@wagmi/core";

vi.mock("@wagmi/core", async (original) => ({
  ...(await original()),
  getAccount: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}));
const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const pool = "0x3333333333333333333333333333333333333333";
const shielded = "0x4444444444444444444444444444444444444444";
const backing = "0x5555555555555555555555555555555555555555";
const factory = "0x6666666666666666666666666666666666666666";
const oracle = "0x7777777777777777777777777777777777777777";
const shieldNft = "0x8888888888888888888888888888888888888888";
const protectorNft = "0x9999999999999999999999999999999999999999";
const txHash = `0x${"a".repeat(64)}`;
const info = {
  shieldedToken: shielded,
  backingToken: backing,
  shieldedTokenSymbol: "tSTOCK",
  backingTokenSymbol: "tUSD",
  commissionRate: 2000n,
  poolFee: 100n,
  colleteralRatio: 15000n,
  createdAt: 1n,
  creator: owner,
};
const deps = { factory, compositeOracle: oracle, deploymentBlock: 1n };
const deposit = {
  kind: "depositShielded",
  pool,
  shieldedToken: shielded,
  backingToken: backing,
  amount: 100n,
  minReceived: 99n,
} as const;
const success = (result: unknown) => ({ status: "success", result });
const failure = () => ({ status: "failure", error: new Error("RPC down") });
const burned = () => ({ status: "failure", error: { cause: { data: { errorName: "ERC721NonexistentToken" } } } });
const canonicalBlockHash = `0x${"c".repeat(64)}`;
const canonicalStep = {
  address: pool,
  abi: splitRiskPoolAbi,
  functionName: "depositShieldedAsset",
  args: [shielded, 100n, 99n],
};
function rawRpc(overrides: Record<string, any> = {}) {
  let activeHash = txHash;
  let receiptReads = 0;
  return vi.fn(async ({ method, params }: any) => {
    const step = overrides.step ?? vi.mocked(writeContract).mock.calls.at(-1)?.[1] ?? canonicalStep;
    if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") activeHash = params[0];
    const receipt = {
      transactionHash: activeHash,
      blockHash: canonicalBlockHash,
      blockNumber: "0xa",
      transactionIndex: "0x0",
      from: owner,
      to: step.address,
      status: "0x1",
      gasUsed: "0x100",
      cumulativeGasUsed: "0x100",
      effectiveGasPrice: "0x1",
      type: "0x2",
      contractAddress: null,
      logs:
        step.functionName === "depositShieldedAsset"
          ? [
              {
                address: shieldNft,
                blockHash: canonicalBlockHash,
                blockNumber: "0xa",
                transactionHash: activeHash,
                transactionIndex: "0x0",
                logIndex: "0x0",
                removed: false,
                data: "0x",
                topics: encodeEventTopics({
                  abi: erc721TransferEventAbi,
                  eventName: "Transfer",
                  args: { from: zeroAddress, to: owner, tokenId: 1n },
                }),
              },
            ]
          : [],
      ...overrides.receipt,
    };
    if (method === "eth_getTransactionReceipt")
      return { ...receipt, ...(receiptReads++ > 0 ? overrides.freshReceipt : {}) };
    if (method === "eth_getTransactionByHash")
      return {
        hash: activeHash,
        from: owner,
        to: step.address,
        input: encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.args }),
        value: "0x0",
        blockHash: canonicalBlockHash,
        blockNumber: "0xa",
        transactionIndex: "0x0",
        chainId: "0x14a34",
        ...overrides.transaction,
      };
    if (method === "eth_getBlockByNumber")
      return params[0] === "latest"
        ? { number: "0xb", hash: `0x${"d".repeat(64)}`, transactions: [], ...overrides.head }
        : { number: "0xa", hash: canonicalBlockHash, transactions: [activeHash], ...overrides.block };
    throw new Error(`unexpected RPC method ${method}`);
  });
}
function clientFor(overrides: Record<string, any> = {}) {
  const values: Record<string, any> = {
    poolCount: 1n,
    getPools: [pool],
    getPoolInfo: info,
    allowance: 0n,
    shieldReceiptNFT: shieldNft,
    protectorReceiptNFT: protectorNft,
    poolConfig: [1n, 10000n, 1n, 10000n, 100000000000n, 60n, 100n, owner, 200n, oracle],
    paused: false,
    isPoolActive: true,
    totalProtectorTokens: 150n,
    totalShieldCollateralAmount: 100n,
    totalValueAtDeposit: 10000000000n,
    shieldedTokenDecimals: 0,
    backingTokenDecimals: 0,
    accessControl: zeroAddress,
    nextTokenId: 1n,
    ownerOf: owner,
    getUserNFTCounts: [0n, 1n],
    SHIELDED_TOKEN: shielded,
    BACKING_TOKEN: backing,
    COMMISSION_RATE: 2000n,
    POOL_FEE: 100n,
    getProtectorPositionAmount: 150n,
    tokenInfo: ["Test Stock", "tSTOCK", oracle, zeroAddress, zeroAddress, 15000n],
    isPriceStale: [false, 1000n],
    isBackupActiveForToken: false,
    getTokenDualFeedStatus: [false, oracle, zeroAddress, false, false, 0n],
    isTokenChallengeable: false,
    getPrice: 100000000n,
    getPriceWithStrictCircuitBreaker: 100000000n,
    getProtectorDepositInfo: [150n, 1n, 1100n, 100n, 50n, 0n],
    getPosition: {
      amount: 100n,
      depositTime: 1n,
      valueAtDeposit: 10000000000n,
      collateralAmount: 150n,
      lastFeeClaimTime: 1n,
    },
    getValue: 10000000000n,
    getPriceForFeeAccrual: 100000000n,
    getPriceForClosedSessionExit: 100000000n,
    feeValueBaselineUsd: 10000000000n,
    decimals: 0,
    balanceOf: 100n,
    getWhitelistedTokens: [shielded],
    ...overrides,
  };
  const value = (call: any) =>
    typeof values[call.functionName] === "function" ? values[call.functionName](call) : values[call.functionName];
  return {
    request: rawRpc(),
    getBlockNumber: vi.fn(async () => 10n),
    getChainId: vi.fn(async () => 84532),
    getBlock: vi.fn(async () => ({ number: 10n, timestamp: 1000n })),
    readContract: vi.fn(async (call) => {
      const result = value(call);
      if (result?.status === "failure") throw result.error;
      return result?.status === "success" ? result.result : result;
    }),
    multicall: vi.fn(async ({ contracts }) =>
      contracts.map((call: any) => {
        const result = value(call);
        return result?.status ? result : success(result);
      }),
    ),
    simulateContract: vi.fn(async () => ({ request: {} })),
    getLogs: vi.fn(async () => []),
  } as any;
}

describe("transaction intent boundaries", () => {
  it("uses exact spending approval followed by a bounded deposit", async () => {
    const result = await planIntent(clientFor(), owner, { factory }, deposit);
    expect(result.steps.map((s) => s.functionName)).toEqual(["approve", "depositShieldedAsset"]);
    expect(result.steps[0]!.args).toEqual([pool, 100n]);
    expect(result.steps[1]!.args).toEqual([shielded, 100n, 99n]);
  });
  it("clears a smaller nonzero allowance before setting its exact replacement", async () => {
    const result = await planIntent(clientFor({ allowance: 50n }), owner, { factory }, deposit);
    expect(result.steps.map((s) => s.args)).toEqual([
      [pool, 0n],
      [pool, 100n],
      [shielded, 100n, 99n],
    ]);
  });
  it("does not request an approval when the current allowance is sufficient", async () => {
    const result = await planIntent(clientFor({ allowance: 100n }), owner, { factory }, deposit);
    expect(result.steps).toHaveLength(1);
  });
  it.each([0n, -1n])("rejects nonpositive deposits before an allowance read (%s)", async (amount) => {
    const client = clientFor();
    await expect(planIntent(client, owner, { factory }, { ...deposit, amount })).rejects.toThrow("positive");
    expect(client.readContract).not.toHaveBeenCalled();
  });
  it("rejects unbounded withdrawals", async () => {
    await expect(
      planIntent(
        clientFor(),
        owner,
        { factory },
        {
          kind: "activateShielded",
          pool,
          position: encodePositionId(pool, "shield", 0n),
          shieldedToken: shielded,
          backingToken: backing,
          minOut: 0n,
        },
      ),
    ).rejects.toThrow("minimum output");
  });
  it("rejects mismatched position sides and pool addresses", async () => {
    await expect(
      planIntent(
        clientFor(),
        owner,
        { factory },
        {
          kind: "withdrawShielded",
          pool,
          position: encodePositionId(pool, "protector", 0n),
          shieldedToken: shielded,
          minOut: 1n,
        },
      ),
    ).rejects.toThrow("Position type");
    await expect(
      planIntent(
        clientFor(),
        owner,
        { factory },
        {
          kind: "withdrawShielded",
          pool: other,
          position: encodePositionId(pool, "shield", 0n),
          shieldedToken: shielded,
          minOut: 1n,
        },
      ),
    ).rejects.toThrow("Position pool");
  });
  it("rejects assets inconsistent with factory metadata before approval", async () => {
    const client = clientFor();
    await expect(planIntent(client, owner, { factory }, { ...deposit, shieldedToken: other })).rejects.toThrow(
      "does not match",
    );
    expect(client.readContract.mock.calls.some(([c]: any) => c.functionName === "allowance")).toBe(false);
  });
  it("rejects unknown factory pools before approval", async () => {
    await expect(planIntent(clientFor({ getPoolInfo: failure() }), owner, { factory }, deposit)).rejects.toThrow(
      "RPC down",
    );
  });
});

describe("wallet session and receipt safety", () => {
  let current: any;
  let connector: any;
  beforeEach(() => {
    vi.clearAllMocks();
    connector = { uid: "wallet-1", getAccounts: vi.fn(async () => [owner]), getChainId: vi.fn(async () => 84532) };
    current = { status: "connected", address: owner, chainId: 84532, connector };
    vi.mocked(getAccount).mockImplementation(() => current);
    vi.mocked(writeContract).mockResolvedValue(txHash as any);
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      status: "success",
      transactionHash: txHash,
      logs: [],
    } as any);
  });
  const config = {} as any;
  const adapter = (client: any) => ({ chain: { id: 84532 }, addresses: { factory }, publicClient: client }) as any;
  it("rejects a live wallet on a different chain", async () => {
    connector.getChainId.mockResolvedValue(8453);
    await expect(assertWalletSession(config, owner, 84532, connector.uid)).rejects.toThrow("Wrong network");
  });
  it("rejects an account switch even before framework state catches up", async () => {
    connector.getAccounts.mockResolvedValue([other]);
    await expect(assertWalletSession(config, owner, 84532, connector.uid)).rejects.toThrow("account changed");
  });
  it("stops after approval if the account changes while it confirms", async () => {
    vi.mocked(waitForTransactionReceipt).mockImplementation(async () => {
      current = { ...current, address: other };
      return { status: "success", transactionHash: txHash, logs: [] } as any;
    });
    await expect(sendEvmIntent(adapter(clientFor()), config, owner, deposit)).rejects.toThrow("account changed");
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
  it("does not sign after a failed simulation", async () => {
    const client = clientFor();
    client.simulateContract.mockRejectedValue(new Error("OraclePriceStale"));
    await expect(sendEvmIntent(adapter(client), config, owner, deposit)).rejects.toThrow("OraclePriceStale");
    expect(writeContract).not.toHaveBeenCalled();
  });
  it("rejects a read RPC configured for the wrong network", async () => {
    const client = clientFor();
    client.getChainId.mockResolvedValue(8453);
    await expect(sendEvmIntent(adapter(client), config, owner, deposit)).rejects.toThrow("Wrong network");
    expect(writeContract).not.toHaveBeenCalled();
  });
  it("does not treat a cancellation replacement as successful protocol execution", async () => {
    vi.mocked(waitForTransactionReceipt).mockImplementation(async (_config, args: any) => {
      args.onReplaced({ reason: "cancelled" });
      return { status: "success", transactionHash: txHash, logs: [] } as any;
    });
    await expect(sendEvmIntent(adapter(clientFor()), config, owner, deposit)).rejects.toThrow("cancelled or replaced");
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
  it("does not accept an unrelated waiter hash without a replacement event", async () => {
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      status: "success",
      transactionHash: `0x${"b".repeat(64)}`,
      logs: [],
    } as any);
    await expect(sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit)).rejects.toThrow(
      "cancelled or replaced",
    );
  });
  it("ignores a zero waiter block hash and verifies fresh raw sealed evidence", async () => {
    vi.mocked(waitForTransactionReceipt).mockResolvedValue({
      status: "success",
      transactionHash: txHash,
      blockHash: zeroHash,
      logs: [],
    } as any);
    const result = await sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit);
    expect(result.positionId).toBe(encodePositionId(pool, "shield", 1n));
  });
  it("returns the mined replacement hash when only the gas price was raised", async () => {
    const replacementHash = `0x${"b".repeat(64)}`;
    vi.mocked(waitForTransactionReceipt).mockImplementation(async (_config, args: any) => {
      args.onReplaced({
        reason: "repriced",
        replacedTransaction: { hash: txHash },
        transaction: { hash: replacementHash },
      });
      return { status: "success", transactionHash: replacementHash, logs: [] } as any;
    });
    const result = await sendEvmIntent(adapter(clientFor({ allowance: 100n })), config, owner, deposit);
    expect(result.txId).toBe(replacementHash);
  });
});

describe("truthful pool and position reads", () => {
  it("fails visibly when paused/config/decimal reads are unavailable", async () => {
    for (const field of ["paused", "poolConfig", "shieldedTokenDecimals", "totalProtectorTokens"])
      await expect(createReader(clientFor({ [field]: failure() }), deps).loadPools()).rejects.toThrow(
        "data unavailable",
      );
  });
  it("counts extant receipts instead of the lifetime mint counter", async () => {
    const pools = await createReader(
      clientFor({ nextTokenId: 3n, ownerOf: (c: any) => (c.args[0] === 1n ? burned() : owner) }),
      deps,
    ).loadPools();
    expect(pools[0]!.stats.protectorPositionCount).toBe(2n);
  });
  it("does not treat a failed NFT owner read as a burned receipt", async () => {
    await expect(createReader(clientFor({ ownerOf: failure() }), deps).loadPools()).rejects.toThrow(
      "discovery data unavailable",
    );
  });
  it("shows unavailable safety probes and protected prices as paused", async () => {
    for (const field of [
      "isPriceStale",
      "isBackupActiveForToken",
      "getTokenDualFeedStatus",
      "isTokenChallengeable",
      "getPrice",
    ]) {
      const pools = await createReader(clientFor({ [field]: failure() }), deps).loadPools();
      expect(pools[0]!.oracle.status).toBe("paused");
    }
  });
  it("shows challengeable prices as paused before a challenge is submitted", async () => {
    const pools = await createReader(clientFor({ isTokenChallengeable: true }), deps).loadPools();
    expect(pools[0]!.oracle.status).toBe("paused");
  });
  it("retains retired pools and disables their active flag", async () => {
    const pools = await createReader(clientFor({ isPoolActive: false }), deps).loadPools();
    expect(pools[0]!.stats.active).toBe(false);
  });
  it("pins pool multicalls to the same block", async () => {
    const client = clientFor();
    await createReader(client, deps).loadPools();
    expect(client.multicall.mock.calls.every(([c]: any) => c.blockNumber === 10n)).toBe(true);
  });
  it("uses the stored notice-completion timestamp without adding the duration twice", async () => {
    const positions = await createReader(clientFor(), deps).getOwnerPositions(owner);
    expect(positions.protector[0]!.availableAt).toBe(1100n);
    expect(positions.protector[0]!.noticeSecondsRemaining).toBe(100n);
  });
  it("allows expired notice windows to be restarted", async () => {
    const client = clientFor();
    client.getBlock.mockResolvedValue({ number: 10n, timestamp: 1100n + 604801n });
    const positions = await createReader(client, deps).getOwnerPositions(owner);
    expect(positions.protector[0]!.isUnlocking).toBe(false);
  });
  it("fails visibly rather than truncating positions beyond the discovery cap", async () => {
    await expect(createReader(clientFor({ nextTokenId: 2001n }), deps).getOwnerPositions(owner)).rejects.toThrow(
      "discovery limit",
    );
  });
  it("checks discovered positions against the authoritative owner NFT balance", async () => {
    await expect(
      createReader(clientFor({ getUserNFTCounts: [0n, 2n] }), deps).getOwnerPositions(owner),
    ).rejects.toThrow("incomplete");
  });
  it("fails on unavailable token decimals and balances rather than returning invented defaults", async () => {
    await expect(createReader(clientFor({ decimals: failure() }), deps).listWhitelistedTokens()).rejects.toThrow(
      "data unavailable",
    );
    await expect(createReader(clientFor({ balanceOf: failure() }), deps).getBalances(owner)).rejects.toThrow(
      "data unavailable",
    );
  });
});

describe("withdrawal fee quotes", () => {
  it("deducts fees from gains using integer token units", () => {
    expect(netShieldAmount(100000000n, 10000000000n, 10000000000n, 200000000n, 6, [2000n, 1000n, 500n])).toBe(
      82500000n,
    );
  });
  it("preserves the fee high-water mark", () => {
    expect(netShieldAmount(100000000n, 10000000000n, 18000000000n, 200000000n, 6, [2000n, 1000n, 500n])).toBe(
      96500000n,
    );
  });
  it("does not charge gains again after a drawdown", () => {
    expect(netShieldAmount(100n, 10000000000n, 20000000000n, 150000000n, 0, [2000n])).toBe(100n);
  });
  it("matches fee ceil rounding for dust and caps at the position amount", () => {
    expect(netShieldAmount(1n, 100000000n, 0n, 100000001n, 0, [1n, 1n, 1n])).toBe(0n);
  });
  it("does not quote an unavailable fee price as the full balance", async () => {
    await expect(
      createReader(
        clientFor({
          getUserNFTCounts: [1n, 0n],
          getPriceForFeeAccrual: failure(),
          getPriceForClosedSessionExit: failure(),
        }),
        deps,
      ).getOwnerPositions(owner),
    ).rejects.toThrow("price feed unavailable");
  });
});

it("preserves a clear message for an interrupted wallet session", () => {
  expect(friendlyError(new Error("Wallet account changed"))).toContain("account changed");
});

describe("bounded and accurate activity reads", () => {
  const log = (eventName: string, args: any, logIndex: number, hash = txHash) => ({
    eventName,
    args,
    address: pool,
    blockNumber: 10n,
    logIndex,
    transactionHash: hash,
  });
  it("includes partial withdrawals and uses the actual output asset", async () => {
    const client = clientFor();
    client.getLogs.mockResolvedValue([
      log("PartialWithdrawal", { user: owner, withdrawAmount: 12n }, 1),
      log("ShieldedWithdrawal", { withdrawer: owner, amount: 15n, preferredAsset: shielded }, 2),
    ]);
    const activity = await createReader(client, deps).getActivity(owner);
    expect(activity.map((a) => [a.kind, a.rawAmount, a.token])).toEqual([
      ["withdraw", 15n, shielded],
      ["withdraw", 12n, shielded],
    ]);
  });
  it("does not double-count a protected exit as another withdrawal", async () => {
    const client = clientFor();
    client.getLogs.mockResolvedValue([
      log("ShieldActivated", { withdrawer: owner, amount: 100n, backingTokenAmount: 100n }, 1),
      log("ShieldedWithdrawal", { withdrawer: owner, amount: 100n, preferredAsset: backing }, 2),
      log("ShieldedWithdrawal", { withdrawer: other, amount: 200n, preferredAsset: backing }, 3),
    ]);
    const activity = await createReader(client, deps).getActivity(owner);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ kind: "activate", rawAmount: 100n, token: backing });
  });
  it("uses deployment-bounded RPC log windows", async () => {
    const client = clientFor();
    client.getBlockNumber.mockResolvedValue(5000n);
    await createReader(client, { ...deps, deploymentBlock: 1000n }).getActivity(owner);
    expect(client.getLogs.mock.calls.map(([call]: any) => [call.fromBlock, call.toBlock])).toEqual([
      [3001n, 5000n],
      [1001n, 3000n],
      [1000n, 1000n],
    ]);
  });
  it("fails visibly when log history cannot be read", async () => {
    const client = clientFor();
    client.getLogs.mockRejectedValue(new Error("RPC down"));
    await expect(createReader(client, deps).getActivity(owner)).rejects.toThrow("RPC down");
  });
  it("does not scan Base from genesis without deployment metadata", async () => {
    const client = clientFor();
    await expect(createReader(client, { factory, compositeOracle: oracle }).getActivity(owner)).rejects.toThrow(
      "deployment block",
    );
    expect(client.getLogs).not.toHaveBeenCalled();
  });
});

it("reads oracle safety from each pool's configured oracle", async () => {
  const client = clientFor({ poolConfig: [1n, 10000n, 1n, 10000n, 100000000000n, 60n, 100n, owner, 200n, other] });
  await createReader(client, deps).loadPools();
  const calls = client.multicall.mock.calls.flatMap(([args]: any) => args.contracts);
  expect(
    calls.filter((call: any) => call.functionName === "getPrice").every((call: any) => call.address === other),
  ).toBe(true);
});

describe("protected exit quote safety", () => {
  it("uses the verified backing price instead of assuming a dollar peg", async () => {
    const quote = await createReader(clientFor({ getPriceWithStrictCircuitBreaker: 200000000n }), deps)
      .getProtectedExitQuote!(encodePositionId(pool, "shield", 0n));
    expect(quote).toEqual({ amount: 50n, token: backing, blockNumber: 10n, quotedAt: 1000n });
  });
  it("caps backing-token payout to the position collateral after a depeg", async () => {
    const quote = await createReader(clientFor({ getPriceWithStrictCircuitBreaker: 50000000n }), deps)
      .getProtectedExitQuote!(encodePositionId(pool, "shield", 0n));
    expect(quote.amount).toBe(150n);
  });
  it("fails closed when strict pricing or pool availability fails", async () => {
    await expect(
      createReader(clientFor({ getPriceWithStrictCircuitBreaker: failure() }), deps).getProtectedExitQuote!(
        encodePositionId(pool, "shield", 0n),
      ),
    ).rejects.toThrow("RPC down");
    await expect(
      createReader(clientFor({ paused: true }), deps).getProtectedExitQuote!(encodePositionId(pool, "shield", 0n)),
    ).rejects.toThrow("paused");
  });
  it("returns the actual claimable commission rather than projected earnings", async () => {
    const positions = await createReader(
      clientFor({ getProtectorDepositInfo: [150n, 1n, 1100n, 100n, 50n, 7n] }),
      deps,
    ).getOwnerPositions(owner);
    expect(positions.protector[0]!.claimableCommission).toBe(7n);
  });
});

describe("canonical wallet transaction evidence", () => {
  const verify = (overrides: Record<string, any> = {}) => {
    const client = clientFor();
    client.request = rawRpc({ step: canonicalStep, ...overrides });
    return readCanonicalStepReceipt(client, txHash as any, owner, canonicalStep as any, 84532);
  };
  it("uses raw sealed evidence and returns only the canonical receipt logs", async () => {
    const receipt = await verify();
    expect(receipt.blockHash).toBe(canonicalBlockHash);
    expect(receipt.blockNumber).toBe(10n);
    expect(receipt.logs).toHaveLength(1);
  });
  it.each([null, zeroHash, "0x1234"])("rejects unsealed raw receipt hashes (%s)", async (blockHash) => {
    await expect(verify({ receipt: { blockHash } })).rejects.toThrow("sealed confirmation");
  });
  it("rejects a receipt moved or reorged during confirmation", async () => {
    await expect(verify({ freshReceipt: { blockHash: `0x${"e".repeat(64)}` } })).rejects.toThrow();
    await expect(verify({ block: { transactions: [`0x${"f".repeat(64)}`] } })).rejects.toThrow("canonical block");
  });
  it.each([{ from: other }, { to: other }, { input: "0x1234" }, { value: "0x1" }, { chainId: "0x2105" }])(
    "rejects changed mined action %s",
    async (transaction) => {
      await expect(verify({ transaction })).rejects.toThrow("reviewed action");
    },
  );
  it("requires two sealed block confirmations", async () => {
    await expect(verify({ head: { number: "0xa" } })).rejects.toThrow("two sealed confirmations");
  });
  it("rejects fabricated event provenance", async () => {
    await expect(
      verify({ receipt: { logs: [{ transactionHash: txHash, blockHash: zeroHash, removed: false }] } }),
    ).rejects.toThrow("logs");
  });
  it("does not confirm a position without the matching receipt NFT mint", async () => {
    const plan = await planIntent(clientFor({ allowance: 100n }), owner, { factory }, deposit);
    expect(() => plan.extract!({ logs: [] } as any)).toThrow("expected protection position");
  });
});
