#!/usr/bin/env node
/** Bounded internal operator walkthrough. Synthetic test tokens only; --check never loads a key or writes. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, http, encodeFunctionData, parseEventLogs, parseEther, zeroAddress, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "../packages/adapter-evm/dist/chains.js";
import { CREATION_DEPLOYMENTS, BSC_TESTNET_GENESIS } from "../packages/adapter-evm/dist/creation-deployments.js";
import { CREATION_FIXED } from "../packages/adapter-evm/dist/pool-creation.js";
import { assertCreatedPools } from "../packages/adapter-evm/dist/pool-registry.js";
import { planIntent } from "../packages/adapter-evm/dist/intents.js";
import { splitRiskPoolFactoryAbi } from "../packages/adapter-evm/dist/abis/splitRiskPoolFactory.js";
import { splitRiskPoolAbi } from "../packages/adapter-evm/dist/abis/splitRiskPool.js";
import { shieldReceiptNftAbi } from "../packages/adapter-evm/dist/abis/shieldReceiptNft.js";
import { protectorReceiptNftAbi } from "../packages/adapter-evm/dist/abis/protectorReceiptNft.js";
import { erc721TransferEventAbi } from "../packages/adapter-evm/dist/abis/erc20.js";
import { encodePositionId } from "../packages/adapter-evm/dist/positionId.js";
import {
  ROOT,
  SequentialDeployment,
  acquireDeploymentLock,
  readCanonicalReceipt,
  atomicJson,
} from "./bsc-deployment.mjs";
import { EXPECTED_DEPLOYER } from "./publish-bsc-deployment.mjs";

const BUDGET = parseEther("0.02");
const MAX_FEE = 5_000_000_000n;
const BOND = 500_000_000n;
const FUNDING = 1_000_000_000n;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const json = (value) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const JOURNAL = resolve(ROOT, "contracts/deployments/bsc-testnet-pool-creation-check.json");
const PROOF = resolve(ROOT, "apps/web/public/bsc-pool-creation-proof.json");
const configs = [
  { symbol: "tWBNB", amount: 10n ** 16n, decimals: 18 },
  { symbol: "tvUSDT", amount: 10n ** 9n, decimals: 8 },
].map((config) => {
  const deployment = CREATION_DEPLOYMENTS.find((d) => d.demo.assets.some((a) => a.symbol === config.symbol));
  assert(deployment, `Missing published ${config.symbol} deployment`);
  const asset = deployment.demo.assets.find((a) => a.symbol === config.symbol);
  assert.equal(asset.decimals, config.decimals);
  return { ...config, deployment, asset };
});
const deps = { factory: configs[0].deployment.factory, factories: CREATION_DEPLOYMENTS.map((d) => d.factory) };
const creationParams = (config) => ({
  ...CREATION_FIXED,
  shieldedToken: config.asset.token,
  backingToken: config.deployment.demo.quoteToken,
  commissionRateBp: 700,
  poolFeeBp: 50,
  collateralRatioBp: 17500,
  creationBondAmount: BOND,
});
const call = (to, abi, functionName, args) => ({ to, data: encodeFunctionData({ abi, functionName, args }) });
const stepCall = (step) => call(step.address, step.abi, step.functionName, step.args);

/** All targets and calldata come from compiled pins or a canonically verified creation event. */
function operation(config, kind, pool) {
  const token = kind === "protect" ? config.asset.token : config.deployment.demo.quoteToken;
  const spender = kind === "create" ? config.deployment.factory : pool;
  const amount = kind === "create" ? BOND : kind === "fund" ? FUNDING : config.amount;
  const minReceived = (amount * 995n) / 1000n;
  const intent =
    kind === "create"
      ? { kind: "createPool", params: creationParams(config) }
      : kind === "fund"
        ? { kind: "depositBacking", pool, backingToken: token, amount, minReceived }
        : {
            kind: "depositShielded",
            pool,
            shieldedToken: token,
            backingToken: config.deployment.demo.quoteToken,
            amount,
            minReceived,
          };
  const final =
    kind === "create"
      ? call(spender, splitRiskPoolFactoryAbi, "createPool", [
          config.asset.token,
          config.symbol,
          token,
          "TestUSDC",
          700n,
          50n,
          17500n,
          BOND,
        ])
      : call(spender, splitRiskPoolAbi, kind === "fund" ? "depositBackingAsset" : "depositShieldedAsset", [
          token,
          amount,
          minReceived,
        ]);
  return {
    id: `${config.symbol}:${kind}`,
    kind,
    config,
    pool,
    amount,
    intent,
    final,
    approval: call(token, erc20Abi, "approve", [spender, amount]),
    reset: call(token, erc20Abi, "approve", [spender, 0n]),
  };
}
function validatePlan(saved, op) {
  assert(saved && Array.isArray(saved.steps), `${op.id}: missing persisted plan`);
  const choices = [[op.final], [op.approval, op.final], [op.reset, op.approval, op.final]];
  assert(
    choices.some((steps) => JSON.stringify(steps) === JSON.stringify(saved.steps)),
    `${op.id}: persisted targets/calldata differ from reviewed action`,
  );
}
function validateJournal(journal) {
  assert.equal(journal.schemaVersion, 1);
  assert.equal(journal.chainId, 97);
  assert.equal(journal.genesisHash, BSC_TESTNET_GENESIS);
  assert(same(journal.actor, EXPECTED_DEPLOYER));
  assert.deepEqual(
    journal.scope,
    json(
      configs.map((c) => ({
        symbol: c.symbol,
        factory: c.deployment.factory,
        params: creationParams(c),
        backingAmount: FUNDING,
        protectedAmount: c.amount,
      })),
    ),
  );
  const allowed = new Set(configs.flatMap((c) => ["create", "fund", "protect"].map((kind) => `${c.symbol}:${kind}`)));
  for (const id of Object.keys(journal.operations)) assert(allowed.has(id), `Unexpected operation ${id}`);
  let reservation = 0n;
  for (const [id, entry] of Object.entries(journal.transactions)) {
    const match = id.match(/^(.*):([0-2])$/);
    assert(match && allowed.has(match[1]), "Unexpected transaction id");
    assert(journal.operations[match[1]]?.steps[Number(match[2])], "Transaction has no persisted plan");
    for (let index = 0; index < Number(match[2]); index++)
      assert(journal.transactions[`${match[1]}:${index}`], "Journal has a gap before a submitted transaction");
    assert.equal(entry.request.chainId, 97);
    assert.equal(BigInt(entry.request.value), 0n);
    const gas = BigInt(entry.request.gas),
      fee = BigInt(entry.request.gasPrice);
    assert(gas > 0n && gas <= 16_000_000n && fee >= 0n && fee <= MAX_FEE);
    assert(/^0x[0-9a-f]{64}$/i.test(entry.hash));
    reservation += gas * fee;
  }
  assert(reservation <= BUDGET, "Saved maximum fees exceed 0.02 test BNB");
}

