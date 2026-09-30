#!/usr/bin/env node
/** Four valueless yield-asset reference demos. Default preparation never loads a signer. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  createPublicClient,
  http,
  getAddress,
  encodeFunctionData,
  keccak256,
  parseEther,
  parseEventLogs,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import {
  ROOT,
  artifact,
  atomicJson,
  SequentialDeployment,
  acquireDeploymentLock,
  assertRuntimeMatches,
} from "./bsc-deployment.mjs";
import { assertPublicManifest, EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const YIELD_ASSETS = [
  {
    id: "slisbnb",
    name: "YieldShield test slisBNB - no value",
    symbol: "tSlisBNB",
    decimals: 18,
    basePrice: 60000000000n,
    demoYieldBpsPerCycle: 20n,
    downsideBps: 1500n,
    maxAmount: 25n * 10n ** 18n,
    inventory: 1000n * 10n ** 18n,
    faucetInventory: 100000n * 10n ** 18n,
    drip: 5n * 10n ** 18n,
    supply: 1000000n * 10n ** 18n,
  },
  {
    id: "wbeth",
    name: "YieldShield test wBETH - no value",
    symbol: "tWBETH",
    decimals: 18,
    basePrice: 200000000000n,
    demoYieldBpsPerCycle: 15n,
    downsideBps: 1500n,
    maxAmount: 10n * 10n ** 18n,
    inventory: 1000n * 10n ** 18n,
    faucetInventory: 100000n * 10n ** 18n,
    drip: 2n * 10n ** 18n,
    supply: 1000000n * 10n ** 18n,
  },
  {
    id: "susde",
    name: "YieldShield test sUSDe - no value",
    symbol: "tsUSDe",
    decimals: 18,
    basePrice: 110000000n,
    demoYieldBpsPerCycle: 10n,
    downsideBps: 1000n,
    maxAmount: 25000n * 10n ** 18n,
    inventory: 250000n * 10n ** 18n,
    faucetInventory: 1000000n * 10n ** 18n,
    drip: 1000n * 10n ** 18n,
    supply: 10000000n * 10n ** 18n,
  },
  {
    id: "vusdt",
    name: "YieldShield test Venus vUSDT - no value",
    symbol: "tvUSDT",
    decimals: 8,
    basePrice: 2000000n,
    demoYieldBpsPerCycle: 10n,
    downsideBps: 1000n,
    maxAmount: 50000n * 10n ** 8n,
    inventory: 10000000n * 10n ** 8n,
    faucetInventory: 100000000n * 10n ** 8n,
    drip: 50000n * 10n ** 8n,
    supply: 1000000000n * 10n ** 8n,
  },
];
export const YIELD_DEMO = {
  cycleSeconds: 240,
  seedBacking: 100000n * 10n ** 6n,
  bond: 1000n * 10n ** 6n,
  quoteInventory: 500000n * 10n ** 6n,
  quoteFaucetInventory: 1000000n * 10n ** 6n,
  quoteDrip: 10000n * 10n ** 6n,
  legacyInventory: 10000n * 10n ** 18n,
  legacyDrip: 5n * 10n ** 18n,
};

function loadEnvironment(broadcast) {
  if (!broadcast) return process.env;
  const path = resolve(ROOT, "contracts/.env.bsc.local");
  if (!existsSync(path)) return process.env;
  execFileSync("git", ["check-ignore", "--quiet", path], { cwd: ROOT });
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) values[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return { ...values, ...process.env };
}

/** Authenticate inherited code against the original public proof, never new dependency artifacts. */
export async function verifyInheritedDeployment(client, original) {
  assertPublicManifest(original);
  assert.equal(await client.getChainId(), 97);
  assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
  for (const [name, c] of Object.entries(original.contracts)) {
    const code = await client.getCode({ address: c.address });
    assert(code && same(keccak256(code), c.runtimeCodehash), `${name}: inherited runtime changed`);
  }
  const read = (name, fn, args = []) =>
    client.readContract({
      address: original.contracts[name].address,
      abi: artifact(name === "Factory" ? "SplitRiskPoolFactory" : original.contracts[name].artifact).abi,
      functionName: fn,
      args,
    });
  assert(
    same(
      (await client.getStorageAt({ address: original.contracts.Factory.address, slot: SLOT })).slice(-40),
      original.contracts.BaseFactoryRouter.address.slice(2),
    ),
    "Original factory implementation changed",
  );
  assert.equal(await read("Factory", "isPoolActive", [original.pool]), true);
  assert(same(await read("Factory", "owner"), original.contracts.Timelock.address));
  assert.equal(await read("Timelock", "getMinDelay"), 172800n);
  assert.equal(await read("Timelock", "hasRole", [zeroHash, EXPECTED_DEPLOYER]), false);
}

