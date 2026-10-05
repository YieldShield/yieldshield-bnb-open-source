#!/usr/bin/env node
/** Internal E2E check: reviewed, valueless chain-97 assets only. --check never loads a key. */
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createConfig, createConnector, connect, disconnect, http } from "@wagmi/core";
import { decodeFunctionData, encodeFunctionData, keccak256, parseEther, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createEvmAdapter,
  bscTestnet,
  sendEvmIntent,
  readCanonicalStepReceipt,
  readFaucetStatus,
} from "../packages/adapter-evm/dist/index.js";
import { planIntent } from "../packages/adapter-evm/dist/intents.js";
import { CREATION_FIXED } from "../packages/adapter-evm/dist/pool-creation.js";
import { BSC_TESTNET_GENESIS } from "../packages/adapter-evm/dist/creation-deployments.js";
import { ROOT, SequentialDeployment, atomicJson, acquireDeploymentLock } from "./bsc-deployment.mjs";
import { EXPECTED_DEPLOYER } from "./publish-bsc-deployment.mjs";

const journalPath = resolve(ROOT, "artifacts/local/bsc-e2e-check.json");
const proofPath = resolve(ROOT, "apps/web/public/bsc-e2e-proof.json");
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const serial = (value) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)));
const budget = parseEther("0.02");

export function assertTestRequest(request, actor, targets) {
  assert(same(request.from, actor), "Unexpected signing account");
  assert(request.chainId === undefined || BigInt(request.chainId) === 97n, "Wrong transaction chain");
  assert(BigInt(request.value ?? 0) === 0n, "Native transfers are outside this walkthrough");
  assert(
    targets.some((target) => same(target, request.to)),
    "Transaction target is not reviewed",
  );
  assert(/^0x[0-9a-f]+$/i.test(request.data), "Missing transaction calldata");
}

