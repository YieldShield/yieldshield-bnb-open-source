#!/usr/bin/env node
/** Resumable operator walkthrough of four valueless demo references: buy, protect, sell, loss exit. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionData,
  parseEventLogs,
  parseEther,
  erc20Abi,
  erc721Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import {
  ROOT,
  artifact,
  atomicJson,
  SequentialDeployment,
  acquireDeploymentLock,
  readCanonicalReceipt,
} from "./bsc-deployment.mjs";
import { EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
import { verifyPublishedYieldDeployment } from "./verify-bsc-yield-assets.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const FLOW_AMOUNTS = {
  slisbnb: 5n * 10n ** 17n,
  wbeth: 5n * 10n ** 17n,
  susde: 500n * 10n ** 18n,
  vusdt: 1000n * 10n ** 8n,
};

/** Reconstruct intended actions independently of editable journal completion flags. */
export async function verifyYieldWalkthrough(client, journal, deployment) {
  const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
  const poolAbi = artifact("SplitRiskPool").abi,
    exchangeAbi = artifact("BscYieldTestExchange").abi;
  const oracleAbi = artifact("BscYieldScenarioOracle").abi;
  const expected = {
    "approve:quote": {
      to: deployment.quoteToken,
      abi: erc20Abi,
      fn: "approve",
      args: [deployment.exchange, 50000n * 10n ** 6n],
    },
  };
  for (const asset of deployment.assets) {
    const amount = FLOW_AMOUNTS[asset.id],
      a = journal.assets[asset.id];
    assert(a && a.complete);
    assert(same(a.token, asset.address));
    assert(same(a.pool, asset.pool));
    assert.equal(a.id, asset.id);
    assert.equal(a.symbol, asset.symbol);
    assert.equal(a.decimals, asset.decimals);
    assert.equal(BigInt(a.amount), amount);
    for (const [suffix, spender, quantity] of [
      ["approve-protection", asset.pool, amount * 2n],
      ["approve-sale", deployment.exchange, amount],
    ])
      expected[`${asset.id}:${suffix}`] = {
        to: asset.address,
        abi: erc20Abi,
        fn: "approve",
        args: [spender, quantity],
      };
    for (const suffix of ["protect", "protect-for-normal-exit"])
      expected[`${asset.id}:${suffix}`] = {
        to: asset.pool,
        abi: poolAbi,
        fn: "depositShieldedAsset",
        args: [asset.address, amount, amount],
      };
    for (const side of ["buy", "sell"])
      expected[`${asset.id}:${side}`] = {
        to: deployment.exchange,
        abi: exchangeAbi,
        fn: "swap",
        prefixArgs: [asset.address, side === "buy", side === "buy" ? amount * 3n : amount],
      };
    expected[`${asset.id}:normal-exit`] = {
      to: asset.pool,
      abi: poolAbi,
      fn: "shieldedWithdraw",
      args: [BigInt(a.normalReceiptTokenId), asset.address, (amount * 99n) / 100n],
    };
    expected[`${asset.id}:protected-exit`] = {
      to: asset.pool,
      abi: poolAbi,
      fn: "shieldedWithdraw",
      args: [BigInt(a.receiptTokenId), deployment.quoteToken, BigInt(a.valueAtDeposit) / 100n],
    };
  }
  assert.equal(Object.keys(expected).length, 33);
  assert.deepEqual(
    Object.keys(journal.transactions).sort(),
    Object.keys(expected).sort(),
    "Walkthrough actions differ from the intended 33-step recipe",
  );
  const receipts = {};
  for (const [id, action] of Object.entries(expected)) {
    const t = journal.transactions[id];
    assert.equal(t.status, "confirmed");
    assert.equal(t.hash, t.receipt.transactionHash);
    const receipt = await readCanonicalReceipt(client, t.hash, id);
    assert.equal(receipt.blockHash, t.receipt.blockHash);
    assert.equal(receipt.blockNumber, BigInt(t.receipt.blockNumber));
    const transaction = await client.getTransaction({ hash: t.hash });
    assert(same(transaction.from, EXPECTED_DEPLOYER));
    assert(same(transaction.to, action.to));
    assert.equal(transaction.input, t.request.data);
    assert.equal(transaction.chainId, 97);
    assert.equal(transaction.value, 0n);
    const decoded = decodeFunctionData({ abi: action.abi, data: transaction.input });
    assert.equal(decoded.functionName, action.fn);
    if (action.args) assert.deepEqual(decoded.args, action.args);
    if (action.prefixArgs) {
      assert.deepEqual(decoded.args.slice(0, 3), action.prefixArgs);
      assert(decoded.args[3] > 0n); // Exact historical price/transfer is proved by the Swapped receipt below.
    }
    receipts[id] = receipt;
  }
  for (const asset of deployment.assets) {
    const a = journal.assets[asset.id],
      amount = FLOW_AMOUNTS[asset.id];
    for (const [suffix, idField, hashField] of [
      ["protect", "receiptTokenId", "protectHash"],
      ["protect-for-normal-exit", "normalReceiptTokenId", "normalProtectHash"],
    ]) {
      const receipt = receipts[`${asset.id}:${suffix}`];
      const events = parseEventLogs({ abi: poolAbi, logs: receipt.logs, eventName: "ShieldedAssetDeposited" }).filter(
        (e) => same(e.address, asset.pool),
      );
      assert.equal(events.length, 1);
      assert(same(events[0].args.depositor, EXPECTED_DEPLOYER));
      assert(same(events[0].args.asset, asset.address));
      assert.equal(events[0].args.amount, amount);
      assert.equal(events[0].args.receiptTokenId, BigInt(a[idField]));
      assert.equal(a[hashField], receipt.transactionHash);
    }
    const depositBlock = await client.getBlock({ blockNumber: receipts[`${asset.id}:protect`].blockNumber });
    const entryPrice = await read(deployment.oracle, oracleAbi, "priceAt", [asset.address, depositBlock.timestamp]);
    const protectedValue = (amount * entryPrice) / 10n ** BigInt(asset.decimals);
    assert.equal(BigInt(a.depositTime), depositBlock.timestamp);
    assert.equal(BigInt(a.valueAtDeposit), protectedValue);
    for (const side of ["buy", "sell"]) {
      const events = parseEventLogs({
        abi: exchangeAbi,
        logs: receipts[`${asset.id}:${side}`].logs,
        eventName: "Swapped",
      }).filter((e) => same(e.address, deployment.exchange));
      assert.equal(events.length, 1);
      assert(same(events[0].args.trader, EXPECTED_DEPLOYER));
      assert(same(events[0].args.stock, asset.address));
      assert.equal(events[0].args.buy, side === "buy");
      assert.equal(events[0].args.stockAmount, side === "buy" ? amount * 3n : amount);
    }
    for (const [suffix, preferred, hashField, payoutField, minimum] of [
      ["normal-exit", asset.address, "normalExitHash", "normalPayout", (amount * 99n) / 100n],
      ["protected-exit", deployment.quoteToken, "exitHash", "payout", protectedValue / 100n],
    ]) {
      const receipt = receipts[`${asset.id}:${suffix}`];
      const events = parseEventLogs({ abi: poolAbi, logs: receipt.logs, eventName: "ShieldedWithdrawal" }).filter((e) =>
        same(e.address, asset.pool),
      );
      assert.equal(events.length, 1);
      assert(same(events[0].args.withdrawer, EXPECTED_DEPLOYER));
      assert(same(events[0].args.preferredAsset, preferred));
      assert(events[0].args.amount >= minimum);
      assert.equal(BigInt(a[payoutField]), events[0].args.amount);
      assert.equal(a[hashField], receipt.transactionHash);
    }
    const exitBlock = await client.getBlock({ blockNumber: receipts[`${asset.id}:protected-exit`].blockNumber });
    const exitPrice = await read(deployment.oracle, oracleAbi, "priceAt", [asset.address, exitBlock.timestamp]);
    assert(exitBlock.timestamp >= depositBlock.timestamp + 60n);
    assert(
      (amount * exitPrice) / 10n ** BigInt(asset.decimals) < protectedValue,
      `${asset.id}: protected exit did not occur in a downside scenario`,
    );
  }
}

