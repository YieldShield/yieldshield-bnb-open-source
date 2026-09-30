import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { decodeFunctionData } from "viem";
import { ROOT, artifact } from "./bsc-deployment.mjs";
import { EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
import { YIELD_ASSETS, YIELD_DEMO } from "./deploy-bsc-yield-assets.mjs";
import { expectedYieldTransactions, assertYieldManifest } from "./verify-bsc-yield-assets.mjs";
import { assertYieldInitializerLayout } from "./verify-bsc-yield-layout.mjs";
const address = (n) => "0x" + BigInt(n).toString(16).padStart(40, "0");
const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
const original = JSON.parse(originalRaw);
function fixture() {
  const names = [
    ...YIELD_ASSETS.map((c) => c.symbol),
    "BscYieldScenarioOracle",
    "BscYieldPoolInitializeModule",
    "YieldPoolRouter",
    "YieldFactory",
    "YieldCompositeOracle",
    "BscYieldTestExchange",
    "YieldFaucet",
  ];
  const m = {
    schemaVersion: 1,
    chainId: 97,
    local: false,
    genesisHash: GENESIS,
    deployer: EXPECTED_DEPLOYER,
    sourceManifestHash: createHash("sha256").update(originalRaw).digest("hex"),
    status: "complete",
    contracts: Object.fromEntries(names.map((name, i) => [name, { address: address(i + 100) }])),
    pools: Object.fromEntries(YIELD_ASSETS.map((c, i) => [c.id, address(i + 200)])),
    transactions: {},
    quoteToken: original.contracts.TestUSDC.address,
    quoteTokenCodehash: original.contracts.TestUSDC.runtimeCodehash,
    timelock: original.contracts.Timelock.address,
    demo: { realYield: false, cycleSeconds: 240 },
  };
  for (const [key, name] of [
    ["factory", "YieldFactory"],
    ["compositeOracle", "YieldCompositeOracle"],
    ["oracle", "BscYieldScenarioOracle"],
    ["exchange", "BscYieldTestExchange"],
    ["faucet", "YieldFaucet"],
  ])
    m[key] = m.contracts[name].address;
  m.assets = YIELD_ASSETS.map((c) => ({ ...c, address: m.contracts[c.symbol].address, pool: m.pools[c.id] }));
  const intents = expectedYieldTransactions(m, original);
  for (const [id, intent] of Object.entries(intents))
    m.transactions[id] = {
      status: "confirmed",
      request: { chainId: 97, ...intent },
      hash: "0x" + "1".repeat(64),
      receipt: { transactionHash: "0x" + "1".repeat(64), blockNumber: "1", blockHash: "0x" + "2".repeat(64) },
    };
  return m;
}
test("four demo configs keep native scales, sensible liquidity, and explicit synthetic rates", () => {
  assert.deepEqual(
    YIELD_ASSETS.map((a) => a.decimals),
    [18, 18, 18, 8],
  );
  for (const c of YIELD_ASSETS) {
    assert(c.supply > c.inventory + c.faucetInventory);
    assert(c.inventory >= c.maxAmount);
    assert(c.faucetInventory >= c.drip);
    assert(c.demoYieldBpsPerCycle > 0n && c.demoYieldBpsPerCycle <= 100n);
  }
  assert(YIELD_DEMO.quoteInventory > 100000n * 10n ** 6n);
});
test("recipe covers eleven deployments, four seeded pools and one six-token dispenser", () => {
  const m = fixture();
  assertYieldManifest(m, originalRaw);
  const intents = expectedYieldTransactions(m, original);
  assert.equal(Object.keys(intents).length, 51);
  const decoded = decodeFunctionData({
    abi: artifact("ConfigurableTokenFaucet").abi,
    data: intents["faucet:configure"].data,
  });
  assert.equal(decoded.functionName, "setTokens");
  assert.equal(decoded.args[0].length, 6);
  for (const c of YIELD_ASSETS) assert.equal(intents[`pool:${c.id}:seed-backing`].to, m.pools[c.id]);
});
test("public proof rejects mainnet, substituted entry points, altered rates, and incomplete receipts", () => {
  for (const alter of [
    (m) => {
      m.chainId = 56;
    },
    (m) => {
      m.exchange = address(900);
    },
    (m) => {
      m.assets[3].decimals = 18;
    },
    (m) => {
      m.assets[0].demoYieldBpsPerCycle = 99n;
    },
    (m) => {
      delete m.transactions["pool:susde:seed-backing"];
    },
    (m) => {
      m.demo.realYield = true;
    },
  ]) {
    const m = fixture();
    alter(m);
    assert.throws(() => assertYieldManifest(m, originalRaw));
  }
});
test("initializer storage proof fails closed on shifted protection timing slots", () => {
  const originalArtifact = artifact("BasePoolInitializeModule"),
    adapterArtifact = artifact("BscYieldPoolInitializeModule");
  assertYieldInitializerLayout(originalArtifact, adapterArtifact);
  const corrupted = structuredClone(adapterArtifact);
  const config = corrupted.storageLayout.storage.find((s) => s.label === "_poolConfig");
  corrupted.storageLayout.types[config.type].members.find((m) => m.label === "minimumPoolTime").slot = "7";
  assert.throws(() => assertYieldInitializerLayout(originalArtifact, corrupted));
});
