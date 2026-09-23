#!/usr/bin/env node
/** Independent, read-only proof of the public trading extension; no signer is loaded. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  http,
  encodeDeployData,
  encodeFunctionData,
  isAddress,
  keccak256,
  zeroAddress,
} from "viem";
import { bscTestnet } from "viem/chains";
import { ROOT, artifact, assertRuntimeMatches, readCanonicalReceipt } from "./bsc-deployment.mjs";
import { assertPublicManifest, EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const path = resolve(ROOT, "contracts/deployments/bsc-testnet-trading.json");
export function assertTradingManifest(m, original, originalRaw) {
  assertPublicManifest(original);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.chainId, 97);
  assert.equal(m.genesisHash, GENESIS);
  assert(same(m.deployer, EXPECTED_DEPLOYER));
  assert.equal(m.sourceManifestHash, sha(originalRaw), "Original deployed proof changed");
  assert.equal(m.status, "complete");
  assert(isAddress(m.exchange) && !same(m.exchange, zeroAddress));
  assert.equal(Object.keys(m.transactions ?? {}).length, 3);
  assert.deepEqual(
    Object.keys(m.transactions).sort(),
    ["deploy:BscTestExchange", "fund:TestUSDC", "fund:tWBNB"].sort(),
  );
  const deployed = m.contracts?.BscTestExchange;
  assert(deployed && same(deployed.address, m.exchange));
  assert.equal(deployed.artifact, "BscTestExchange");
  assert.equal(deployed.constructorArguments?.length, 1);
  assert(same(deployed.constructorArguments[0], original.contracts.BscScenarioOracle.address));
  assert(/^0x[\da-f]{64}$/i.test(deployed.runtimeCodehash));
  assert.equal(deployed.txHash, m.transactions["deploy:BscTestExchange"].hash);
  for (const [id, transaction] of Object.entries(m.transactions)) {
    assert.equal(transaction.status, "confirmed", `${id}: not confirmed`);
    assert.equal(transaction.request?.chainId, 97);
    assert.equal(transaction.hash, transaction.receipt?.transactionHash);
    assert(BigInt(transaction.receipt?.blockNumber ?? 0) > 0n);
    assert(/^0x[\da-f]{64}$/i.test(transaction.receipt?.blockHash ?? ""));
  }
}
export async function main() {
  assert.deepEqual(process.argv.slice(2), ["--check"], "Use --check");
  const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
  const original = JSON.parse(originalRaw);
  const m = JSON.parse(readFileSync(path, "utf8"));
  assertTradingManifest(m, original, originalRaw);
  const rpc = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname));
  const client = createPublicClient({ chain: bscTestnet, transport: http(rpc, { timeout: 20000, retryCount: 2 }) });
  assert.equal(await client.getChainId(), 97);
  assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
  const address = (name) => original.contracts[name].address;
  const a = artifact("BscTestExchange");
  const tx = m.transactions;
  const expectedData = {
    "deploy:BscTestExchange": encodeDeployData({
      abi: a.abi,
      bytecode: a.bytecode.object,
      args: [address("BscScenarioOracle")],
    }),
    "fund:tWBNB": encodeFunctionData({
      abi: artifact("BscTestToken").abi,
      functionName: "transfer",
      args: [m.exchange, 250n * 10n ** 18n],
    }),
    "fund:TestUSDC": encodeFunctionData({
      abi: artifact("BscTestToken").abi,
      functionName: "transfer",
      args: [m.exchange, 250000n * 10n ** 6n],
    }),
  };
  for (const [id, t] of Object.entries(tx)) {
    const r = await readCanonicalReceipt(client, t.hash, id);
    assert.equal(r.blockHash, t.receipt.blockHash);
    assert.equal(r.blockNumber, BigInt(t.receipt.blockNumber));
    const actual = await client.getTransaction({ hash: t.hash });
    assert(same(actual.from, EXPECTED_DEPLOYER));
    const target =
      id === "deploy:BscTestExchange" ? null : id === "fund:tWBNB" ? address("TestWBNB") : address("TestUSDC");
    assert(same(actual.to ?? zeroAddress, target ?? zeroAddress));
    assert.equal(actual.chainId, 97);
    assert.equal(actual.value, 0n);
    assert.equal(actual.input, expectedData[id]);
    assert.equal(t.request.data, expectedData[id]);
  }
  assert(same(tx["deploy:BscTestExchange"].receipt.contractAddress, m.exchange));
  const code = await client.getCode({ address: m.exchange });
  assert(code && code !== "0x");
  assert.equal(keccak256(code), m.contracts.BscTestExchange.runtimeCodehash);
  assertRuntimeMatches(a, code, m.exchange, {});
  for (const [contract, expected] of [
    ["BscScenarioOracle", address("BscScenarioOracle")],
    ["TestWBNB", address("TestWBNB")],
    ["TestUSDC", address("TestUSDC")],
  ]) {
    const runtime = await client.getCode({ address: expected });
    assert(
      runtime && same(keccak256(runtime), original.contracts[contract].runtimeCodehash),
      `${contract}: changed runtime`,
    );
  }
  const read = (address_, abi, functionName, args = []) =>
    client.readContract({ address: address_, abi, functionName, args });
  const exchange = m.exchange;
  for (const [fn, args, expected] of [
    ["oracle", [], address("BscScenarioOracle")],
    ["quoteToken", [], address("TestUSDC")],
    ["assetToken", [], address("TestWBNB")],
    ["supportedStock", [address("TestWBNB")], true],
    ["feeBps", [], 30n],
    ["maxStockAmount", [], 25n * 10n ** 18n],
    ["maxAssetAmount", [address("TestWBNB")], 25n * 10n ** 18n],
  ])
    assert.deepEqual(await read(exchange, a.abi, fn, args), expected, `${fn}: changed exchange binding`);
  for (const name of ["TestWBNB", "TestUSDC"]) {
    const balance = await read(address(name), artifact("BscTestToken").abi, "balanceOf", [exchange]);
    assert(balance > 0n, `${name}: trading inventory exhausted`);
  }
  const evidence = {
    chainId: 97,
    exchange,
    exchangeCodehash: keccak256(code),
    oracle: address("BscScenarioOracle"),
    oracleCodehash: original.contracts.BscScenarioOracle.runtimeCodehash,
    quoteToken: address("TestUSDC"),
    quoteTokenCodehash: original.contracts.TestUSDC.runtimeCodehash,
    asset: address("TestWBNB"),
    assetCodehash: original.contracts.TestWBNB.runtimeCodehash,
    assetSymbol: "tWBNB",
    assetDecimals: 18,
    quoteSymbol: "TestUSDC",
    quoteDecimals: 6,
    receipts: Object.fromEntries(Object.entries(tx).map(([id, t]) => [id, t.hash])),
  };
  console.log(JSON.stringify(evidence, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.shortMessage ?? e.message);
    process.exitCode = 1;
  });