export async function main() {
  const mode = process.argv[2];
  assert(process.argv.length === 3 && ["--check", "--broadcast"].includes(mode), "Use --check or --broadcast");
  const adapter = createEvmAdapter({ chain: bscTestnet });
  const client = adapter.publicClient;
  assert.equal(await client.getChainId(), 97);
  assert.equal((await client.getBlock({ blockNumber: 0n })).hash, BSC_TESTNET_GENESIS);
  // Compare every deployed runtime to the deployment evidence, including inherited modules.
  let runtimeCount = 0;
  const addresses = new Set();
  for (const file of ["bsc-testnet-alpha.json", "bsc-testnet-trading.json", "bsc-testnet-yield-assets.json"]) {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments", file), "utf8"));
    assert.equal(manifest.chainId, 97);
    for (const contract of Object.values(manifest.contracts)) {
      if (addresses.has(contract.address.toLowerCase())) continue;
      const code = await client.getCode({ address: contract.address });
      assert(
        code && same(keccak256(code), contract.runtimeCodehash),
        "Deployed runtime differs from reviewed evidence",
      );
      addresses.add(contract.address.toLowerCase());
      runtimeCount++;
    }
  }
  const pools = await adapter.reader.loadPools();
  const market = await adapter.reader.getDemoMarket();
  assert.equal(market.assets.length, 5);
  assert(pools.length >= 7 && pools.every((pool) => pool.stats.active));
  const options = await adapter.reader.getPoolCreationOptions();
  assert.equal(options.length, 2);
  for (const asset of market.assets)
    for (const side of ["buy", "sell"]) {
      const quote = await adapter.reader.getDemoTradeQuote({
        asset: asset.token,
        side,
        amount: 10n ** BigInt(asset.decimals),
      });
      assert(quote.inputAmount > 0n && quote.outputAmount > 0n);
    }
  console.log(
    `Verified ${runtimeCount} deployed runtimes, ${pools.length} pools, five trading markets and both creation factories.`,
  );
  const journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : {
        schemaVersion: 1,
        chainId: 97,
        genesisHash: BSC_TESTNET_GENESIS,
        actor: EXPECTED_DEPLOYER,
        transactions: {},
        actions: {},
        createdPools: {},
      };
  assert.equal(journal.chainId, 97);
  assert.equal(journal.genesisHash, BSC_TESTNET_GENESIS);
  assert(same(journal.actor, EXPECTED_DEPLOYER));
  async function verifyAction(action) {
    assert(action.complete && action.steps.length > 0);
    let receipt;
    for (const [index, step] of action.steps.entries()) {
      const transaction = journal.transactions[`${action.id}:${index}`];
      assert(transaction?.status === "confirmed");
      const decoded = decodeFunctionData({ abi: step.abi, data: step.data });
      receipt = await readCanonicalStepReceipt(
        client,
        transaction.hash,
        journal.actor,
        { address: step.address, abi: step.abi, ...decoded },
        97,
      );
    }
    return receipt;
  }
  if (mode === "--check") {
    for (const action of Object.values(journal.actions)) await verifyAction(action);
    console.log(`Read-only verification passed for ${Object.keys(journal.actions).length} recorded actions.`);
    return;
  }
  mkdirSync(resolve(ROOT, "artifacts/local"), { recursive: true });
  const release = acquireDeploymentLock(resolve(ROOT, "artifacts/local/bsc-e2e.lock"));
  let config;
  try {
    const envFile = process.env.BSC_E2E_ENV_FILE ?? resolve(ROOT, "contracts/.env.bsc.local");
    const env = Object.fromEntries(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
        }),
    );
    const account = privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY);
    assert(same(account.address, EXPECTED_DEPLOYER), "Only the dedicated testnet operator may broadcast");
    const run = new SequentialDeployment({
      client,
      account,
      broadcast: true,
      manifestPath: journalPath,
      manifest: journal,
      maxFeePerGas: 5_000_000_000n,
      spendLimit: budget,
    });
    let active;
    let sent = 0;
    const targets = [...addresses, ...pools.map((pool) => pool.address)];
    async function confirmedTransaction(id, step) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await run.transaction(id, { to: step.address, data: step.data });
        } catch (error) {
          // A BSC RPC may report an advancing height before its sealed head catches up.
          // Reconcile the SAME persisted hash; never generate a replacement nonce.
          if (attempt >= 8 || !String(error.message).includes("ten sealed block confirmations required")) throw error;
          await delay(2000);
        }
      }
    }
    async function reconcileApprovalOnly(key, saved) {
      assert(saved.intent.kind === "demoTrade");
      const submitted = saved.steps.filter((_, index) => journal.transactions[`${saved.id}:${index}`]);
      assert(submitted.length > 0 && submitted.length < saved.steps.length, "Trade submission is ambiguous; stop");
      assert(
        !journal.transactions[`${saved.id}:${saved.steps.length - 1}`],
        "A trade was submitted; stop to reconcile",
      );
      for (const [index, step] of submitted.entries()) await confirmedTransaction(`${saved.id}:${index}`, step);
      const aborted = {
        ...saved,
        steps: submitted,
        complete: true,
        reason: "Approval confirmed; trade not submitted. A new bounded quote is required.",
      };
      await verifyAction(aborted);
      (journal.abortedActions ??= {})[saved.id] = aborted;
      delete journal.actions[key];
      (journal.attempts ??= {})[key] = (journal.attempts[key] ?? 0) + 1;
      atomicJson(journalPath, journal);
      console.log(`Reconciled approval only, without a duplicate trade: ${key}`);
    }
    for (const [key, saved] of Object.entries(journal.actions).filter(([, action]) => !action.complete)) {
      if (saved.intent.kind === "demoTrade") {
        await reconcileApprovalOnly(key, saved);
        continue;
      }
      // Recovery is deliberately limited to a fully submitted creation, whose exact
      // event can be reconciled independently of any later pool/position state.
      assert(saved.intent.kind === "createPool", "Reconcile an incomplete action before fresh signing");
      for (const [index, step] of saved.steps.entries()) {
        assert(journal.transactions[`${saved.id}:${index}`], "Creation was not fully submitted; stop to reconcile");
        await confirmedTransaction(`${saved.id}:${index}`, step);
      }
      saved.complete = true;
      const receipt = await verifyAction(saved);
      const lastStep = saved.steps.at(-1);
      const decoded = decodeFunctionData({ abi: lastStep.abi, data: lastStep.data });
      const events = parseEventLogs({ abi: lastStep.abi, logs: receipt.logs, eventName: "PoolCreated" }).filter(
        (event) => same(event.address, lastStep.address),
      );
      assert.equal(events.length, 1);
      const event = events[0].args;
      assert(same(event.creator, account.address));
      assert(same(event.shieldedToken, decoded.args[0]) && same(event.backingToken, decoded.args[2]));
      assert.equal(event.commissionRate, decoded.args[4]);
      assert.equal(event.poolFee, decoded.args[5]);
      assert.equal(event.collateralRatio, decoded.args[6]);
      saved.result = { txId: receipt.transactionHash, poolId: event.poolAddress };
      saved.completedAt = new Date().toISOString();
      atomicJson(journalPath, journal);
      console.log(`Reconciled existing canonical creation: ${saved.id}`);
    }
    const provider = {
      on() {},
      removeListener() {},
      async request({ method, params }) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
        if (method === "eth_chainId") return "0x61";
        if (method === "wallet_switchEthereumChain") {
          assert.equal(params[0].chainId, "0x61");
          return null;
        }
        if (method === "wallet_getCapabilities") {
          const e = new Error("Capabilities unsupported");
          e.code = -32601;
          throw e;
        }
        if (method === "eth_sendTransaction") {
          assert(active, "No reviewed action is active");
          const request = params[0];
          assertTestRequest(request, account.address, targets);
          const step = active.steps[sent];
          assert(
            step && same(step.address, request.to) && same(step.data, request.data),
            "Wallet request differs from reviewed plan",
          );
          const id = `${active.id}:${sent++}`;
          const receipt = await confirmedTransaction(id, step);
          return receipt.transactionHash;
        }
        return client.request({ method, params });
      },
    };
    const connector = createConnector(() => ({
      id: "bounded-testnet-operator",
      name: "Internal testnet operator",
      type: "injected",
      connect: async () => ({ accounts: [account.address], chainId: 97 }),
      disconnect: async () => {},
      getAccounts: async () => [account.address],
      getChainId: async () => 97,
      getProvider: async () => provider,
      isAuthorized: async () => true,
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {},
    }));
    config = createConfig({
      chains: [bscTestnet],
      connectors: [connector],
      transports: { 97: http(adapter.rpcUrl) },
      storage: null,
    });
    await connect(config, { connector: config.connectors[0] });
    const deps = {
      factory: adapter.addresses.factory,
      factories: adapter.addresses.factories,
      faucet: adapter.addresses.faucet,
      faucets: adapter.addresses.faucets,
    };
    async function action(id, intent) {
      if (journal.actions[id]?.complete) {
        await verifyAction(journal.actions[id]);
        return journal.actions[id].result;
      }
      assert(!journal.actions[id], "Incomplete action exists. Reconcile the saved hashes before any fresh signing.");
      const plan = await planIntent(client, account.address, deps, intent);
      const attemptId = journal.attempts?.[id] ? `${id}:retry${journal.attempts[id]}` : id;
      active = journal.actions[id] = {
        id: attemptId,
        intent: serial(intent),
        steps: plan.steps.map((step) => ({ address: step.address, abi: step.abi, data: encodeFunctionData(step) })),
        complete: false,
      };
      atomicJson(journalPath, journal);
      sent = 0;
      let result;
      try {
        result = await sendEvmIntent(adapter, config, account.address, intent);
      } catch (error) {
        if (
          intent.kind === "demoTrade" &&
          String(error.message).includes("synthetic price moved beyond your reviewed limit") &&
          !journal.transactions[`${active.id}:${active.steps.length - 1}`]
        ) {
          await reconcileApprovalOnly(id, active);
        }
        throw error;
      }
      active.result = result;
      active.complete = true;
      active.completedAt = new Date().toISOString();
      atomicJson(journalPath, journal);
      await verifyAction(active);
      console.log(`Confirmed: ${id}`);
      return result;
    }
    const source = adapter.addresses.faucets.at(-1);
    const faucet = await readFaucetStatus(client, source.address, account.address, source.tokens, source.codehash);
    if (faucet.ready && !journal.actions.faucet)
      await action("faucet", { kind: "faucetDrip", recipient: account.address, faucet: source.address });
    else
      assert(journal.actions.faucet?.complete, "Test-token dispenser is not eligible; wait for the current cooldown.");
    for (const symbol of ["tWBNB", "tvUSDT"]) {
      const asset = market.assets.find((asset) => asset.symbol === symbol);
      const settings = options.find((option) =>
        option.protectedAssets.some((asset) => same(asset.token, market.assets.find((a) => a.symbol === symbol).token)),
      );
      const created = await action(`${symbol}:create`, {
        kind: "createPool",
        params: {
          ...CREATION_FIXED,
          shieldedToken: asset.token,
          backingToken: market.quoteToken.token,
          commissionRateBp: 700,
          poolFeeBp: 50,
          collateralRatioBp: 17500,
          creationBondAmount: 500_000_000n,
        },
      });
      assert(created.poolId);
      journal.createdPools[symbol] = created.poolId;
      targets.push(created.poolId);
      atomicJson(journalPath, journal);
      assert(settings);
      const funded = await action(`${symbol}:fund`, {
        kind: "depositBacking",
        pool: created.poolId,
        backingToken: market.quoteToken.token,
        amount: 1_000_000_000n,
        minReceived: 995_000_000n,
      });
      journal.createdPools[`${symbol}:backing`] = funded.positionId;
      atomicJson(journalPath, journal);
    }
    for (const asset of market.assets) {
      const scale = 10n ** BigInt(asset.decimals);
      const amount = ["tWBNB", "tSlisBNB", "tWBETH"].includes(asset.symbol) ? scale / 10n : 10n * scale;
      const pool =
        journal.createdPools[asset.symbol] ?? pools.find((pool) => same(pool.shielded.token, asset.token)).address;
      async function trade(side) {
        for (let attempt = 0; ; attempt++) {
          const q = await adapter.reader.getDemoTradeQuote({
            asset: asset.token,
            side,
            amount,
            owner: account.address,
          });
          try {
            await action(`${asset.symbol}:${side}`, {
              kind: "demoTrade",
              asset: asset.token,
              side,
              amount,
              limit: side === "buy" ? (q.inputAmount * 10500n + 9999n) / 10000n : (q.outputAmount * 9500n) / 10000n,
              deadline: BigInt(q.quotedAt + 180),
            });
            return;
          } catch (error) {
            if (
              attempt >= 3 ||
              journal.actions[`${asset.symbol}:${side}`] ||
              !String(error.message).includes("synthetic price moved beyond your reviewed limit")
            )
              throw error;
            console.log(`Reviewing a fresh bounded ${side} quote: ${asset.symbol}`);
          }
        }
      }
      await trade("buy");
      const normal = await action(`${asset.symbol}:protect-normal`, {
        kind: "depositShielded",
        pool,
        shieldedToken: asset.token,
        backingToken: market.quoteToken.token,
        amount,
        minReceived: (amount * 995n) / 1000n,
      });
      const partial = await action(`${asset.symbol}:partial-exit`, {
        kind: "partialWithdrawShielded",
        pool,
        shieldedToken: asset.token,
        position: normal.positionId,
        amount: amount / 2n,
        minOut: ((amount / 2n) * 995n) / 1000n,
      });
      assert(partial.positionId);
      if (!journal.actions[`${asset.symbol}:normal-exit`]?.complete) {
        const positions = await adapter.reader.getOwnerPositions(account.address);
        const remaining = positions.shield.find((position) => position.id === partial.positionId);
        assert(remaining);
        await action(`${asset.symbol}:normal-exit`, {
          kind: "withdrawShielded",
          pool,
          shieldedToken: asset.token,
          position: partial.positionId,
          minOut: (remaining.withdrawableNet * 995n) / 1000n,
        });
      }
      const protectedPosition = await action(`${asset.symbol}:protect-loss-exit`, {
        kind: "depositShielded",
        pool,
        shieldedToken: asset.token,
        backingToken: market.quoteToken.token,
        amount,
        minReceived: (amount * 995n) / 1000n,
      });
      await trade("sell");
      const started = Date.now();
      while (!journal.actions[`${asset.symbol}:protected-exit`]?.complete) {
        try {
          const quote = await adapter.reader.getProtectedExitQuote(protectedPosition.positionId);
          await action(`${asset.symbol}:protected-exit`, {
            kind: "activateShielded",
            pool,
            shieldedToken: asset.token,
            backingToken: market.quoteToken.token,
            position: protectedPosition.positionId,
            minOut: (quote.amount * 995n) / 1000n,
          });
          break;
        } catch (error) {
          if (
            journal.actions[`${asset.symbol}:protected-exit`] ||
            Date.now() - started > 180000 ||
            !/delay|time|unlock|minimum/i.test(String(error.message))
          )
            throw error;
          console.log(`Waiting for public testnet exit delay: ${asset.symbol}`);
          await delay(5000);
        }
      }
    }
    for (const symbol of ["tWBNB", "tvUSDT"]) {
      const position = journal.createdPools[`${symbol}:backing`];
      if (journal.actions[`${symbol}:backing-exit`]?.complete) continue;
      await action(`${symbol}:start-notice`, { kind: "startUnlock", position });
      await action(`${symbol}:cancel-notice`, { kind: "cancelUnlock", position });
      await action(`${symbol}:restart-notice`, { kind: "startUnlock", position });
    }
    for (const symbol of ["tWBNB", "tvUSDT"]) {
      const position = journal.createdPools[`${symbol}:backing`];
      if (journal.actions[`${symbol}:backing-exit`]?.complete) continue;
      const started = Date.now();
      let p;
      while (true) {
        p = (await adapter.reader.getOwnerPositions(account.address)).protector.find((p) => p.id === position);
        assert(p);
        if (p.isUnlocking && p.noticeSecondsRemaining === 0n) break;
        assert(Date.now() - started < 180000, "Notice did not complete");
        console.log(`Waiting for public testnet backing notice: ${symbol}`);
        await delay(5000);
      }
      if (p.claimableCommission > 0n)
        await action(`${symbol}:premium`, {
          kind: "claimCommission",
          pool: p.pool,
          shieldedToken: market.assets.find((a) => a.symbol === symbol).token,
          position,
        });
      await action(`${symbol}:partial-backing-exit`, {
        kind: "partialWithdrawProtector",
        pool: p.pool,
        backingToken: market.quoteToken.token,
        position,
        amount: 100_000_000n,
        minOut: 99_500_000n,
      });
      p = (await adapter.reader.getOwnerPositions(account.address)).protector.find((p) => p.id === position);
      assert(p && p.availableToWithdraw === p.collateral);
      await action(`${symbol}:backing-exit`, {
        kind: "withdrawProtector",
        pool: p.pool,
        backingToken: market.quoteToken.token,
        position,
        minOut: (p.collateral * 995n) / 1000n,
      });
    }
    const proof = {
      schemaVersion: 1,
      chainId: 97,
      scope: "Internal operator integration check; valueless synthetic tokens only",
      checkedAt: new Date().toISOString(),
      runtimeCount,
      markets: market.assets.map((a) => a.symbol),
      createdPools: journal.createdPools,
      actions: Object.values(journal.actions).map(({ id, result, completedAt }) => ({ id, ...result, completedAt })),
      transactions: Object.values(journal.transactions).map(({ hash, receipt }) => ({
        hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        status: "success",
      })),
      maximumReservedTestBnbWei: Object.values(journal.transactions)
        .reduce((sum, t) => sum + BigInt(t.request.gas) * BigInt(t.request.gasPrice), 0n)
        .toString(),
    };
    atomicJson(proofPath, proof);
    console.log(`E2E passed: ${proof.actions.length} actions, ${proof.transactions.length} canonical transactions.`);
  } finally {
    if (config) await disconnect(config);
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