export async function verifyYieldDeployment(run, original) {
  const m = run.manifest;
  const addr = (name) => m.contracts[name].address;
  const timelock = original.contracts.Timelock.address;
  const usd = original.contracts.TestUSDC.address;
  const quoteHash = original.contracts.TestUSDC.runtimeCodehash;
  const expected = (address, name, fn, args, value) => run.expect(address, name, fn, args, value);
  const factory = addr("YieldFactory"),
    composite = addr("YieldCompositeOracle"),
    oracle = addr("BscYieldScenarioOracle"),
    exchange = addr("BscYieldTestExchange"),
    faucet = addr("YieldFaucet");
  for (const [fn, value] of [
    ["owner", timelock],
    ["governanceTimelock", timelock],
    ["compositeOracle", composite],
    ["defaultProtocolFeeRecipient", timelock],
    ["splitRiskPoolImplementation", addr("YieldPoolRouter")],
    ["bootstrapModeEnabled", false],
    ["paused", false],
  ])
    await expected(factory, "SplitRiskPoolFactory", fn, [], value);
  await expected(composite, "CompositeOracle", "owner", [], factory);
  await expected(faucet, "ConfigurableTokenFaucet", "owner", [], timelock);
  await expected(faucet, "ConfigurableTokenFaucet", "getTokenCount", [], 6n);
  await expected(oracle, "BscYieldScenarioOracle", "quoteToken", [], usd);
  await expected(oracle, "BscYieldScenarioOracle", "quoteTokenCodeHash", [], quoteHash);
  await expected(oracle, "BscYieldScenarioOracle", "tokenCount", [], 4n);
  await expected(oracle, "BscYieldScenarioOracle", "cycleSeconds", [], 240n);
  await expected(exchange, "BscYieldTestExchange", "oracle", [], oracle);
  await expected(exchange, "BscYieldTestExchange", "quoteToken", [], usd);
  await expected(exchange, "BscYieldTestExchange", "feeBps", [], 30n);
  await expected(exchange, "BscYieldTestExchange", "maxStockAmount", [], 25n * 10n ** 18n);
  for (const [fn, value] of [
    ["originalModule", original.contracts.BasePoolInitializeModule.address],
    ["originalModuleCodeHash", original.contracts.BasePoolInitializeModule.runtimeCodehash],
    ["quoteToken", usd],
    ["quoteTokenCodeHash", quoteHash],
  ])
    await expected(addr("BscYieldPoolInitializeModule"), "BscYieldPoolInitializeModule", fn, [], value);
  for (const [fn, originalName] of [
    ["adminModule", "BasePoolAdminModule"],
    ["depositsModule", "BasePoolDepositsModule"],
    ["feesModule", "BasePoolFeesModule"],
    ["partialexitModule", "BasePoolPartialExitModule"],
    ["protectorModule", "BasePoolProtectorModule"],
    ["shieldexitModule", "BasePoolShieldExitModule"],
    ["viewsModule", "BasePoolViewsModule"],
  ])
    await expected(addr("YieldPoolRouter"), "BasePoolRouter", fn, [], original.contracts[originalName].address);
  await expected(
    addr("YieldPoolRouter"),
    "BasePoolRouter",
    "initializeModule",
    [],
    addr("BscYieldPoolInitializeModule"),
  );
  await expected(
    faucet,
    "ConfigurableTokenFaucet",
    "getAllTokens",
    [],
    [original.contracts.TestWBNB.address, usd, ...YIELD_ASSETS.map((c) => addr(c.symbol))],
  );
  for (const [token, amount] of [
    [original.contracts.TestWBNB.address, YIELD_DEMO.legacyDrip],
    [usd, YIELD_DEMO.quoteDrip],
  ]) {
    await expected(faucet, "ConfigurableTokenFaucet", "enabledTokens", [token], true);
    await expected(faucet, "ConfigurableTokenFaucet", "dripAmount", [token], amount);
    assert(
      (await run.read(token, "BscTestToken", "balanceOf", [faucet])) >= amount,
      "Shared faucet inventory exhausted",
    );
  }
  const implementation = await run.client.getStorageAt({ address: factory, slot: SLOT });
  assert(
    same(implementation.slice(-40), original.contracts.BaseFactoryRouter.address.slice(2)),
    "Yield factory implementation differs",
  );
  for (const [index, config] of YIELD_ASSETS.entries()) {
    const token = addr(config.symbol),
      pool = m.pools[config.id];
    for (const [fn, value] of [
      ["name", config.name],
      ["symbol", config.symbol],
      ["decimals", config.decimals],
      ["totalSupply", config.supply],
      ["isSyntheticDemo", true],
    ])
      await expected(token, "BscYieldTestToken", fn, [], value);
    await expected(oracle, "BscYieldScenarioOracle", "demoTokens", [BigInt(index)], token);
    for (const [fn, value] of [
      ["basePrice", config.basePrice],
      ["demoYieldBpsPerCycle", config.demoYieldBpsPerCycle],
      ["downsideBps", config.downsideBps],
    ])
      await expected(oracle, "BscYieldScenarioOracle", fn, [token], value);
    for (const [fn, value] of [
      ["supportedStock", true],
      ["assetScale", 10n ** BigInt(config.decimals)],
      ["maxAssetAmount", config.maxAmount],
    ])
      await expected(exchange, "BscYieldTestExchange", fn, [token], value);
    await expected(factory, "SplitRiskPoolFactory", "isWhitelisted", [token], true);
    await expected(factory, "SplitRiskPoolFactory", "isPoolActive", [pool], true);
    for (const [fn, value] of [
      ["SHIELDED_TOKEN", token],
      ["BACKING_TOKEN", usd],
      ["owner", factory],
      ["governanceTimelock", timelock],
      ["shieldedTokenScale", 10n ** BigInt(config.decimals)],
      ["backingTokenScale", 1000000n],
      ["requiresStrictProtectedBackingPrice", true],
      ["paused", false],
    ])
      await expected(pool, "SplitRiskPool", fn, [], value);
    const poolImplementation = await run.client.getStorageAt({ address: pool, slot: SLOT });
    assert(
      same(poolImplementation.slice(-40), addr("YieldPoolRouter").slice(2)),
      `${config.id}: pool implementation differs`,
    );
    const poolCode = await run.client.getCode({ address: pool });
    assert(
      poolCode && same(keccak256(poolCode), m.poolProofs[config.id].runtimeCodehash),
      `${config.id}: pool runtime differs`,
    );
    const poolConfig = await run.read(pool, "SplitRiskPool", "poolConfig");
    assert.equal(poolConfig[5], 60n);
    assert.equal(poolConfig[6], 120n);
    assert(
      (await run.read(usd, "BscTestToken", "balanceOf", [pool])) > 0n,
      `${config.id}: protection backing exhausted`,
    );
    assert(
      (await run.read(token, "BscYieldTestToken", "balanceOf", [exchange])) > 0n,
      `${config.id}: exchange inventory exhausted`,
    );
    assert(
      (await run.read(token, "BscYieldTestToken", "balanceOf", [faucet])) >= config.drip,
      `${config.id}: faucet inventory exhausted`,
    );
    await expected(faucet, "ConfigurableTokenFaucet", "enabledTokens", [token], true);
    await expected(faucet, "ConfigurableTokenFaucet", "dripAmount", [token], config.drip);
  }
  assert((await run.read(usd, "BscTestToken", "balanceOf", [exchange])) > 0n, "Quote trading inventory exhausted");
}

