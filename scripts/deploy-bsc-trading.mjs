#!/usr/bin/env node
/** Adds an inventory-funded test-token exchange without changing the existing protection pool. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createPublicClient, http, getAddress, keccak256, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { ROOT, artifact, atomicJson, SequentialDeployment, acquireDeploymentLock } from "./bsc-deployment.mjs";
import { assertPublicManifest, EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";

const SHIELD_INVENTORY = 250n * 10n ** 18n;
const QUOTE_INVENTORY = 250000n * 10n ** 6n;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sha = (value) => createHash("sha256").update(value).digest("hex");
function readEnvironment(broadcast) {
  if (!broadcast) return process.env;
  const file = resolve(ROOT, "contracts/.env.bsc.local");
  if (!existsSync(file)) return process.env;
  execFileSync("git", ["check-ignore", "--quiet", file], { cwd: ROOT });
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) values[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return { ...values, ...process.env };
}
export async function main() {
  assert(
    process.argv.length === 3 && ["--prepare", "--broadcast"].includes(process.argv[2]),
    "Use --prepare or --broadcast",
  );
  const broadcast = process.argv[2] === "--broadcast";
  const env = readEnvironment(broadcast);
  const rpc = env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname), "Public chain only");
  const expected = getAddress(env.BSC_TESTNET_EXPECTED_DEPLOYER ?? EXPECTED_DEPLOYER);
  assert(same(expected, EXPECTED_DEPLOYER), "Unexpected dedicated operator");
  const account = broadcast ? privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY) : { address: expected };
  assert(same(account.address, expected), "Signer mismatch");
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpc, { timeout: 20000, retryCount: 2 }),
    pollingInterval: 1000,
  });
  assert.equal(await client.getChainId(), 97);
  assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
  const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
  const original = JSON.parse(originalRaw);
  assertPublicManifest(original);
  const address = (name) => original.contracts[name].address;
  for (const name of ["TestWBNB", "TestUSDC", "BscScenarioOracle"]) {
    const actual = await client.getCode({ address: address(name) });
    assert(
      actual && same(keccak256(actual), original.contracts[name].runtimeCodehash),
      `${name}: original runtime changed`,
    );
  }
  assert.equal(
    await client.readContract({
      address: address("Factory"),
      abi: artifact("SplitRiskPoolFactory").abi,
      functionName: "isPoolActive",
      args: [original.pool],
    }),
    true,
  );
  const manifestPath = resolve(ROOT, "contracts/deployments/bsc-testnet-trading.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {
        schemaVersion: 1,
        chainId: 97,
        genesisHash: GENESIS,
        deployer: expected,
        sourceManifestHash: sha(originalRaw),
        status: "preparing",
        contracts: {},
        transactions: {},
      };
  for (const [key, value] of [
    ["chainId", 97],
    ["genesisHash", GENESIS],
    ["deployer", expected],
    ["sourceManifestHash", sha(originalRaw)],
  ])
    assert(same(manifest[key], value), `Trading manifest ${key} changed`);
  const recipeHash = sha(
    readFileSync(new URL(import.meta.url)) +
      readFileSync(new URL("./bsc-deployment.mjs", import.meta.url)) +
      sha(originalRaw),
  );
  if (manifest.recipeHash)
    assert.equal(manifest.recipeHash, recipeHash, "Trading recipe changed; reconcile exact saved transactions");
  manifest.recipeHash = recipeHash;
  const release = broadcast ? acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock")) : () => {};
  try {
    const run = new SequentialDeployment({
      client,
      account,
      broadcast,
      manifestPath,
      manifest,
      nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      maxFeePerGas: BigInt(env.BSC_TESTNET_MAX_GAS_PRICE_WEI ?? "5000000000"),
      spendLimit: parseEther("0.02"),
    });
    const exchange = await run.deploy("BscTestExchange", "BscTestExchange", [address("BscScenarioOracle")]);
    await run.write("fund:tWBNB", address("TestWBNB"), "BscTestToken", "transfer", [exchange, SHIELD_INVENTORY]);
    await run.write("fund:TestUSDC", address("TestUSDC"), "BscTestToken", "transfer", [exchange, QUOTE_INVENTORY]);
    if (!broadcast) {
      atomicJson(resolve(ROOT, "contracts/deployments/bsc-testnet-trading-plan.json"), {
        chainId: 97,
        genesisHash: GENESIS,
        sourceManifestHash: manifest.sourceManifestHash,
        operator: expected,
        predictedExchange: exchange,
        transactions: run.plan,
      });
      console.log(
        `Prepared ${run.plan.length} trading transactions. No signatures or broadcast. Exchange: ${exchange}`,
      );
      return;
    }
    for (const [name, fn, args, value] of [
      ["BscTestExchange", "oracle", [], address("BscScenarioOracle")],
      ["BscTestExchange", "quoteToken", [], address("TestUSDC")],
      ["BscTestExchange", "supportedStock", [address("TestWBNB")], true],
      ["BscTestExchange", "feeBps", [], 30n],
      ["BscTestExchange", "maxStockAmount", [], 25n * 10n ** 18n],
      ["BscTestExchange", "maxAssetAmount", [address("TestWBNB")], 25n * 10n ** 18n],
    ])
      await run.expect(exchange, name, fn, args, value);
    for (const [name, minimum] of [
      ["TestWBNB", SHIELD_INVENTORY],
      ["TestUSDC", QUOTE_INVENTORY],
    ]) {
      const balance = await client.readContract({
        address: address(name),
        abi: artifact("BscTestToken").abi,
        functionName: "balanceOf",
        args: [exchange],
      });
      assert(balance >= minimum, `${name}: missing trading inventory`);
    }
    assert.equal(Object.keys(manifest.transactions).length, 3);
    manifest.status = "complete";
    manifest.exchange = exchange;
    manifest.verifiedAt = new Date().toISOString();
    run.save();
    console.log(`Verified BSC Testnet trading exchange: ${exchange}`);
  } finally {
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
