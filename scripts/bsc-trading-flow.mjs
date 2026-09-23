#!/usr/bin/env node
/** Operator walkthrough: buy test tokens, protect one, then sell another. No real assets. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  http,
  parseEther,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import {
  planIntent,
  readCanonicalStepReceipt,
  readDemoMarket,
  readDemoTradeQuote,
} from "../packages/adapter-evm/dist/index.js";
import { ROOT, artifact, atomicJson, SequentialDeployment, acquireDeploymentLock } from "./bsc-deployment.mjs";
import { assertPublicManifest, EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
import { assertTradingManifest } from "./verify-bsc-trading.mjs";

assert.deepEqual(process.argv.slice(2), ["--broadcast"], "Operator walkthrough requires explicit --broadcast");
const envPath = resolve(ROOT, "contracts/.env.bsc.local");
if (existsSync(envPath))
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
const original = JSON.parse(originalRaw);
const trading = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-trading.json")));
assertPublicManifest(original);
assertTradingManifest(trading, original, originalRaw);
const account = privateKeyToAccount(process.env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address.toLowerCase(), EXPECTED_DEPLOYER.toLowerCase());
const rpc = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname));
const client = createPublicClient({ chain: bscTestnet, transport: http(rpc, { timeout: 20000, retryCount: 2 }) });
assert.equal(await client.getChainId(), 97);
assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
const address = (name) => original.contracts[name].address;
const asset = address("TestWBNB"),
  quoteToken = address("TestUSDC"),
  pool = original.pool;
const factory = address("Factory"),
  exchange = trading.exchange;
const market = await readDemoMarket(client);
assert.equal(market.exchange.toLowerCase(), exchange.toLowerCase());
assert.equal(market.assets[0].token.toLowerCase(), asset.toLowerCase());
const journalPath = resolve(ROOT, "contracts/deployments/bsc-testnet-trading-flow.json");
const journal = existsSync(journalPath)
  ? JSON.parse(readFileSync(journalPath))
  : {
      schemaVersion: 1,
      scope: "Operator BSC Testnet trade-to-protection walkthrough; valueless synthetic tokens",
      chainId: 97,
      genesisHash: GENESIS,
      actor: account.address,
      exchange,
      pool,
      status: "running",
      stages: {},
      transactions: {},
    };
assert.equal(journal.actor.toLowerCase(), account.address.toLowerCase());
assert.equal(journal.exchange.toLowerCase(), exchange.toLowerCase());
assert.equal(journal.pool.toLowerCase(), pool.toLowerCase());
assert.equal(journal.genesisHash, GENESIS);
const save = () => atomicJson(journalPath, journal);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock"));
const run = new SequentialDeployment({
  client,
  account,
  broadcast: true,
  manifestPath: journalPath,
  manifest: journal,
  maxFeePerGas: 5_000_000_000n,
  spendLimit: parseEther("0.02"),
});
const balance = (token) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const allowance = (token, spender) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account.address, spender] });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sealed(id, to, data, abi) {
  let receipt;
  for (let retry = 0; ; retry++) {
    try {
      receipt = await run.transaction(id, { to, data });
      break;
    } catch (error) {
      if (retry >= 12 || !error.message.includes("ten sealed block confirmations required")) throw error;
      await delay(5000);
    }
  }
  const decoded = decodeFunctionData({ abi, data });
  return readCanonicalStepReceipt(
    client,
    receipt.transactionHash,
    account.address,
    {
      address: to,
      abi,
      functionName: decoded.functionName,
      args: decoded.args,
    },
    97,
  );
}

async function approve(id, token, spender, amount) {
  if (journal.stages[id]?.complete) return;
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
  await sealed(id, token, data, erc20Abi);
  assert((await allowance(token, spender)) >= amount, `${id}: allowance not confirmed`);
  journal.stages[id] = {
    complete: true,
    token,
    spender,
    amount: amount.toString(),
    hash: journal.transactions[id].hash,
  };
  save();
  console.log(`Verified ${id}: ${journal.transactions[id].hash}`);
}

async function trade(id, side, amount) {
  if (journal.stages[id]?.complete) return;
  let stage = journal.stages[id];
  const old = journal.transactions[id];
  if (!old) {
    const fresh = await readDemoTradeQuote(client, { asset, side, amount, owner: account.address });
    const limit = side === "buy" ? (fresh.inputAmount * 110n + 99n) / 100n : (fresh.outputAmount * 90n) / 100n;
    const intent = {
      kind: "demoTrade",
      asset,
      side,
      amount,
      limit,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 150),
    };
    const plan = await planIntent(client, account.address, { factory }, intent);
    assert.equal(plan.steps.length, 1, `${id}: test-token approval is missing`);
    const step = plan.steps[0];
    assert.equal(step.functionName, "swap");
    await plan.beforeStep?.();
    await client.simulateContract({ ...step, account: account.address });
    stage = {
      side,
      amount: amount.toString(),
      limit: limit.toString(),
      deadline: intent.deadline.toString(),
      beforeAsset: String(await balance(asset)),
      beforeQuote: String(await balance(quoteToken)),
      to: step.address,
      data: encodeFunctionData(step),
    };
    journal.stages[id] = stage;
    save();
  }
  assert(stage && stage.side === side && stage.amount === amount.toString());
  const to = old?.request.to ?? stage.to,
    data = old?.request.data ?? stage.data;
  assert.equal(to.toLowerCase(), exchange.toLowerCase());
  const receipt = await sealed(id, to, data, artifact("BscTestExchange").abi);
  const events = parseEventLogs({
    abi: artifact("BscTestExchange").abi,
    logs: receipt.logs,
    eventName: "Swapped",
  }).filter((event) => event.address.toLowerCase() === exchange.toLowerCase());
  assert.equal(events.length, 1, `${id}: no unique exchange trade`);
  const swap = events[0].args;
  assert.equal(swap.trader.toLowerCase(), account.address.toLowerCase());
  assert.equal(swap.stock.toLowerCase(), asset.toLowerCase());
  assert.equal(swap.buy, side === "buy");
  assert.equal(swap.stockAmount, amount);
  assert(
    swap.usdcAmount > 0n &&
      (side === "buy" ? swap.usdcAmount <= BigInt(stage.limit) : swap.usdcAmount >= BigInt(stage.limit)),
  );
  const assetDelta = (await balance(asset)) - BigInt(stage.beforeAsset);
  const quoteDelta = (await balance(quoteToken)) - BigInt(stage.beforeQuote);
  assert.equal(assetDelta, side === "buy" ? amount : -amount);
  assert.equal(quoteDelta, side === "buy" ? -swap.usdcAmount : swap.usdcAmount);
  Object.assign(stage, { complete: true, hash: receipt.transactionHash, settledQuote: swap.usdcAmount.toString() });
  save();
  console.log(`Verified ${id}: ${receipt.transactionHash}`);
}

async function protect(id, amount) {
  if (journal.stages[id]?.complete) return;
  let stage = journal.stages[id];
  const old = journal.transactions[id];
  if (!old) {
    const intent = {
      kind: "depositShielded",
      pool,
      shieldedToken: asset,
      backingToken: quoteToken,
      amount,
      minReceived: (amount * 99n) / 100n,
    };
    const plan = await planIntent(client, account.address, { factory }, intent);
    assert.equal(plan.steps.length, 1, `${id}: pool approval is missing`);
    const step = plan.steps[0];
    assert.equal(step.functionName, "depositShieldedAsset");
    await plan.beforeStep?.();
    await client.simulateContract({ ...step, account: account.address });
    stage = {
      amount: amount.toString(),
      beforeAsset: String(await balance(asset)),
      to: step.address,
      data: encodeFunctionData(step),
    };
    journal.stages[id] = stage;
    save();
  }
  assert(stage && stage.amount === amount.toString());
  const to = old?.request.to ?? stage.to,
    data = old?.request.data ?? stage.data;
  assert.equal(to.toLowerCase(), pool.toLowerCase());
  const receipt = await sealed(id, to, data, artifact("SplitRiskPool").abi);
  const nft = address("ShieldReceiptNFT");
  const minted = parseEventLogs({ abi: erc721Abi, logs: receipt.logs, eventName: "Transfer" }).filter(
    (event) =>
      event.address.toLowerCase() === nft.toLowerCase() &&
      event.args.from === zeroAddress &&
      event.args.to.toLowerCase() === account.address.toLowerCase(),
  );
  assert.equal(minted.length, 1, `${id}: no owned protection receipt`);
  assert.equal((await balance(asset)) - BigInt(stage.beforeAsset), -amount);
  Object.assign(stage, {
    complete: true,
    hash: receipt.transactionHash,
    positionId: `${pool}-s-${minted[0].args.tokenId}`,
  });
  save();
  console.log(`Verified ${id}: ${receipt.transactionHash} ${stage.positionId}`);
}

try {
  if (!journal.transactions["buy:two"] && !journal.stages["buy:two"]?.complete)
    assert((await balance(quoteToken)) >= 2_000n * 10n ** 6n, "Need 2,000 valueless TestUSDC for demo");
  await approve("approve:buy", quoteToken, exchange, 2_000n * 10n ** 6n);
  await trade("buy:two", "buy", 2n * 10n ** 18n);
  await approve("approve:protect", asset, pool, 1n * 10n ** 18n);
  await protect("protect:one", 1n * 10n ** 18n);
  await approve("approve:sell", asset, exchange, 5n * 10n ** 17n);
  await trade("sell:half", "sell", 5n * 10n ** 17n);
  journal.status = "complete";
  journal.completedAt = new Date().toISOString();
  save();
  console.log("BSC Testnet buy → protect → sell walkthrough complete.");
} finally {
  release();
}
