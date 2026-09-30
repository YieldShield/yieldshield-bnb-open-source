#!/usr/bin/env node
/** Independent read-only verification. --write publishes only trimmed public proof, never a signer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  http,
  getAddress,
  encodeDeployData,
  encodeFunctionData,
  keccak256,
  isAddress,
  zeroAddress,
  zeroHash,
} from "viem";
import { bscTestnet } from "viem/chains";
import {
  ROOT,
  artifact,
  assertRuntimeMatches,
  readCanonicalReceipt,
  SequentialDeployment,
  atomicJson,
} from "./bsc-deployment.mjs";
import { EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
import {
  YIELD_ASSETS,
  YIELD_DEMO,
  verifyInheritedDeployment,
  verifyYieldDeployment,
} from "./deploy-bsc-yield-assets.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sha = (value) => createHash("sha256").update(value).digest("hex");
export function expectedYieldTransactions(m, original) {
  const expected = {};
  const addr = (name) => m.contracts[name].address;
  const old = (name) => original.contracts[name].address;
  const deploy = (name, artifactName, args) => {
    const a = artifact(artifactName);
    expected[`deploy:${name}`] = {
      to: null,
      data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args }),
    };
  };
  const write = (id, to, name, fn, args) => {
    expected[id] = { to, data: encodeFunctionData({ abi: artifact(name).abi, functionName: fn, args }) };
  };
  const usd = old("TestUSDC"),
    timelock = old("Timelock"),
    oracle = addr("BscYieldScenarioOracle"),
    factory = addr("YieldFactory"),
    composite = addr("YieldCompositeOracle"),
    exchange = addr("BscYieldTestExchange"),
    faucet = addr("YieldFaucet"),
    tokens = YIELD_ASSETS.map((c) => addr(c.symbol));
  for (const config of YIELD_ASSETS)
    deploy(config.symbol, "BscYieldTestToken", [
      config.name,
      config.symbol,
      config.decimals,
      config.supply,
      EXPECTED_DEPLOYER,
    ]);
  deploy("BscYieldScenarioOracle", "BscYieldScenarioOracle", [
    usd,
    original.contracts.TestUSDC.runtimeCodehash,
    tokens,
    YIELD_ASSETS.map((c) => c.basePrice),
    YIELD_ASSETS.map((c) => c.demoYieldBpsPerCycle),
    YIELD_ASSETS.map((c) => c.downsideBps),
    YIELD_DEMO.cycleSeconds,
  ]);
  deploy("BscYieldPoolInitializeModule", "BscYieldPoolInitializeModule", [
    old("BasePoolInitializeModule"),
    usd,
    original.contracts.TestUSDC.runtimeCodehash,
  ]);
  deploy("YieldPoolRouter", "BasePoolRouter", [
    old("BasePoolAdminModule"),
    old("BasePoolDepositsModule"),
    old("BasePoolFeesModule"),
    addr("BscYieldPoolInitializeModule"),
    old("BasePoolPartialExitModule"),
    old("BasePoolProtectorModule"),
    old("BasePoolShieldExitModule"),
    old("BasePoolViewsModule"),
  ]);
  deploy("YieldFactory", "ERC1967Proxy", [
    old("BaseFactoryRouter"),
    encodeFunctionData({
      abi: artifact("SplitRiskPoolFactory").abi,
      functionName: "initialize",
      args: [EXPECTED_DEPLOYER, timelock, addr("YieldPoolRouter")],
    }),
  ]);
  deploy("YieldCompositeOracle", "CompositeOracle", []);
  deploy("BscYieldTestExchange", "BscYieldTestExchange", [oracle, YIELD_ASSETS.map((c) => c.maxAmount)]);
  deploy("YieldFaucet", "ConfigurableTokenFaucet", [EXPECTED_DEPLOYER]);
  write("oracle:ownership", composite, "CompositeOracle", "transferOwnership", [factory]);
  write("factory:oracle", factory, "SplitRiskPoolFactory", "setCompositeOracle", [composite]);
  write("factory:fees", factory, "SplitRiskPoolFactory", "setDefaultProtocolFeeRecipient", [timelock]);
  for (const [i, c] of YIELD_ASSETS.entries())
    write(`factory:token:${c.id}`, factory, "SplitRiskPoolFactory", "addTokenInitial", [
      tokens[i],
      c.name,
      c.symbol,
      oracle,
      zeroAddress,
      10000n,
      true,
    ]);
  write("factory:token:TestUSDC", factory, "SplitRiskPoolFactory", "addTokenInitial", [
    usd,
    "YieldShield test USD - no value",
    "TestUSDC",
    oracle,
    zeroAddress,
    10000n,
    true,
  ]);
  write("factory:strict-backing", factory, "SplitRiskPoolFactory", "setTokenRequiresStrictProtectedPrice", [usd, true]);
  write("factory:finalize", factory, "SplitRiskPoolFactory", "finalizeBootstrap", []);
  write("factory:ownership", factory, "SplitRiskPoolFactory", "transferOwnership", [timelock]);
  for (const [i, c] of YIELD_ASSETS.entries()) {
    write(`pool:${c.id}:approve-bond`, usd, "BscTestToken", "approve", [factory, YIELD_DEMO.bond]);
    write(`pool:${c.id}:create`, factory, "SplitRiskPoolFactory", "createPool", [
      tokens[i],
      c.symbol,
      usd,
      "TestUSDC",
      1000n,
      100n,
      15000n,
      YIELD_DEMO.bond,
    ]);
    write(`pool:${c.id}:approve-backing`, usd, "BscTestToken", "approve", [m.pools[c.id], YIELD_DEMO.seedBacking]);
    write(`pool:${c.id}:seed-backing`, m.pools[c.id], "SplitRiskPool", "depositBackingAsset", [
      usd,
      YIELD_DEMO.seedBacking,
      YIELD_DEMO.seedBacking,
    ]);
    write(`exchange:fund:${c.id}`, tokens[i], "BscYieldTestToken", "transfer", [exchange, c.inventory]);
  }
  write("exchange:fund:TestUSDC", usd, "BscTestToken", "transfer", [exchange, YIELD_DEMO.quoteInventory]);
  write("faucet:configure", faucet, "ConfigurableTokenFaucet", "setTokens", [
    [old("TestWBNB"), usd, ...tokens],
    [YIELD_DEMO.legacyDrip, YIELD_DEMO.quoteDrip, ...YIELD_ASSETS.map((c) => c.drip)],
  ]);
  write("faucet:fund:tWBNB", old("TestWBNB"), "BscTestToken", "transfer", [faucet, YIELD_DEMO.legacyInventory]);
  write("faucet:fund:TestUSDC", usd, "BscTestToken", "transfer", [faucet, YIELD_DEMO.quoteFaucetInventory]);
  for (const [i, c] of YIELD_ASSETS.entries())
    write(`faucet:fund:${c.id}`, tokens[i], "BscYieldTestToken", "transfer", [faucet, c.faucetInventory]);
  write("faucet:ownership", faucet, "ConfigurableTokenFaucet", "transferOwnership", [timelock]);
  return expected;
}
export function assertYieldManifest(m, originalRaw) {
  const original = JSON.parse(originalRaw);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.chainId, 97);
  assert.equal(m.local, false);
  assert.equal(m.genesisHash, GENESIS);
  assert(same(m.deployer, EXPECTED_DEPLOYER));
  assert.equal(m.sourceManifestHash, sha(originalRaw));
  assert.equal(m.status, "complete");
  assert.equal(Object.keys(m.contracts).length, 11);
  assert.equal(Object.keys(m.transactions).length, 51);
  assert.equal(m.assets.length, 4);
  assert.equal(Object.keys(m.pools).length, 4);
  for (const [key, name] of [
    ["factory", "YieldFactory"],
    ["compositeOracle", "YieldCompositeOracle"],
    ["oracle", "BscYieldScenarioOracle"],
    ["exchange", "BscYieldTestExchange"],
    ["faucet", "YieldFaucet"],
  ])
    assert(same(m[key], m.contracts[name].address), `Manifest ${key} entry point changed`);
  assert(same(m.quoteToken, original.contracts.TestUSDC.address));
  assert.equal(m.quoteTokenCodehash, original.contracts.TestUSDC.runtimeCodehash);
  assert(same(m.timelock, original.contracts.Timelock.address));
  assert.equal(m.demo.realYield, false);
  assert.equal(m.demo.cycleSeconds, 240);
  for (const [index, config] of YIELD_ASSETS.entries()) {
    const a = m.assets[index];
    for (const [key, value] of Object.entries(config))
      assert(same(a[key], value), `${config.id}: manifest ${key} changed`);
    assert(same(a.address, m.contracts[config.symbol].address));
    assert(same(a.pool, m.pools[config.id]));
    assert(isAddress(a.pool) && !same(a.pool, zeroAddress));
  }
  for (const [id, t] of Object.entries(m.transactions)) {
    assert.equal(t.status, "confirmed", `${id}: unconfirmed`);
    assert.equal(t.request.chainId, 97);
    assert.equal(t.hash, t.receipt.transactionHash);
    assert(BigInt(t.receipt.blockNumber) > 0n);
    assert(/^0x[\da-f]{64}$/i.test(t.receipt.blockHash) && t.receipt.blockHash !== zeroHash);
  }
}
export async function verifyPublishedYieldDeployment(client, m, originalRaw) {
  const original = JSON.parse(originalRaw);
  assertYieldManifest(m, originalRaw);
  await verifyInheritedDeployment(client, original);
  const expected = expectedYieldTransactions(m, original);
  assert.deepEqual(Object.keys(m.transactions).sort(), Object.keys(expected).sort());
  for (const [id, t] of Object.entries(m.transactions)) {
    assert.equal(t.request.data, expected[id].data, `${id}: recipe calldata changed`);
    assert(same(t.request.to ?? zeroAddress, expected[id].to ?? zeroAddress), `${id}: recipe target changed`);
    const r = await readCanonicalReceipt(client, t.hash, id);
    assert.equal(r.blockHash, t.receipt.blockHash);
    assert.equal(r.blockNumber, BigInt(t.receipt.blockNumber));
    const transaction = await client.getTransaction({ hash: t.hash });
    assert(same(transaction.from, EXPECTED_DEPLOYER));
    assert(same(transaction.to ?? zeroAddress, expected[id].to ?? zeroAddress));
    assert.equal(transaction.input, expected[id].data);
    assert.equal(transaction.value, 0n);
    assert.equal(transaction.chainId, 97);
  }
  for (const [name, c] of Object.entries(m.contracts)) {
    const code = await client.getCode({ address: c.address });
    assert(code && same(keccak256(code), c.runtimeCodehash), `${name}: runtime changed`);
    assertRuntimeMatches(artifact(c.artifact), code, c.address, {});
    assert(same(c.address, m.transactions[`deploy:${name}`].receipt.contractAddress));
  }
  const run = new SequentialDeployment({
    client,
    account: { address: EXPECTED_DEPLOYER },
    broadcast: true,
    manifest: m,
  });
  await verifyYieldDeployment(run, original);
  return original;
}
export async function main() {
  assert(process.argv.length === 3 && ["--check", "--write"].includes(process.argv[2]), "Use --check or --write");
  const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
  const m = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-yield-assets.json"), "utf8"));
  const rpc = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname));
  const client = createPublicClient({ chain: bscTestnet, transport: http(rpc, { timeout: 20000, retryCount: 2 }) });
  const original = await verifyPublishedYieldDeployment(client, m, originalRaw);
  const addr = (name) => m.contracts[name].address;
  const codehash = (name) => m.contracts[name].runtimeCodehash;
  const epoch = await client.readContract({
    address: m.oracle,
    abi: artifact("BscYieldScenarioOracle").abi,
    functionName: "epoch",
  });
  const proof = {
    schemaVersion: 1,
    chainId: 97,
    genesisHash: GENESIS,
    verifiedAt: new Date().toISOString(),
    scope: m.demo.notice,
    demo: m.demo,
    contracts: [
      ...Object.entries(m.contracts).map(([name, c]) => ({ name, address: c.address, codeHash: c.runtimeCodehash })),
      {
        name: "TestUSDC (existing)",
        address: original.contracts.TestUSDC.address,
        codeHash: original.contracts.TestUSDC.runtimeCodehash,
      },
      { name: "Timelock (existing)", address: m.timelock, codeHash: original.contracts.Timelock.runtimeCodehash },
    ],
    assets: m.assets.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      decimals: a.decimals,
      address: a.address,
      pool: a.pool,
      basePriceUsd8: a.basePrice,
      demoYieldBpsPerCycle: a.demoYieldBpsPerCycle,
      downsideBps: a.downsideBps,
    })),
    transactions: Object.entries(m.transactions).map(([id, t]) => ({
      id,
      hash: t.hash,
      blockNumber: t.receipt.blockNumber,
    })),
    adapterVenue: {
      chainId: 97,
      exchange: m.exchange,
      exchangeCodehash: codehash("BscYieldTestExchange"),
      oracle: m.oracle,
      oracleCodehash: codehash("BscYieldScenarioOracle"),
      quoteToken: m.quoteToken,
      quoteTokenCodehash: m.quoteTokenCodehash,
      model: "accelerated-yield",
      epoch: epoch.toString(),
      cycleSeconds: "240",
      feeBps: "30",
      maxStockAmount: (25n * 10n ** 18n).toString(),
      assets: YIELD_ASSETS.map((a) => ({
        token: addr(a.symbol),
        codehash: codehash(a.symbol),
        symbol: a.symbol,
        name: a.name,
        decimals: a.decimals,
        basePriceUsd8: a.basePrice.toString(),
        maxAmount: a.maxAmount.toString(),
        demoYieldBpsPerCycle: a.demoYieldBpsPerCycle.toString(),
        downsideBps: a.downsideBps.toString(),
      })),
    },
    adapterDeployment: {
      factory: m.factory,
      compositeOracle: m.compositeOracle,
      deploymentBlock: m.transactions["deploy:YieldFactory"].receipt.blockNumber,
      faucet: m.faucet,
      faucetProof: {
        address: m.faucet,
        label: "Yield asset test tokens",
        codehash: codehash("YieldFaucet"),
        tokens: [original.contracts.TestWBNB.address, m.quoteToken, ...m.assets.map((a) => a.address)],
      },
    },
  };
  if (process.argv[2] === "--write") {
    atomicJson(resolve(ROOT, "apps/web/src/data/bsc-yield-testnet-proof.json"), proof);
    atomicJson(resolve(ROOT, "apps/web/public/bsc-yield-testnet-proof.json"), proof);
    console.log("Verified and published trimmed yield-asset proof.");
  } else console.log(JSON.stringify(proof, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.shortMessage ?? e.message);
    process.exitCode = 1;
  });
