#!/usr/bin/env node
/** End-to-end execution using the website's planner and canonical receipt verifier. LOCAL ONLY. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, erc20Abi } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { createEvmAdapter, planIntent, readCanonicalStepReceipt } from "../packages/adapter-evm/dist/index.js";
import { artifact, atomicJson } from "./bsc-deployment.mjs";
const rpc = process.env.BSC_TESTNET_RPC_URL ?? "http://127.0.0.1:8597";
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpc).hostname),
  "Local rehearsal must never sign on a public network",
);
const manifest = JSON.parse(readFileSync(new URL("../artifacts/local/bsc-deployment.json", import.meta.url)));
assert.equal(manifest.local, true);
assert.equal(manifest.status, "complete");
// Publicly known development account; never read a real deployment secret in this harness.
const account = mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex: 2 });
const client = createPublicClient({ chain: bscTestnet, transport: http(rpc), pollingInterval: 100 });
const wallet = createWalletClient({ account, chain: bscTestnet, transport: http(rpc) });
assert.equal(await client.getChainId(), 97);
assert.equal((await client.getBlock({ blockNumber: 0n })).hash, manifest.genesisHash);
const addr = (name) => manifest.contracts[name].address;
const adapter = createEvmAdapter({
  chain: bscTestnet,
  rpcUrl: rpc,
  factory: addr("Factory"),
  compositeOracle: addr("CompositeOracle"),
  faucetAddress: addr("Faucet"),
});
const multi = adapter.publicClient.multicall;
adapter.publicClient.multicall = (args) => multi({ ...args, deployless: true });
const pool = manifest.pool,
  shieldedToken = addr("TestWBNB"),
  backingToken = addr("TestUSDC");
const deps = { factory: addr("Factory"), faucet: addr("Faucet") };
const evidence = [];
const realNow = Date.now;
async function alignTestClock() {
  const block = await client.getBlock({ blockTag: "latest" });
  const origin = realNow();
  Date.now = () => Number(block.timestamp) * 1000 + 10000 + (realNow() - origin);
}
const snapshot = await client.request({ method: "evm_snapshot" });
await alignTestClock();
async function send(intent) {
  await alignTestClock();
  const plan = await planIntent(adapter.publicClient, account.address, deps, intent);
  let receipt;
  for (const step of plan.steps) {
    await alignTestClock();
    await plan.beforeStep?.();
    await client.simulateContract({ ...step, account: account.address });
    const hash = await wallet.writeContract({ ...step, chain: bscTestnet, account });
    await client.waitForTransactionReceipt({ hash, confirmations: 2, checkReplacement: false, pollingInterval: 100 });
    receipt = await readCanonicalStepReceipt(client, hash, account.address, step, 97);
    evidence.push({
      action: intent.kind,
      step: step.label,
      hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
    });
  }
  assert(receipt);
  const result = { txId: receipt.transactionHash, ...plan.extract?.(receipt) };
  console.log(`Verified ${intent.kind}: ${result.positionId ?? result.txId}`);
  return result;
}
const balance = (token) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
try {
  await send({ kind: "faucetDrip", recipient: account.address });
  assert.equal(await balance(shieldedToken), 5n * 10n ** 18n);
  assert.equal(await balance(backingToken), 10000n * 10n ** 6n);
  const backing = await send({
    kind: "depositBacking",
    pool,
    backingToken,
    amount: 1000n * 10n ** 6n,
    minReceived: 1000n * 10n ** 6n,
  });
  assert(backing.positionId);
  const first = await send({
    kind: "depositShielded",
    pool,
    shieldedToken,
    backingToken,
    amount: 10n ** 18n,
    minReceived: 10n ** 18n,
  });
  assert(first.positionId);
  const beforeToken = await balance(shieldedToken);
  await send({ kind: "withdrawShielded", pool, shieldedToken, position: first.positionId, minOut: 98n * 10n ** 16n });
  assert((await balance(shieldedToken)) > beforeToken);
  const epoch = await client.readContract({
    address: addr("BscScenarioOracle"),
    abi: artifact("BscScenarioOracle").abi,
    functionName: "epoch",
  });
  const initial = (await client.getBlock({ blockTag: "latest" })).timestamp;
  await client.request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(epoch + ((initial - epoch) / 240n + 1n) * 240n)],
  });
  await client.request({ method: "evm_mine" });
  await alignTestClock();
  const second = await send({
    kind: "depositShielded",
    pool,
    shieldedToken,
    backingToken,
    amount: 10n ** 18n,
    minReceived: 10n ** 18n,
  });
  assert(second.positionId);
  const now = (await client.getBlock({ blockTag: "latest" })).timestamp;
  const low = epoch + ((now - epoch) / 240n + 1n) * 240n + 180n;
  // Only a local chain can advance time. Production UI waits for real block timestamps.
  await client.request({ method: "evm_setNextBlockTimestamp", params: [Number(low)] });
  await client.request({ method: "evm_mine" });
  await alignTestClock();
  const quote = await adapter.reader.getProtectedExitQuote(second.positionId);
  assert(quote.amount > 0n);
  const beforeUsd = await balance(backingToken);
  await send({
    kind: "activateShielded",
    pool,
    shieldedToken,
    backingToken,
    position: second.positionId,
    minOut: (quote.amount * 99n) / 100n,
  });
  assert((await balance(backingToken)) > beforeUsd);
  await send({ kind: "startUnlock", position: backing.positionId });
  await client.request({ method: "evm_increaseTime", params: [121] });
  await client.request({ method: "evm_mine" });
  await alignTestClock();
  await send({ kind: "withdrawProtector", pool, backingToken, position: backing.positionId, minOut: 900n * 10n ** 6n });
  atomicJson(new URL("../artifacts/local/bsc-flow-evidence.json", import.meta.url).pathname, {
    scope: "local only",
    chainId: 97,
    actor: account.address,
    pool,
    actions: evidence,
  });
  console.log(`Local full flow passed: ${evidence.length} canonical transactions. No real assets.`);
} finally {
  Date.now = realNow;
  await client.request({ method: "evm_revert", params: [snapshot] });
}