async function verifiedTransaction(client, journal, id, expected) {
  const entry = journal.transactions[id];
  assert(entry, `${id}: transaction missing`);
  assert(same(entry.request.to, expected.to));
  assert.equal(entry.request.data, expected.data);
  const receipt = await readCanonicalReceipt(client, entry.hash, id);
  if (entry.receipt) {
    assert.equal(entry.receipt.transactionHash, entry.hash);
    assert.equal(entry.receipt.blockHash, receipt.blockHash);
    assert.equal(BigInt(entry.receipt.blockNumber), receipt.blockNumber);
  }
  const tx = await client.getTransaction({ hash: entry.hash });
  assert(same(tx.from, EXPECTED_DEPLOYER));
  assert(same(tx.to, expected.to));
  assert.equal(tx.input, expected.data);
  assert.equal(tx.value, 0n);
  assert.equal(tx.chainId, 97);
  assert.equal(tx.nonce, entry.request.nonce);
  assert.equal(tx.gas, BigInt(entry.request.gas));
  assert.equal(tx.gasPrice, BigInt(entry.request.gasPrice));
  return receipt;
}
async function verifyResult(client, op, receipt) {
  if (op.kind === "create") {
    const events = parseEventLogs({
      abi: splitRiskPoolFactoryAbi,
      eventName: "PoolCreated",
      logs: receipt.logs,
      strict: true,
    }).filter((log) => same(log.address, op.config.deployment.factory));
    assert.equal(events.length, 1, "Expected one authentic creation event");
    const e = events[0].args;
    assert(same(e.creator, EXPECTED_DEPLOYER));
    assert(same(e.shieldedToken, op.config.asset.token));
    assert(same(e.backingToken, op.config.deployment.demo.quoteToken));
    assert.equal(e.commissionRate, 700n);
    assert.equal(e.poolFee, 50n);
    assert.equal(e.collateralRatio, 17500n);
    assert(!same(e.poolAddress, zeroAddress));
    const factoryOwner = await client.readContract({
      address: op.config.deployment.factory,
      abi: splitRiskPoolFactoryAbi,
      functionName: "owner",
      blockNumber: receipt.blockNumber,
    });
    assert(!same(factoryOwner, EXPECTED_DEPLOYER), "Walkthrough must demonstrate creation by a non-owner");
    await assertCreatedPools(client, op.config.deployment.factory, [e.poolAddress], receipt.blockNumber);
    const readPool = (functionName) =>
      client.readContract({
        address: e.poolAddress,
        abi: splitRiskPoolAbi,
        functionName,
        blockNumber: receipt.blockNumber,
      });
    const [settings, shieldNft, backingNft] = await Promise.all([
      readPool("poolConfig"),
      readPool("shieldReceiptNFT"),
      readPool("protectorReceiptNFT"),
    ]);
    assert.equal(settings[4], CREATION_FIXED.maxTvlUsd);
    assert.equal(settings[5], BigInt(CREATION_FIXED.minimumPoolTime));
    assert.equal(settings[6], BigInt(CREATION_FIXED.unlockDuration));
    assert.equal(settings[8], BigInt(CREATION_FIXED.protocolFeeBp));
    for (const [address, abi, duration] of [
      [shieldNft, shieldReceiptNftAbi, CREATION_FIXED.shieldTransferLock],
      [backingNft, protectorReceiptNftAbi, CREATION_FIXED.protectorTransferLock],
    ])
      assert.equal(
        await client.readContract({
          address,
          abi,
          functionName: "transferLockPeriod",
          blockNumber: receipt.blockNumber,
        }),
        BigInt(duration),
      );
    return { poolId: e.poolAddress };
  }
  const backing = op.kind === "fund";
  const nft = await client.readContract({
    address: op.pool,
    abi: splitRiskPoolAbi,
    functionName: backing ? "protectorReceiptNFT" : "shieldReceiptNFT",
    blockNumber: receipt.blockNumber,
  });
  const minted = parseEventLogs({
    abi: erc721TransferEventAbi,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: true,
  }).filter(
    (log) => same(log.address, nft) && same(log.args.from, zeroAddress) && same(log.args.to, EXPECTED_DEPLOYER),
  );
  assert.equal(minted.length, 1, "Expected one position receipt for the operator");
  const tokenId = minted[0].args.tokenId;
  const abi = backing ? protectorReceiptNftAbi : shieldReceiptNftAbi;
  const read = (functionName) =>
    client.readContract({ address: nft, abi, functionName, args: [tokenId], blockNumber: receipt.blockNumber });
  const [owner, position] = await Promise.all([read("ownerOf"), read("positions")]);
  assert(same(owner, EXPECTED_DEPLOYER));
  assert.equal(position[0], op.amount, "Receipt-block position does not hold the exact test-token deposit");
  return {
    positionId: encodePositionId(op.pool, backing ? "protector" : "shield", tokenId),
    nft,
    tokenId: tokenId.toString(),
    amount: op.amount.toString(),
  };
}