export async function main() {
  assert(
    process.argv.length === 3 && ["--prepare", "--broadcast"].includes(process.argv[2]),
    "Use --prepare or --broadcast",
  );
  const broadcast = process.argv[2] === "--broadcast",
    env = loadEnvironment(broadcast);
  execFileSync(process.execPath, [resolve(ROOT, "scripts/verify-bsc-yield-layout.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  const rpc = env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname), "Public chain only");
  const account = broadcast
    ? privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY)
    : { address: EXPECTED_DEPLOYER };
  assert(same(account.address, EXPECTED_DEPLOYER), "Dedicated operator mismatch");
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpc, { timeout: 20000, retryCount: 2 }),
    pollingInterval: 1000,
  });
  const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
  const original = JSON.parse(originalRaw);
  await verifyInheritedDeployment(client, original);
  const path = resolve(ROOT, "contracts/deployments/bsc-testnet-yield-assets.json");
  const manifest = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : {
        schemaVersion: 1,
        chainId: 97,
        local: false,
        genesisHash: GENESIS,
        deployer: EXPECTED_DEPLOYER,
        sourceManifestHash: sha(originalRaw),
        status: "preparing",
        contracts: {},
        transactions: {},
        pools: {},
        poolProofs: {},
      };
  for (const [key, value] of [
    ["chainId", 97],
    ["genesisHash", GENESIS],
    ["deployer", EXPECTED_DEPLOYER],
    ["sourceManifestHash", sha(originalRaw)],
  ])
    assert(same(manifest[key], value), `Yield manifest ${key} changed`);
  const recipeHash = sha(
    readFileSync(new URL(import.meta.url)) +
      readFileSync(new URL("./bsc-deployment.mjs", import.meta.url)) +
      originalRaw,
  );
  if (manifest.recipeHash)
    assert.equal(manifest.recipeHash, recipeHash, "Yield recipe changed; reconcile exact saved transactions");
  manifest.recipeHash = recipeHash;
  const release = broadcast ? acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock")) : () => {};
  try {
    const run = new SequentialDeployment({
      client,
      account,
      broadcast,
      manifestPath: path,
      manifest,
      nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      maxFeePerGas: BigInt(env.BSC_TESTNET_MAX_GAS_PRICE_WEI ?? "5000000000"),
      spendLimit: parseEther("0.03"),
    });
    const old = (name) => original.contracts[name].address;
    const usd = old("TestUSDC"),
      timelock = old("Timelock");
    const tokens = [];
    for (const config of YIELD_ASSETS)
      tokens.push(
        await run.deploy(config.symbol, "BscYieldTestToken", [
          config.name,
          config.symbol,
          config.decimals,
          config.supply,
          account.address,
        ]),
      );
    const oracle = await run.deploy("BscYieldScenarioOracle", "BscYieldScenarioOracle", [
      usd,
      original.contracts.TestUSDC.runtimeCodehash,
      tokens,
      YIELD_ASSETS.map((c) => c.basePrice),
      YIELD_ASSETS.map((c) => c.demoYieldBpsPerCycle),
      YIELD_ASSETS.map((c) => c.downsideBps),
      YIELD_DEMO.cycleSeconds,
    ]);
    const initializer = await run.deploy("BscYieldPoolInitializeModule", "BscYieldPoolInitializeModule", [
      old("BasePoolInitializeModule"),
      usd,
      original.contracts.TestUSDC.runtimeCodehash,
    ]);
    const router = await run.deploy("YieldPoolRouter", "BasePoolRouter", [
      old("BasePoolAdminModule"),
      old("BasePoolDepositsModule"),
      old("BasePoolFeesModule"),
      initializer,
      old("BasePoolPartialExitModule"),
      old("BasePoolProtectorModule"),
      old("BasePoolShieldExitModule"),
      old("BasePoolViewsModule"),
    ]);
    const factory = await run.deploy("YieldFactory", "ERC1967Proxy", [
      old("BaseFactoryRouter"),
      encodeFunctionData({
        abi: artifact("SplitRiskPoolFactory").abi,
        functionName: "initialize",
        args: [account.address, timelock, router],
      }),
    ]);
    const composite = await run.deploy("YieldCompositeOracle", "CompositeOracle");
    const exchange = await run.deploy("BscYieldTestExchange", "BscYieldTestExchange", [
      oracle,
      YIELD_ASSETS.map((c) => c.maxAmount),
    ]);
    const faucet = await run.deploy("YieldFaucet", "ConfigurableTokenFaucet", [account.address]);
    await run.write("oracle:ownership", composite, "CompositeOracle", "transferOwnership", [factory]);
    await run.write("factory:oracle", factory, "SplitRiskPoolFactory", "setCompositeOracle", [composite]);
    await run.write("factory:fees", factory, "SplitRiskPoolFactory", "setDefaultProtocolFeeRecipient", [timelock]);
    for (const [index, config] of YIELD_ASSETS.entries())
      await run.write(`factory:token:${config.id}`, factory, "SplitRiskPoolFactory", "addTokenInitial", [
        tokens[index],
        config.name,
        config.symbol,
        oracle,
        zeroAddress,
        10000n,
        true,
      ]);
    await run.write("factory:token:TestUSDC", factory, "SplitRiskPoolFactory", "addTokenInitial", [
      usd,
      "YieldShield test USD - no value",
      "TestUSDC",
      oracle,
      zeroAddress,
      10000n,
      true,
    ]);
    await run.write("factory:strict-backing", factory, "SplitRiskPoolFactory", "setTokenRequiresStrictProtectedPrice", [
      usd,
      true,
    ]);
    await run.write("factory:finalize", factory, "SplitRiskPoolFactory", "finalizeBootstrap");
    await run.write("factory:ownership", factory, "SplitRiskPoolFactory", "transferOwnership", [timelock]);
    for (const [index, config] of YIELD_ASSETS.entries()) {
      await run.write(`pool:${config.id}:approve-bond`, usd, "BscTestToken", "approve", [factory, YIELD_DEMO.bond]);
      const receipt = await run.write(`pool:${config.id}:create`, factory, "SplitRiskPoolFactory", "createPool", [
        tokens[index],
        config.symbol,
        usd,
        "TestUSDC",
        1000n,
        100n,
        15000n,
        YIELD_DEMO.bond,
      ]);
      let pool = manifest.pools[config.id];
      if (broadcast) {
        const logs = receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs;
        const events = parseEventLogs({
          abi: artifact("SplitRiskPoolFactory").abi,
          logs,
          eventName: "PoolCreated",
        }).filter((event) => same(event.address, factory));
        assert.equal(events.length, 1, "Expected one factory PoolCreated event");
        const created = getAddress(events[0].args.poolAddress ?? events[0].args.pool);
        if (pool) assert(same(pool, created), `${config.id}: saved pool changed`);
        pool = created;
        manifest.pools[config.id] = pool;
        const runtime = await client.getCode({ address: pool });
        assertRuntimeMatches(artifact("ERC1967Proxy"), runtime, pool, {});
        manifest.poolProofs[config.id] = {
          address: pool,
          runtimeCodehash: keccak256(runtime),
          creationTxHash: receipt.transactionHash,
        };
        run.save();
      }
      if (pool) {
        await run.write(`pool:${config.id}:approve-backing`, usd, "BscTestToken", "approve", [
          pool,
          YIELD_DEMO.seedBacking,
        ]);
        await run.write(`pool:${config.id}:seed-backing`, pool, "SplitRiskPool", "depositBackingAsset", [
          usd,
          YIELD_DEMO.seedBacking,
          YIELD_DEMO.seedBacking,
        ]);
      }
      await run.write(`exchange:fund:${config.id}`, tokens[index], "BscYieldTestToken", "transfer", [
        exchange,
        config.inventory,
      ]);
    }
    await run.write("exchange:fund:TestUSDC", usd, "BscTestToken", "transfer", [exchange, YIELD_DEMO.quoteInventory]);
    await run.write("faucet:configure", faucet, "ConfigurableTokenFaucet", "setTokens", [
      [old("TestWBNB"), usd, ...tokens],
      [YIELD_DEMO.legacyDrip, YIELD_DEMO.quoteDrip, ...YIELD_ASSETS.map((c) => c.drip)],
    ]);
    await run.write("faucet:fund:tWBNB", old("TestWBNB"), "BscTestToken", "transfer", [
      faucet,
      YIELD_DEMO.legacyInventory,
    ]);
    await run.write("faucet:fund:TestUSDC", usd, "BscTestToken", "transfer", [faucet, YIELD_DEMO.quoteFaucetInventory]);
    for (const [index, config] of YIELD_ASSETS.entries())
      await run.write(`faucet:fund:${config.id}`, tokens[index], "BscYieldTestToken", "transfer", [
        faucet,
        config.faucetInventory,
      ]);
    await run.write("faucet:ownership", faucet, "ConfigurableTokenFaucet", "transferOwnership", [timelock]);
    if (!broadcast) {
      atomicJson(resolve(ROOT, "contracts/deployments/bsc-testnet-yield-assets-plan.json"), {
        chainId: 97,
        genesisHash: GENESIS,
        operator: EXPECTED_DEPLOYER,
        sourceManifestHash: manifest.sourceManifestHash,
        recipeHash,
        maximumFeeBudgetBNB: "0.03",
        transactions: run.plan,
        deferred: YIELD_ASSETS.filter((c) => !manifest.pools[c.id]).map((c) => ({
          after: `pool:${c.id}:create`,
          actions: ["approve exact backing seed", "deposit 100000 TestUSDC"],
          reason: "Factory pool address comes from canonical PoolCreated receipt",
        })),
      });
      console.log(
        `Prepared ${run.plan.length} unsigned transactions plus pool backing dependencies. No signatures or broadcast.`,
      );
      return;
    }
    await verifyYieldDeployment(run, original);
    manifest.status = "complete";
    manifest.factory = factory;
    manifest.compositeOracle = composite;
    manifest.oracle = oracle;
    manifest.exchange = exchange;
    manifest.faucet = faucet;
    manifest.quoteToken = usd;
    manifest.quoteTokenCodehash = original.contracts.TestUSDC.runtimeCodehash;
    manifest.timelock = timelock;
    manifest.assets = YIELD_ASSETS.map((config, index) => ({
      ...config,
      address: tokens[index],
      pool: manifest.pools[config.id],
    }));
    manifest.demo = {
      priceMode: "synthetic accelerated yield and downside formula",
      realYield: false,
      cycleSeconds: 240,
      minimumPoolTime: 60,
      unlockDuration: 120,
      notice: "Valueless test tokens: no real staking, APY, protocol claim or redemption.",
      operatorControls: "Factory and faucet governed by inherited two-day timelock; oracle and exchange have no admin.",
    };
    manifest.verifiedAt = new Date().toISOString();
    run.save();
    console.log(`Verified four synthetic BSC Testnet yield-asset pools and trading exchange: ${exchange}`);
  } finally {
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