export async function main() {
  assert(
    process.argv.length === 3 && ["--broadcast", "--check"].includes(process.argv[2]),
    "Use --broadcast or --check",
  );
  const broadcast = process.argv[2] === "--broadcast";
  const envPath = resolve(ROOT, "contracts/.env.bsc.local");
  const env = { ...process.env };
  if (broadcast && existsSync(envPath)) {
    execFileSync("git", ["check-ignore", "--quiet", envPath], { cwd: ROOT });
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const account = broadcast
    ? privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY)
    : { address: EXPECTED_DEPLOYER };
  assert(same(account.address, EXPECTED_DEPLOYER));
  const rpc = env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  assert(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname));
  const client = createPublicClient({ chain: bscTestnet, transport: http(rpc, { timeout: 20000, retryCount: 2 }) });
  const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
  const deploymentRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-yield-assets.json"), "utf8");
  const deployment = JSON.parse(deploymentRaw);
  await verifyPublishedYieldDeployment(client, deployment, originalRaw);
  const journalPath = resolve(ROOT, "contracts/deployments/bsc-testnet-yield-assets-flow.json");
  const journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : {
        schemaVersion: 1,
        chainId: 97,
        genesisHash: GENESIS,
        actor: EXPECTED_DEPLOYER,
        deploymentManifestHash: sha(deploymentRaw),
        exchange: deployment.exchange,
        status: "running",
        transactions: {},
        stages: {},
        assets: {},
      };
  assert.equal(journal.chainId, 97);
  assert.equal(journal.genesisHash, GENESIS);
  assert(same(journal.actor, EXPECTED_DEPLOYER));
  assert(same(journal.exchange, deployment.exchange));
  assert.equal(journal.deploymentManifestHash, sha(deploymentRaw), "Walkthrough deployment changed");
  const save = () => atomicJson(journalPath, journal);
  const release = broadcast ? acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock")) : () => {};
  const run = new SequentialDeployment({
    client,
    account,
    broadcast,
    manifestPath: journalPath,
    manifest: journal,
    maxFeePerGas: BigInt(env.BSC_TESTNET_MAX_GAS_PRICE_WEI ?? "5000000000"),
    spendLimit: parseEther("0.01"),
  });
  const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
  const balance = (token) => read(token, erc20Abi, "balanceOf", [account.address]);
  const poolAbi = artifact("SplitRiskPool").abi;
  const exchangeAbi = artifact("BscYieldTestExchange").abi;
  const oracleAbi = artifact("BscYieldScenarioOracle").abi;
  async function transact(id, target, abi, functionName, args) {
    const old = journal.transactions[id];
    const data = old?.request.data ?? encodeFunctionData({ abi, functionName, args });
    const decoded = decodeFunctionData({ abi, data });
    assert.equal(decoded.functionName, functionName, `${id}: persisted action changed`);
    if (old) assert(same(old.request.to, target), `${id}: persisted target changed`);
    for (let retry = 0; ; ++retry) {
      try {
        return await run.transaction(id, { to: target, data });
      } catch (error) {
        if (retry >= 12 || !error.message.includes("ten sealed block confirmations required")) throw error;
        await delay(2000);
      }
    }
  }
  async function approve(id, token, spender, amount) {
    if (journal.stages[id]?.complete) return;
    await transact(id, token, erc20Abi, "approve", [spender, amount]);
    assert((await read(token, erc20Abi, "allowance", [account.address, spender])) >= amount);
    journal.stages[id] = { complete: true };
    save();
  }
  async function trade(id, asset, side, amount) {
    if (journal.stages[id]?.complete) return;
    let stage = journal.stages[id];
    if (!stage) {
      const quote = await read(deployment.exchange, exchangeAbi, "quote", [asset.address, side === "buy", amount]);
      const block = await client.getBlock({ blockTag: "latest" });
      const limit = side === "buy" ? (quote[0] * 110n + 99n) / 100n : (quote[0] * 90n) / 100n;
      stage = {
        beforeAsset: String(await balance(asset.address)),
        beforeQuote: String(await balance(deployment.quoteToken)),
        amount: amount.toString(),
        limit: limit.toString(),
        deadline: String(block.timestamp + 180n),
      };
      journal.stages[id] = stage;
      save();
    }
    const receipt = await transact(id, deployment.exchange, exchangeAbi, "swap", [
      asset.address,
      side === "buy",
      amount,
      BigInt(stage.limit),
      BigInt(stage.deadline),
    ]);
    const events = parseEventLogs({
      abi: exchangeAbi,
      logs: receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs,
      eventName: "Swapped",
    }).filter((e) => same(e.address, deployment.exchange));
    assert.equal(events.length, 1);
    assert(same(events[0].args.trader, account.address));
    assert(same(events[0].args.stock, asset.address));
    assert.equal(events[0].args.stockAmount, amount);
    assert.equal(events[0].args.buy, side === "buy");
    const afterAsset = await balance(asset.address),
      afterQuote = await balance(deployment.quoteToken);
    assert.equal(
      side === "buy" ? afterAsset - BigInt(stage.beforeAsset) : BigInt(stage.beforeAsset) - afterAsset,
      amount,
    );
    assert.equal(
      side === "buy" ? BigInt(stage.beforeQuote) - afterQuote : afterQuote - BigInt(stage.beforeQuote),
      events[0].args.usdcAmount,
    );
    Object.assign(stage, { complete: true, hash: receipt.transactionHash });
    save();
  }
  async function waitForEntry() {
    const epoch = await read(deployment.oracle, oracleAbi, "epoch");
    for (let attempts = 0; attempts < 180; ++attempts) {
      const block = await client.getBlock({ blockTag: "latest" });
      const phase = (block.timestamp - epoch) % 240n;
      if (phase >= 15n && phase <= 60n) return;
      await delay(2000);
    }
    throw new Error("Timed out waiting for synthetic yield-growth entry phase");
  }
  try {
    if (broadcast) {
      await approve("approve:quote", deployment.quoteToken, deployment.exchange, 50000n * 10n ** 6n);
      for (const asset of deployment.assets) {
        const amount = FLOW_AMOUNTS[asset.id];
        const assetProof = (journal.assets[asset.id] ??= {
          id: asset.id,
          symbol: asset.symbol,
          token: asset.address,
          pool: asset.pool,
          amount: amount.toString(),
          decimals: asset.decimals,
        });
        assert(same(assetProof.token, asset.address));
        assert(same(assetProof.pool, asset.pool));
        await trade(`${asset.id}:buy`, asset, "buy", amount * 3n);
        await approve(`${asset.id}:approve-protection`, asset.address, asset.pool, amount * 2n);
        const depositId = `${asset.id}:protect`;
        if (!journal.stages[depositId]?.complete) {
          if (!journal.transactions[depositId]) await waitForEntry();
          const receipt = await transact(depositId, asset.pool, poolAbi, "depositShieldedAsset", [
            asset.address,
            amount,
            amount,
          ]);
          const events = parseEventLogs({
            abi: poolAbi,
            logs: receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs,
            eventName: "ShieldedAssetDeposited",
          }).filter((e) => same(e.address, asset.pool));
          assert.equal(events.length, 1);
          assert(same(events[0].args.depositor, account.address));
          assert.equal(events[0].args.amount, amount);
          const nft = await read(asset.pool, poolAbi, "shieldReceiptNFT");
          const receiptTokenId = events[0].args.receiptTokenId;
          assert(same(await read(nft, erc721Abi, "ownerOf", [receiptTokenId]), account.address));
          const position = await read(nft, artifact("ShieldReceiptNFT").abi, "getPosition", [receiptTokenId]);
          assetProof.receiptTokenId = receiptTokenId.toString();
          assetProof.valueAtDeposit = position.valueAtDeposit.toString();
          assetProof.depositTime = position.depositTime.toString();
          assetProof.protectHash = receipt.transactionHash;
          journal.stages[depositId] = { complete: true };
          save();
        }
        const normalDepositId = `${asset.id}:protect-for-normal-exit`;
        if (!journal.stages[normalDepositId]?.complete) {
          const receipt = await transact(normalDepositId, asset.pool, poolAbi, "depositShieldedAsset", [
            asset.address,
            amount,
            amount,
          ]);
          const events = parseEventLogs({
            abi: poolAbi,
            logs: receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs,
            eventName: "ShieldedAssetDeposited",
          }).filter((e) => same(e.address, asset.pool));
          assert.equal(events.length, 1);
          assert(same(events[0].args.depositor, account.address));
          assert.equal(events[0].args.amount, amount);
          assetProof.normalReceiptTokenId = events[0].args.receiptTokenId.toString();
          assetProof.normalProtectHash = receipt.transactionHash;
          journal.stages[normalDepositId] = { complete: true };
          save();
        }
        const normalExitId = `${asset.id}:normal-exit`;
        if (!journal.stages[normalExitId]?.complete) {
          const stage = (journal.stages[normalExitId] ??= { beforeAsset: String(await balance(asset.address)) });
          save();
          const receipt = await transact(normalExitId, asset.pool, poolAbi, "shieldedWithdraw", [
            BigInt(assetProof.normalReceiptTokenId),
            asset.address,
            (amount * 99n) / 100n,
          ]);
          const proceeds = (await balance(asset.address)) - BigInt(stage.beforeAsset);
          assert(proceeds >= (amount * 99n) / 100n, `${asset.id}: normal asset payout below floor`);
          const withdrawals = parseEventLogs({
            abi: poolAbi,
            logs: receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs,
            eventName: "ShieldedWithdrawal",
          }).filter((e) => same(e.address, asset.pool));
          assert.equal(withdrawals.length, 1);
          assert(same(withdrawals[0].args.preferredAsset, asset.address));
          assetProof.normalExitHash = receipt.transactionHash;
          assetProof.normalPayout = proceeds.toString();
          Object.assign(stage, { complete: true, hash: receipt.transactionHash });
          save();
        }
        await approve(`${asset.id}:approve-sale`, asset.address, deployment.exchange, amount);
        await trade(`${asset.id}:sell`, asset, "sell", amount);
        const exitId = `${asset.id}:protected-exit`;
        if (!journal.stages[exitId]?.complete) {
          let stage = journal.stages[exitId];
          if (!stage) {
            for (let attempts = 0; ; ++attempts) {
              const block = await client.getBlock({ blockTag: "latest" });
              const price = await read(deployment.oracle, oracleAbi, "getPrice", [asset.address]);
              const currentValue = (amount * price) / 10n ** BigInt(asset.decimals);
              if (
                block.timestamp >= BigInt(assetProof.depositTime) + 60n &&
                currentValue < BigInt(assetProof.valueAtDeposit)
              ) {
                stage = {
                  beforeQuote: String(await balance(deployment.quoteToken)),
                  currentValue: currentValue.toString(),
                  protectedValue: assetProof.valueAtDeposit,
                };
                journal.stages[exitId] = stage;
                save();
                break;
              }
              if (attempts >= 180)
                throw new Error(`${asset.id}: timed out waiting for synthetic downside and minimum holding time`);
              await delay(2000);
            }
          }
          const minimum = BigInt(assetProof.valueAtDeposit) / 100n;
          const receipt = await transact(exitId, asset.pool, poolAbi, "shieldedWithdraw", [
            BigInt(assetProof.receiptTokenId),
            deployment.quoteToken,
            minimum,
          ]);
          const proceeds = (await balance(deployment.quoteToken)) - BigInt(stage.beforeQuote);
          assert(proceeds >= minimum, `${asset.id}: protected quote payout below initial value`);
          const withdrawals = parseEventLogs({
            abi: poolAbi,
            logs: receipt.logs ?? (await client.getTransactionReceipt({ hash: receipt.transactionHash })).logs,
            eventName: "ShieldedWithdrawal",
          }).filter((e) => same(e.address, asset.pool));
          assert.equal(withdrawals.length, 1);
          assert(same(withdrawals[0].args.withdrawer, account.address));
          assetProof.exitHash = receipt.transactionHash;
          assetProof.payout = proceeds.toString();
          assetProof.downsideValue = stage.currentValue;
          Object.assign(stage, { complete: true, hash: receipt.transactionHash });
          save();
        }
        assetProof.complete = true;
        save();
        console.log(`Verified ${asset.symbol}: buy, protect, normal exit, sell, and protected downside exit.`);
      }
      journal.status = "complete";
      journal.verifiedAt = new Date().toISOString();
      save();
    }
    assert.equal(journal.status, "complete", "Walkthrough not complete");
    assert.equal(Object.keys(journal.assets).length, 4);
    for (const asset of deployment.assets) assert.equal(journal.assets[asset.id]?.complete, true);
    await verifyYieldWalkthrough(client, journal, deployment);
    const walkthrough = {
      status: "complete",
      verifiedAt: new Date().toISOString(),
      scope: "Valueless BSC Testnet demo reference tokens: four buy/protect/normal-exit/sell/protected-downside exits",
      assets: Object.values(journal.assets),
      transactions: Object.entries(journal.transactions).map(([id, t]) => ({
        id,
        hash: t.hash,
        blockNumber: t.receipt.blockNumber,
      })),
    };
    for (const path of [
      "apps/web/src/data/bsc-yield-testnet-proof.json",
      "apps/web/public/bsc-yield-testnet-proof.json",
    ]) {
      const proof = JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
      proof.walkthrough = walkthrough;
      atomicJson(resolve(ROOT, path), proof);
    }
    console.log("Verified all four canonical yield-demo walkthroughs and published trimmed proof.");
  } finally {
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.shortMessage ?? e.message);
    process.exitCode = 1;
  });