/** Persist the initial sequence; never regenerate its approval indices after allowance changes. */
async function execute(client, run, journal, op, broadcast) {
  let saved = journal.operations[op.id];
  let plan;
  if (!saved) {
    assert(broadcast, `${op.id}: operation has not been executed`);
    plan = await planIntent(client, EXPECTED_DEPLOYER, deps, op.intent);
    saved = { steps: plan.steps.map(stepCall) };
    validatePlan(saved, op);
    journal.operations[op.id] = saved;
    atomicJson(JOURNAL, journal);
  }
  validatePlan(saved, op);
  let finalReceipt;
  for (let index = 0; index < saved.steps.length; index++) {
    const id = `${op.id}:${index}`,
      expected = saved.steps[index];
    if (broadcast) {
      // Once persisted, an ambiguous submission must resume its exact hash, not replan or duplicate the action.
      let mined = false;
      if (journal.transactions[id]) {
        try {
          await client.getTransactionReceipt({ hash: journal.transactions[id].hash });
          mined = true;
        } catch (error) {
          if (error.name !== "TransactionReceiptNotFoundError") throw error;
        }
      }
      if (!mined) {
        plan ??= await planIntent(client, EXPECTED_DEPLOYER, deps, op.intent);
        await plan.beforeStep?.();
        await client.call({ account: EXPECTED_DEPLOYER, to: expected.to, data: expected.data, value: 0n });
      }
      for (let retry = 0; ; retry++) {
        try {
          await run.transaction(id, expected);
          break;
        } catch (error) {
          if (retry >= 12 || !error.message.includes("ten sealed block confirmations required")) throw error;
          await delay(2000);
        }
      }
    }
    finalReceipt = await verifiedTransaction(client, journal, id, expected);
  }
  const result = await verifyResult(client, op, finalReceipt);
  if (plan) {
    const extracted = plan.extract?.(finalReceipt);
    assert(extracted, "Adapter must extract the created pool or position");
    for (const [key, value] of Object.entries(extracted))
      assert(same(value, result[key]), "Adapter receipt extraction differs from independent verification");
  }
  return {
    ...result,
    transaction: finalReceipt.transactionHash,
    blockNumber: finalReceipt.blockNumber.toString(),
    blockHash: finalReceipt.blockHash,
  };
}

