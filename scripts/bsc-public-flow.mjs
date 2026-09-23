#!/usr/bin/env node
/** Operator-run public testnet walkthrough using the web planner. No real assets; explicit --broadcast. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionData,
  parseEventLogs,
  erc20Abi,
  erc721Abi,
  zeroAddress,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { createEvmAdapter, planIntent, readCanonicalStepReceipt } from "../packages/adapter-evm/dist/index.js";
import { ROOT, artifact, atomicJson, SequentialDeployment, acquireDeploymentLock } from "./bsc-deployment.mjs";
import { assertPublicManifest, EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
assert.deepEqual(process.argv.slice(2), ["--broadcast"], "Public walkthrough requires explicit --broadcast");
const envPath = resolve(ROOT, "contracts/.env.bsc.local");
if (existsSync(envPath))
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
const deployment = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json")));
assertPublicManifest(deployment);
const account = privateKeyToAccount(process.env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address.toLowerCase(), EXPECTED_DEPLOYER.toLowerCase());
const rpc = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname));
const client = createPublicClient({ chain: bscTestnet, transport: http(rpc, { timeout: 20000, retryCount: 2 }) });
assert.equal(await client.getChainId(), 97);
assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
const path = resolve(ROOT, "contracts/deployments/bsc-testnet-flow.json");
const journal = existsSync(path)
  ? JSON.parse(readFileSync(path))
  : {
      schemaVersion: 1,
      scope: "Public BSC Testnet operator walkthrough; not external users",
      chainId: 97,
      genesisHash: GENESIS,
      actor: account.address,
      pool: deployment.pool,
      status: "running",
      stages: {},
      transactions: {},
    };
assert.equal(journal.actor, account.address);
assert.equal(journal.pool, deployment.pool);
assert.equal(journal.genesisHash, GENESIS);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock"));
const addr = (name) => deployment.contracts[name].address;
const pool = deployment.pool,
  shieldedToken = addr("TestWBNB"),
  backingToken = addr("TestUSDC");
const adapter = createEvmAdapter({
  chain: bscTestnet,
  rpcUrl: rpc,
  factory: addr("Factory"),
  compositeOracle: addr("CompositeOracle"),
  faucetAddress: addr("Faucet"),
});
const deps = { factory: addr("Factory"), faucet: addr("Faucet") };
const run = new SequentialDeployment({
  client,
  account,
  broadcast: true,
  manifestPath: path,
  manifest: journal,
  maxFeePerGas: 1000000000n,
  spendLimit: parseEther("0.01"),
});
const save = () => atomicJson(path, journal);
const balance = (token) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestamp = async () => (await client.getBlock({ blockTag: "latest" })).timestamp;
async function action(id, intent, outputToken, minIncrease = 1n) {
  let stage = journal.stages[id];
  if (stage?.complete) return stage;
  if (!stage) {
    const plan = await planIntent(adapter.publicClient, account.address, deps, intent);
    stage = journal.stages[id] = {
      kind: intent.kind,
      outputToken,
      balanceBefore: outputToken ? String(await balance(outputToken)) : null,
      steps: plan.steps.map((s) => ({ label: s.label, to: s.address, data: encodeFunctionData(s), abi: s.abi })),
    };
    save();
  }
  let receipt;
  for (const [i, step] of stage.steps.entries()) {
    const transactionId = id + ":" + i;
    if (!journal.transactions[transactionId]) {
      const fresh = await planIntent(adapter.publicClient, account.address, deps, intent);
      const expected = fresh.steps.find(
        (s) => s.address.toLowerCase() === step.to.toLowerCase() && encodeFunctionData(s) === step.data,
      );
      assert(expected, `${id}: fresh planner no longer supports saved step`);
      await fresh.beforeStep?.();
      await client.simulateContract({ ...expected, account: account.address });
    }
    for (let retry = 0; ; retry++) {
      try {
        await run.transaction(transactionId, { to: step.to, data: step.data });
        break;
      } catch (e) {
        if (retry >= 12 || !e.message.includes("ten sealed block confirmations required")) throw e;
        await delay(5000);
      }
    }
    const decoded = decodeFunctionData({ abi: step.abi, data: step.data });
    receipt = await readCanonicalStepReceipt(
      client,
      journal.transactions[transactionId].hash,
      account.address,
      { address: step.to, abi: step.abi, ...decoded },
      97,
    );
  }
  assert(receipt);
  if (intent.kind === "depositShielded" || intent.kind === "depositBacking") {
    const side = intent.kind === "depositShielded" ? "s" : "p";
    const nft = addr(side === "s" ? "ShieldReceiptNFT" : "ProtectorReceiptNFT");
    const events = parseEventLogs({ abi: erc721Abi, eventName: "Transfer", logs: receipt.logs }).filter(
      (e) =>
        e.address.toLowerCase() === nft.toLowerCase() &&
        e.args.from === zeroAddress &&
        e.args.to.toLowerCase() === account.address.toLowerCase(),
    );
    assert.equal(events.length, 1, "Expected one owned receipt NFT");
    stage.positionId = `${pool}-${side}-${events[0].args.tokenId}`;
  }
  if (outputToken) {
    stage.balanceAfter = String(await balance(outputToken));
    assert(
      BigInt(stage.balanceAfter) - BigInt(stage.balanceBefore) >= minIncrease,
      `${id}: output balance did not increase enough`,
    );
  }
  stage.blockTimestamp = String((await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp);
  stage.complete = true;
  stage.completedAt = new Date().toISOString();
  save();
  console.log(`Public walkthrough verified: ${id}${stage.positionId ? " " + stage.positionId : ""}`);
  return stage;
}
async function waitFor(label, predicate) {
  const start = Date.now();
  while (!(await predicate())) {
    assert(Date.now() - start < 8 * 60 * 1000, `${label}: timed out; resume saved walkthrough`);
    console.log(`Waiting on real testnet time: ${label}`);
    await delay(12000);
  }
}
try {
  await action("faucet", { kind: "faucetDrip", recipient: account.address }, shieldedToken, 5n * 10n ** 18n);
  const backing = await action("backing", {
    kind: "depositBacking",
    pool,
    backingToken,
    amount: 1000n * 10n ** 6n,
    minReceived: 1000n * 10n ** 6n,
  });
  const first = await action("shield-normal", {
    kind: "depositShielded",
    pool,
    shieldedToken,
    backingToken,
    amount: 10n ** 18n,
    minReceived: 10n ** 18n,
  });
  await action(
    "withdraw-normal",
    { kind: "withdrawShielded", pool, shieldedToken, position: first.positionId, minOut: 90n * 10n ** 16n },
    shieldedToken,
    90n * 10n ** 16n,
  );
  const epoch = await client.readContract({
    address: addr("BscScenarioOracle"),
    abi: artifact("BscScenarioOracle").abi,
    functionName: "epoch",
  });
  if (!journal.stages["shield-protected"])
    await waitFor("baseline entry", async () => ((await timestamp()) - epoch) % 240n < 40n);
  const second = await action("shield-protected", {
    kind: "depositShielded",
    pool,
    shieldedToken,
    backingToken,
    amount: 10n ** 18n,
    minReceived: 10n ** 18n,
  });
  if (!journal.stages["withdraw-protected"])
    await waitFor("eligible loss scenario", async () => {
      const now = await timestamp(),
        phase = (now - epoch) % 240n;
      return now >= BigInt(second.blockTimestamp) + 65n && phase >= 180n && phase < 215n;
    });
  // The low-price part of the synthetic cycle provides time for a conservative quote and submission.
  // Saved transaction calldata stays authoritative when resuming a submitted action.
  if (!journal.protectedMinOut) {
    const quote = await adapter.reader.getProtectedExitQuote(second.positionId);
    assert(quote.amount > 0n);
    journal.protectedMinOut = String((quote.amount * 99n) / 100n);
    save();
  }
  await action(
    "withdraw-protected",
    {
      kind: "activateShielded",
      pool,
      shieldedToken,
      backingToken,
      position: second.positionId,
      minOut: BigInt(journal.protectedMinOut),
    },
    backingToken,
  );
  const unlock = await action("unlock", { kind: "startUnlock", position: backing.positionId });
  if (!journal.stages["withdraw-backing"]?.complete)
    await waitFor(
      "two-minute collateral unlock",
      async () => (await timestamp()) >= BigInt(unlock.blockTimestamp) + 121n,
    );
  await action(
    "withdraw-backing",
    { kind: "withdrawProtector", pool, backingToken, position: backing.positionId, minOut: 900n * 10n ** 6n },
    backingToken,
    900n * 10n ** 6n,
  );
  journal.status = "complete";
  journal.completedAt = new Date().toISOString();
  save();
  console.log(
    `Public flow complete: ${Object.keys(journal.transactions).length} canonical transactions, all positions closed.`,
  );
} finally {
  release();
}
