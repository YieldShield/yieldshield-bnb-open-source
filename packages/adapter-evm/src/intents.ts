/**
 * Map chain-neutral tx intents to EVM transaction sequences. An intent becomes one or more
 * steps (ERC-20 approvals first, then the protocol call); the sender executes them in order and
 * `extract` pulls any created ids (receipt-NFT tokenId, new pool address) from the final receipt.
 */
import {
  isAddress,
  maxUint256,
  parseEventLogs,
  zeroAddress,
  type Abi,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type { TxIntent, TxResult } from "@yieldshield/core";
import { erc20Abi, erc721TransferEventAbi } from "./abis/erc20.js";
import { splitRiskPoolAbi } from "./abis/splitRiskPool.js";
import { splitRiskPoolFactoryAbi } from "./abis/splitRiskPoolFactory.js";
import { tokenFaucetAbi } from "./abis/tokenFaucet.js";
import { decodePositionId, encodePositionId } from "./positionId.js";
import { assertDepositPreflight } from "./preflight.js";
import { readFaucetStatus } from "./faucet.js";

export type EvmStep = {
  /** Short human label for progress UX ("Approve USDG", "Confirm deposit"). */
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

export type IntentPlan = {
  steps: EvmStep[];
  /** Refresh action-specific eligibility before every signature, including approvals. */
  beforeStep?: () => Promise<void>;
  /** Pulls created ids from the FINAL step's receipt. */
  extract?: (receipt: TransactionReceipt) => Partial<Pick<TxResult, "positionId" | "poolId">>;
};

export type EvmIntentDeps = { factory: Address; faucet?: Address };

/** Prepend an approve step when the spender's allowance can't cover the amount. */
async function approvalStep(
  client: PublicClient,
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<EvmStep[]> {
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return [];
  return [
    // Exact approvals avoid an unlimited standing allowance. Reset first for ERC-20s that
    // require nonzero allowances to be cleared before changing them.
    ...(allowance > 0n
      ? [
          {
            label: "Reset spending approval",
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, 0n],
          },
        ]
      : []),
    { label: "Approve spending", address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] },
  ];
}

/** The tokenId minted to `owner` in this receipt (ERC-721 Transfer from the zero address). */
function mintedTokenId(receipt: TransactionReceipt, nft: Address | null, owner: Address): bigint | null {
  const transfers = parseEventLogs({ abi: erc721TransferEventAbi, logs: receipt.logs, eventName: "Transfer" });
  for (const t of transfers) {
    if (nft && t.address.toLowerCase() !== nft.toLowerCase()) continue;
    if (t.args.from === zeroAddress && t.args.to.toLowerCase() === owner.toLowerCase()) return t.args.tokenId;
  }
  return null;
}

export async function planIntent(
  client: PublicClient,
  owner: Address,
  deps: EvmIntentDeps,
  intent: TxIntent,
): Promise<IntentPlan> {
  const validAddress = (value: string): Address => {
    if (!isAddress(value) || value.toLowerCase() === zeroAddress)
      throw new Error("Invalid deployment or asset address.");
    return value as Address;
  };
  validAddress(owner);
  if (intent.kind !== "faucetDrip") validAddress(deps.factory);
  const positiveAmount = (amount: bigint) => {
    if (amount <= 0n || amount > maxUint256) throw new Error("Amount must be positive and within token limits.");
  };
  if ("amount" in intent) positiveAmount(intent.amount);
  if ("minReceived" in intent) {
    positiveAmount(intent.minReceived);
    if (intent.minReceived > intent.amount) throw new Error("Minimum received exceeds the deposit amount.");
  }
  if ("minOut" in intent) {
    if (intent.minOut <= 0n || intent.minOut > maxUint256)
      throw new Error("A positive minimum output is required to protect against slippage.");
  }

  const position = "position" in intent ? decodePositionId(intent.position) : null;
  if (position) {
    const expectedSide = ["activateShielded", "withdrawShielded", "partialWithdrawShielded", "claimRewards"].includes(
      intent.kind,
    )
      ? "shield"
      : "protector";
    if (position.side !== expectedSide) throw new Error("Position type does not match this action.");
    if ("pool" in intent && intent.pool.toLowerCase() !== position.pool.toLowerCase())
      throw new Error("Position pool does not match this action.");
  }
  const poolAddress = position?.pool ?? ("pool" in intent ? validAddress(intent.pool) : null);
  if (poolAddress) {
    // Never approve an address supplied by a route or stale UI unless this deployment's
    // factory recognises it; withdrawals can still target a retired factory pool.
    const info = await client.readContract({
      address: deps.factory,
      abi: splitRiskPoolFactoryAbi,
      functionName: "getPoolInfo",
      args: [poolAddress],
    });
    if (
      "shieldedToken" in intent &&
      validAddress(intent.shieldedToken).toLowerCase() !== info.shieldedToken.toLowerCase()
    )
      throw new Error("Shielded asset does not match the pool.");
    if ("backingToken" in intent && validAddress(intent.backingToken).toLowerCase() !== info.backingToken.toLowerCase())
      throw new Error("Backing asset does not match the pool.");
  }
  const pool = (address: Address) => ({ address, abi: splitRiskPoolAbi as Abi });

  switch (intent.kind) {
    case "depositShielded": {
      const poolAddr = intent.pool as Address;
      const asset = intent.shieldedToken as Address;
      const beforeStep = () =>
        assertDepositPreflight(client, deps.factory, poolAddr, owner, "shield", asset, intent.amount);
      await beforeStep();
      const [approvals, nft] = await Promise.all([
        approvalStep(client, owner, asset, poolAddr, intent.amount),
        client.readContract({ address: poolAddr, abi: splitRiskPoolAbi, functionName: "shieldReceiptNFT" }),
      ]);
      return {
        beforeStep,
        steps: [
          ...approvals,
          {
            label: "Confirm deposit",
            ...pool(poolAddr),
            functionName: "depositShieldedAsset",
            args: [asset, intent.amount, intent.minReceived],
          },
        ],
        extract: (receipt) => {
          const tokenId = mintedTokenId(receipt, nft, owner);
          if (tokenId === null)
            throw new Error("Confirmed deposit receipt does not contain the expected protection position.");
          return { positionId: encodePositionId(poolAddr, "shield", tokenId) };
        },
      };
    }

    case "depositBacking": {
      const poolAddr = intent.pool as Address;
      const asset = intent.backingToken as Address;
      const beforeStep = () =>
        assertDepositPreflight(client, deps.factory, poolAddr, owner, "backing", asset, intent.amount);
      await beforeStep();
      const [approvals, nft] = await Promise.all([
        approvalStep(client, owner, asset, poolAddr, intent.amount),
        client.readContract({ address: poolAddr, abi: splitRiskPoolAbi, functionName: "protectorReceiptNFT" }),
      ]);
      return {
        beforeStep,
        steps: [
          ...approvals,
          {
            label: "Confirm deposit",
            ...pool(poolAddr),
            functionName: "depositBackingAsset",
            args: [asset, intent.amount, intent.minReceived],
          },
        ],
        extract: (receipt) => {
          const tokenId = mintedTokenId(receipt, nft, owner);
          if (tokenId === null)
            throw new Error("Confirmed deposit receipt does not contain the expected collateral position.");
          return { positionId: encodePositionId(poolAddr, "protector", tokenId) };
        },
      };
    }

    case "activateShielded": {
      // Cross-asset exit: withdraw the shield position as the backing (safe) asset.
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Activate protection",
            ...pool(poolAddr),
            functionName: "shieldedWithdraw",
            args: [tokenId, intent.backingToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "withdrawShielded": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "shieldedWithdraw",
            args: [tokenId, intent.shieldedToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "partialWithdrawShielded": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "partialWithdrawShielded",
            args: [tokenId, intent.amount, intent.shieldedToken as Address, intent.minOut],
          },
        ],
        // Partial withdrawals close the old receipt and mint a new one for the remainder.
        extract: (receipt) => {
          const logs = parseEventLogs({ abi: splitRiskPoolAbi, logs: receipt.logs, eventName: "PartialWithdrawal" });
          const newTokenId = logs.find(
            (log) =>
              log.address.toLowerCase() === poolAddr.toLowerCase() &&
              log.args.user.toLowerCase() === owner.toLowerCase() &&
              log.args.oldTokenId === tokenId,
          )?.args.newTokenId;
          if (newTokenId === undefined)
            throw new Error("Confirmed withdrawal receipt does not identify the remaining position.");
          return { positionId: encodePositionId(poolAddr, "shield", newTokenId) };
        },
      };
    }

    case "withdrawProtector": {
      // Full exit: the port intent carries no amount, so withdraw the position's full balance.
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      const amount = await client.readContract({
        address: poolAddr,
        abi: splitRiskPoolAbi,
        functionName: "getProtectorPositionAmount",
        args: [tokenId],
      });
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "protectorWithdraw",
            args: [tokenId, amount, intent.backingToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "partialWithdrawProtector": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "protectorWithdraw",
            args: [tokenId, intent.amount, intent.backingToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "startUnlock": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Start notice", ...pool(poolAddr), functionName: "startUnlockProcess", args: [tokenId] }],
      };
    }

    case "cancelUnlock": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Cancel notice", ...pool(poolAddr), functionName: "cancelUnlockProcess", args: [tokenId] }],
      };
    }

    case "claimCommission": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Collect premium", ...pool(poolAddr), functionName: "claimCommission", args: [tokenId] }],
      };
    }

    case "claimRewards": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Collect rewards", ...pool(poolAddr), functionName: "claimRewards", args: [tokenId] }],
      };
    }

    case "createPool": {
      // The EVM factory sets pool timing/fee-cap/TVL parameters at the protocol level, so only
      // the per-pool terms (tokens, commission, pool fee, collateral ratio, bond) are passed;
      // the intent's remaining fields are Solana-configurable and ignored here.
      const p = intent.params;
      const shielded = p.shieldedToken as Address;
      const backing = validAddress(p.backingToken);
      validAddress(shielded);
      if (shielded.toLowerCase() === backing.toLowerCase()) throw new Error("Choose two different pool assets.");
      const bond = p.creationBondAmount ?? 0n;
      if (bond < 0n || bond > maxUint256) throw new Error("Invalid creation bond amount.");
      const [shInfo, bkInfo, bondApprovals] = await Promise.all([
        client.readContract({
          address: deps.factory,
          abi: splitRiskPoolFactoryAbi,
          functionName: "tokenInfo",
          args: [shielded],
        }),
        client.readContract({
          address: deps.factory,
          abi: splitRiskPoolFactoryAbi,
          functionName: "tokenInfo",
          args: [backing],
        }),
        bond > 0n ? approvalStep(client, owner, backing, deps.factory, bond) : Promise.resolve([]),
      ]);
      return {
        steps: [
          ...bondApprovals,
          {
            label: "Create pool",
            address: deps.factory,
            abi: splitRiskPoolFactoryAbi as Abi,
            functionName: "createPool",
            args: [
              shielded,
              shInfo[1],
              backing,
              bkInfo[1],
              BigInt(p.commissionRateBp),
              BigInt(p.poolFeeBp),
              BigInt(p.collateralRatioBp),
              bond,
            ],
          },
        ],
        extract: (receipt) => {
          const logs = parseEventLogs({ abi: splitRiskPoolFactoryAbi, logs: receipt.logs, eventName: "PoolCreated" });
          const created = logs.find((log) => log.address.toLowerCase() === deps.factory.toLowerCase())?.args
            .poolAddress;
          return created ? { poolId: created } : {};
        },
      };
    }

    case "faucetDrip": {
      if (!deps.faucet) throw new Error("No on-chain faucet on this deployment.");
      validAddress(deps.faucet);
      const recipient = validAddress(intent.recipient ?? owner);
      const beforeStep = async () => {
        const status = await readFaucetStatus(client, deps.faucet!, recipient);
        if (!status.ready)
          throw new Error("No test tokens are available for this wallet yet. Check the dispenser status.");
        const senderBalance =
          recipient.toLowerCase() === owner.toLowerCase()
            ? status.nativeBalance
            : await client.getBalance({ address: owner });
        if (senderBalance <= 0n) throw new Error("Add Base Sepolia test ETH to pay the transaction fee.");
      };
      await beforeStep();
      // dripAll skips tokens still on cooldown; an empty successful call is not a claim.
      return {
        beforeStep,
        extract: (receipt) => {
          const drips = parseEventLogs({ abi: tokenFaucetAbi, logs: receipt.logs, eventName: "TokensDripped" });
          if (
            !drips.some(
              (log) =>
                log.address.toLowerCase() === deps.faucet!.toLowerCase() &&
                log.args.recipient.toLowerCase() === recipient.toLowerCase() &&
                log.args.amount > 0n,
            )
          )
            throw new Error("The confirmed transaction sent no test tokens. Refresh dispenser status before retrying.");
          return {};
        },
        steps: [
          {
            label: "Get test tokens",
            address: deps.faucet,
            abi: tokenFaucetAbi as Abi,
            functionName: "dripAll",
            args: [recipient],
          },
        ],
      };
    }
  }
}