export async function main() {
  assert(
    process.argv.length === 3 && ["--broadcast", "--check"].includes(process.argv[2]),
    "Use --broadcast or --check",
  );
  const broadcast = process.argv[2] === "--broadcast";
  const env = { ...process.env };
  const envPath = resolve(ROOT, "contracts/.env.bsc.local");
  if (broadcast && existsSync(envPath)) {
    execFileSync("git", ["check-ignore", "--quiet", envPath], { cwd: ROOT });
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const rpc = new URL(env.BSC_TESTNET_RPC_URL ?? bscTestnet.rpcUrls.default.http[0]);
  assert(
    rpc.protocol === "https:" &&
      !rpc.username &&
      !rpc.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname),
    "Use public HTTPS BSC Testnet RPC",
  );
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpc.href, { timeout: 20000, retryCount: 2 }),
    batch: { multicall: true },
  });
  assert.equal(await client.getChainId(), 97);
  assert.equal((await client.getBlock({ blockNumber: 0n })).hash, BSC_TESTNET_GENESIS);
  const release = broadcast ? acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock")) : () => {};
  try {
    assert(broadcast || existsSync(JOURNAL), "No saved walkthrough; run authorized broadcast first");
    const journal = existsSync(JOURNAL)
      ? JSON.parse(readFileSync(JOURNAL, "utf8"))
      : {
          schemaVersion: 1,
          chainId: 97,
          genesisHash: BSC_TESTNET_GENESIS,
          actor: EXPECTED_DEPLOYER,
          scope: json(
            configs.map((c) => ({
              symbol: c.symbol,
              factory: c.deployment.factory,
              params: creationParams(c),
              backingAmount: FUNDING,
              protectedAmount: c.amount,
            })),
          ),
          operations: {},
          transactions: {},
        };
    validateJournal(journal);
    let run;
    if (broadcast) {
      assert(
        /^0x[0-9a-f]{64}$/i.test(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY ?? ""),
        "Dedicated operator key missing or invalid",
      );
      const account = privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY);
      assert(same(account.address, EXPECTED_DEPLOYER), "Wrong dedicated operator");
      run = new SequentialDeployment({
        client,
        account,
        broadcast: true,
        manifestPath: JOURNAL,
        manifest: journal,
        maxFeePerGas: MAX_FEE,
        spendLimit: BUDGET,
      });
    }
    const pools = [];
    for (const config of configs) {
      const created = await execute(client, run, journal, operation(config, "create"), broadcast);
      const funding = await execute(client, run, journal, operation(config, "fund", created.poolId), broadcast);
      const protectedPosition = await execute(
        client,
        run,
        journal,
        operation(config, "protect", created.poolId),
        broadcast,
      );
      await assertCreatedPools(
        client,
        config.deployment.factory,
        [created.poolId],
        (await client.getBlock({ blockTag: "latest" })).number,
      );
      pools.push({
        symbol: config.symbol,
        factory: config.deployment.factory,
        parameters: json(creationParams(config)),
        created,
        funding,
        protectedPosition,
      });
    }
    validateJournal(journal);
    assert.equal(Object.keys(journal.operations).length, 6);
    assert.equal(new Set(pools.map((p) => p.created.poolId.toLowerCase())).size, 2);
    const proof = {
      schemaVersion: 1,
      chainId: 97,
      genesisHash: BSC_TESTNET_GENESIS,
      status: "complete",
      actor: EXPECTED_DEPLOYER,
      scope:
        "Internal operator walkthrough through adapter plans. Two synthetic test-token pools created, funded and used; not a third-party audit. Test tokens have no real value.",
      limitations:
        "Position ownership and exact deposit amounts are verified at each canonical receipt block. This does not promise current balances, availability, yield or safety.",
      maximumFeeBudgetWei: BUDGET.toString(),
      pools,
      transactions: Object.entries(journal.transactions).map(([id, t]) => ({
        id,
        hash: t.hash,
        explorerUrl: `https://testnet.bscscan.com/tx/${t.hash}`,
      })),
    };
    if (broadcast) {
      journal.status = "complete";
      atomicJson(JOURNAL, journal);
      atomicJson(PROOF, proof);
    } else {
      assert(existsSync(PROOF), "Public proof missing");
      assert.deepEqual(JSON.parse(readFileSync(PROOF, "utf8")), proof, "Public proof differs from canonical evidence");
    }
    console.log("Verified two internal test-token pool creations, backing deposits and protected positions.");
  } finally {
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    // Do not serialize RPC errors, environment, transaction payloads or signing material.
    let archiveUnavailable = false;
    for (let cause = error, depth = 0; cause && depth < 8; cause = cause.cause, depth++)
      if (/missing trie node|historical state.*unavailable/i.test(cause.message ?? "")) archiveUnavailable = true;
    console.error(
      archiveUnavailable
        ? "Historical state is unavailable from this RPC. Set BSC_TESTNET_RPC_URL to an archive-capable BSC Testnet endpoint and recheck the saved journal; do not create replacement pools."
        : error.name === "AssertionError"
          ? error.message
          : `Pool creation check stopped (${error.name ?? "Error"}). Reconcile the saved journal before retrying.`,
    );
    process.exitCode = 1;
  });
