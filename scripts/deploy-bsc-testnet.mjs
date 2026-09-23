#!/usr/bin/env node
/** One synthetic BSC Testnet protection pool. Preparation never signs; broadcast is explicit. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createPublicClient,
  http,
  getAddress,
  encodeFunctionData,
  keccak256,
  toHex,
  zeroHash,
  zeroAddress,
  parseEther,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import {
  ROOT,
  SequentialDeployment,
  artifact,
  atomicJson,
  acquireDeploymentLock,
  assertRuntimeMatches,
} from "./bsc-deployment.mjs";
const SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sha = (v) => createHash("sha256").update(v).digest("hex");
export const DEMO = {
  chainId: 97,
  cycleSeconds: 240,
  baseline: 60000000000n,
  shieldSupply: 1000000n * 10n ** 18n,
  usdSupply: 10000000n * 10n ** 6n,
  seedBacking: 100000n * 10n ** 6n,
  bond: 1000n * 10n ** 6n,
};
function loadEnv() {
  const file = resolve(ROOT, "contracts/.env.bsc.local");
  const values = {};
  if (existsSync(file)) {
    execFileSync("git", ["check-ignore", "--quiet", file], { cwd: ROOT });
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
      if (m) values[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...values, ...process.env };
}
export async function main() {
  const flags = new Set(process.argv.slice(2));
  assert(
    [...flags].every((x) => ["--prepare", "--broadcast", "--local", "--help"].includes(x)),
    "Unknown argument",
  );
  if (flags.has("--help")) {
    console.log(
      "deploy-bsc-testnet.mjs [--prepare|--broadcast] [--local]. Default: unsigned preparation. See docs/BSC_TESTNET_RUNBOOK.md.",
    );
    return;
  }
  assert(!(flags.has("--prepare") && flags.has("--broadcast")), "Choose preparation or broadcast");
  const broadcast = flags.has("--broadcast"),
    local = flags.has("--local"),
    env = loadEnv();
  const rpc = env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpc).hostname);
  assert.equal(local, loopback, "Loopback RPC requires --local, and --local forbids public RPCs");
  const expected = getAddress(env.BSC_TESTNET_EXPECTED_DEPLOYER ?? "");
  // A public address is enough to prepare: no secret is read into a signing account.
  const account = broadcast ? privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY) : { address: expected };
  assert(same(account.address, expected), "Dedicated BSC deployer mismatch");
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpc, { timeout: 20000, retryCount: 2 }),
    pollingInterval: 1000,
  });
  assert.equal(await client.getChainId(), 97, "Deployment is restricted to BSC Testnet 97");
  const genesis = (await client.getBlock({ blockNumber: 0n })).hash;
  if (!local)
    assert.equal(
      genesis,
      "0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34",
      "Unexpected BSC Testnet genesis",
    );
  const manifestPath = resolve(
    ROOT,
    local ? "artifacts/local/bsc-deployment.json" : "contracts/deployments/bsc-testnet-alpha.json",
  );
  const release = broadcast ? acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock")) : () => {};
  try {
    execFileSync(process.execPath, [resolve(ROOT, "scripts/verify-base-modules.mjs")], { cwd: ROOT, stdio: "inherit" });
    const modules = JSON.parse(readFileSync(resolve(ROOT, "contracts/config/base-modules.json")));
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath))
      : {
          schemaVersion: 1,
          chainId: 97,
          local,
          genesisHash: genesis,
          deployer: account.address,
          status: "preparing",
          contracts: {},
          transactions: {},
        };
    assert.equal(manifest.chainId, 97);
    assert.equal(manifest.local, local);
    assert.equal(manifest.genesisHash, genesis);
    assert(same(manifest.deployer, account.address));
    const recipeHash = sha(
      readFileSync(new URL(import.meta.url)) +
        readFileSync(new URL("./bsc-deployment.mjs", import.meta.url)) +
        JSON.stringify(modules),
    );
    if (manifest.recipeHash)
      assert.equal(manifest.recipeHash, recipeHash, "Recipe changed; reconcile existing deployment before continuing");
    manifest.recipeHash = recipeHash;
    const run = new SequentialDeployment({
      client,
      account,
      broadcast,
      manifestPath,
      manifest,
      nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      maxFeePerGas: BigInt(env.BSC_TESTNET_MAX_GAS_PRICE_WEI ?? "5000000000"),
      spendLimit: parseEther(env.BSC_TESTNET_MAX_TOTAL_FEE_BNB ?? "0.5"),
    });
    const timelock = await run.deploy("Timelock", "YSTimelockController", [
      172800n,
      [account.address],
      [account.address],
      account.address,
    ]);
    await run.write("timelock:renounce-admin", timelock, "YSTimelockController", "renounceRole", [
      zeroHash,
      account.address,
    ]);
    const routers = {};
    for (const [original, config] of Object.entries(modules)) {
      const addresses = [];
      for (const [group, module] of Object.entries(config.modules)) {
        let address = await run.deploy(module.contract);
        if (original === "SplitRiskPool" && group === "Initialize")
          address = await run.deploy("BscPoolInitializeModule", "BscPoolInitializeModule", [address]);
        addresses.push(address);
      }
      routers[original] = await run.deploy(config.router, config.router, addresses);
      for (const [group, module] of Object.entries(config.modules)) {
        const target =
          original === "SplitRiskPool" && group === "Initialize"
            ? manifest.contracts.BscPoolInitializeModule?.address
            : manifest.contracts[module.contract]?.address;
        if (broadcast) await run.expect(routers[original], config.router, group.toLowerCase() + "Module", [], target);
      }
    }
    const factory = await run.deploy("Factory", "ERC1967Proxy", [
      routers.SplitRiskPoolFactory,
      encodeFunctionData({
        abi: artifact("SplitRiskPoolFactory").abi,
        functionName: "initialize",
        args: [account.address, timelock, routers.SplitRiskPool],
      }),
    ]);
    const composite = await run.deploy("CompositeOracle");
    const shield = await run.deploy("TestWBNB", "BscTestToken", [
      "YieldShield test WBNB - no value",
      "tWBNB",
      18,
      DEMO.shieldSupply,
      account.address,
    ]);
    const usd = await run.deploy("TestUSDC", "BscTestToken", [
      "YieldShield test USD - no value",
      "TestUSDC",
      6,
      DEMO.usdSupply,
      account.address,
    ]);
    const oracle = await run.deploy("BscScenarioOracle", "BscScenarioOracle", [
      usd,
      [shield],
      [DEMO.baseline],
      DEMO.cycleSeconds,
    ]);
    const faucet = await run.deploy("Faucet", "ConfigurableTokenFaucet", [account.address]);
    await run.write("oracle:ownership", composite, "CompositeOracle", "transferOwnership", [factory]);
    await run.write("factory:oracle", factory, "SplitRiskPoolFactory", "setCompositeOracle", [composite]);
    await run.write("factory:fees", factory, "SplitRiskPoolFactory", "setDefaultProtocolFeeRecipient", [timelock]);
    for (const [token, name, symbol] of [
      [shield, "YieldShield test WBNB - no value", "tWBNB"],
      [usd, "YieldShield test USD - no value", "TestUSDC"],
    ]) {
      await run.write(`factory:token:${symbol}`, factory, "SplitRiskPoolFactory", "addTokenInitial", [
        token,
        name,
        symbol,
        oracle,
        zeroAddress,
        10000n,
        true,
      ]);
    }
    await run.write("factory:strict-backing", factory, "SplitRiskPoolFactory", "setTokenRequiresStrictProtectedPrice", [
      usd,
      true,
    ]);
    await run.write("factory:finalize", factory, "SplitRiskPoolFactory", "finalizeBootstrap");
    await run.write("factory:ownership", factory, "SplitRiskPoolFactory", "transferOwnership", [timelock]);
    await run.write("pool:approve-bond", usd, "BscTestToken", "approve", [factory, DEMO.bond]);
    const receipt = await run.write("pool:create", factory, "SplitRiskPoolFactory", "createPool", [
      shield,
      "tWBNB",
      usd,
      "TestUSDC",
      1000n,
      100n,
      15000n,
      DEMO.bond,
    ]);
    let pool = manifest.pool;
    if (broadcast) {
      const events = parseEventLogs({
        abi: artifact("SplitRiskPoolFactory").abi,
        logs: receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs,
        eventName: "PoolCreated",
      }).filter((x) => same(x.address, factory));
      assert.equal(events.length, 1, "Expected one factory PoolCreated event");
      pool = getAddress(events[0].args.poolAddress ?? events[0].args.pool);
      if (manifest.pool) assert(same(manifest.pool, pool));
      manifest.pool = pool;
      run.save();
    }
    // A factory-created proxy's address is known only after its receipt. Prepare records this dependency.
    if (pool) {
      await run.write("pool:approve-backing", usd, "BscTestToken", "approve", [pool, DEMO.seedBacking]);
      await run.write("pool:seed-backing", pool, "SplitRiskPool", "depositBackingAsset", [
        usd,
        DEMO.seedBacking,
        DEMO.seedBacking,
      ]);
    }
    await run.write("faucet:configure", faucet, "ConfigurableTokenFaucet", "setTokens", [
      [shield, usd],
      [5n * 10n ** 18n, 10000n * 10n ** 6n],
    ]);
    await run.write("faucet:fund-tWBNB", shield, "BscTestToken", "transfer", [faucet, 100000n * 10n ** 18n]);
    await run.write("faucet:fund-TestUSDC", usd, "BscTestToken", "transfer", [faucet, 1000000n * 10n ** 6n]);
    await run.write("faucet:ownership", faucet, "ConfigurableTokenFaucet", "transferOwnership", [timelock]);
    if (!broadcast) {
      const plan = {
        chainId: 97,
        local,
        deployer: account.address,
        recipeHash,
        transactions: run.plan,
        deferred: pool
          ? []
          : ["Approve and seed 100,000 TestUSDC backing after decoding the canonical PoolCreated receipt."],
        totalTransactions: run.plan.length + (pool ? 0 : 2),
      };
      atomicJson(
        resolve(ROOT, local ? "artifacts/local/bsc-plan.json" : "contracts/deployments/bsc-testnet-plan.json"),
        plan,
      );
      console.log(`Prepared ${plan.totalTransactions} transactions. No transactions signed or broadcast.`);
      return;
    }
    await verifyDeployment(run, { timelock, factory, composite, shield, usd, oracle, faucet, pool, routers });
    manifest.deploymentBlock = manifest.transactions["deploy:Factory"].receipt.blockNumber;
    manifest.status = "complete";
    manifest.verifiedAt = new Date().toISOString();
    manifest.demo = {
      priceMode: "synthetic",
      cycleSeconds: 240,
      minimumPoolTime: 60,
      unlockDuration: 120,
      operatorControls: "Dedicated deployer proposes/executes through a 2-day timelock. No external audit.",
    };
    run.save();
    console.log(`Verified ${local ? "LOCAL rehearsal" : "BSC TESTNET"} deployment: ${pool}`);
  } finally {
    release();
  }
}
export async function verifyDeployment(run, x) {
  const { timelock, factory, composite, shield, usd, oracle, faucet, pool, routers } = x;
  for (const role of [
    zeroHash,
    ...["PROPOSER_ROLE", "EXECUTOR_ROLE", "CANCELLER_ROLE"].map((x) => keccak256(toHex(x))),
  ]) {
    await run.expect(timelock, "YSTimelockController", "getRoleMemberCount", [role], 1n);
    await run.expect(
      timelock,
      "YSTimelockController",
      "getRoleMember",
      [role, 0n],
      role === zeroHash ? timelock : run.account.address,
    );
  }
  await run.expect(timelock, "YSTimelockController", "getMinDelay", [], 172800n);
  for (const [address, name, fn, args, value] of [
    [factory, "SplitRiskPoolFactory", "owner", [], timelock],
    [factory, "SplitRiskPoolFactory", "governanceTimelock", [], timelock],
    [factory, "SplitRiskPoolFactory", "bootstrapModeEnabled", [], false],
    [factory, "SplitRiskPoolFactory", "compositeOracle", [], composite],
    [factory, "SplitRiskPoolFactory", "splitRiskPoolImplementation", [], routers.SplitRiskPool],
    [factory, "SplitRiskPoolFactory", "isPoolActive", [pool], true],
    [composite, "CompositeOracle", "owner", [], factory],
    [faucet, "ConfigurableTokenFaucet", "owner", [], timelock],
    [oracle, "BscScenarioOracle", "quoteToken", [], usd],
    [oracle, "BscScenarioOracle", "demoTokens", [0n], shield],
    [oracle, "BscScenarioOracle", "tokenCount", [], 1n],
    [oracle, "BscScenarioOracle", "basePrice", [shield], DEMO.baseline],
    [oracle, "BscScenarioOracle", "cycleSeconds", [], 240n],
    [shield, "BscTestToken", "decimals", [], 18],
    [usd, "BscTestToken", "decimals", [], 6],
    [shield, "BscTestToken", "totalSupply", [], DEMO.shieldSupply],
    [usd, "BscTestToken", "totalSupply", [], DEMO.usdSupply],
    [pool, "SplitRiskPool", "SHIELDED_TOKEN", [], shield],
    [pool, "SplitRiskPool", "BACKING_TOKEN", [], usd],
    [pool, "SplitRiskPool", "owner", [], factory],
    [pool, "SplitRiskPool", "governanceTimelock", [], timelock],
    [pool, "SplitRiskPool", "requiresStrictProtectedBackingPrice", [], true],
    [faucet, "ConfigurableTokenFaucet", "getAllTokens", [], [shield, usd]],
    [faucet, "ConfigurableTokenFaucet", "dripAmount", [shield], 5n * 10n ** 18n],
    [faucet, "ConfigurableTokenFaucet", "dripAmount", [usd], 10000n * 10n ** 6n],
  ])
    await run.expect(address, name, fn, args, value);
  for (const [proxy, implementation] of [
    [factory, routers.SplitRiskPoolFactory],
    [pool, routers.SplitRiskPool],
  ]) {
    const stored = await run.client.getStorageAt({ address: proxy, slot: SLOT });
    assert(same("0x" + stored.slice(-40), implementation), "Unexpected proxy implementation");
    assertRuntimeMatches(artifact("ERC1967Proxy"), await run.client.getCode({ address: proxy }), proxy, run.links);
  }
  const initialize = run.manifest.contracts.BscPoolInitializeModule.address;
  await run.expect(
    initialize,
    "BscPoolInitializeModule",
    "originalModule",
    [],
    run.manifest.contracts.BasePoolInitializeModule.address,
  );
  await run.expect(
    initialize,
    "BscPoolInitializeModule",
    "originalModuleCodeHash",
    [],
    run.manifest.contracts.BasePoolInitializeModule.runtimeCodehash,
  );
  // PoolConfig layout is independently covered by BscProtectionTest against the original initializer.
  for (const [slot, value] of [
    [55n, 60n],
    [56n, 120n],
  ])
    assert.equal(
      BigInt(await run.client.getStorageAt({ address: pool, slot: toHex(slot, { size: 32 }) })),
      value,
      "Unexpected demo delay",
    );
  for (const token of [shield, usd])
    await run.expect(composite, "CompositeOracle", "getTokenOracleFeed", [token], oracle);
  for (const [getter, name] of [
    ["shieldReceiptNFT", "ShieldReceiptNFT"],
    ["protectorReceiptNFT", "ProtectorReceiptNFT"],
  ]) {
    const address = await run.read(pool, "SplitRiskPool", getter);
    const code = await run.client.getCode({ address });
    assertRuntimeMatches(artifact(name), code, address, run.links);
    await run.expect(address, name, "pool", [], pool);
    await run.expect(address, name, "owner", [], pool);
    run.manifest.contracts[name] = { address, artifact: name, runtimeCodehash: keccak256(code), createdByPool: pool };
  }
  assert(
    (await run.read(shield, "BscTestToken", "balanceOf", [faucet])) >= 5n * 10n ** 18n,
    "Faucet tWBNB inventory exhausted",
  );
  assert(
    (await run.read(usd, "BscTestToken", "balanceOf", [faucet])) >= 10000n * 10n ** 6n,
    "Faucet TestUSDC inventory exhausted",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(`BSC deployment stopped: ${error.shortMessage ?? error.message}`);
    process.exitCode = 1;
  });
