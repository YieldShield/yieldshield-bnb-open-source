#!/usr/bin/env node
/** One resumable, valueless six-token claim through the compiled frontend adapter. --check never loads a signer. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionData,
  parseEventLogs,
  parseEther,
  erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "../packages/adapter-evm/dist/chains.js";
import { DEPLOYMENTS } from "../packages/adapter-evm/dist/deployments.js";
import { ADDITIONAL_DEPLOYMENTS } from "../packages/adapter-evm/dist/yield-deployments.js";
import { YIELD_DEMO_DEPLOYMENTS } from "../packages/adapter-evm/dist/demo-deployments.js";
import { readDemoMarket } from "../packages/adapter-evm/dist/demo-trading.js";
import { readFaucetStatus, extractFaucetClaim } from "../packages/adapter-evm/dist/faucet.js";
import { planIntent } from "../packages/adapter-evm/dist/intents.js";
import { tokenFaucetAbi } from "../packages/adapter-evm/dist/abis/tokenFaucet.js";
import {
  ROOT,
  atomicJson,
  SequentialDeployment,
  acquireDeploymentLock,
  readCanonicalReceipt,
} from "./bsc-deployment.mjs";
import { EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
import { verifyPublishedYieldDeployment } from "./verify-bsc-yield-assets.mjs";
import { YIELD_ASSETS, YIELD_DEMO } from "./deploy-bsc-yield-assets.mjs";

const ID = "faucet:claim";
const BUDGET = parseEther("0.001");
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const stringify = (value) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

export function expectedFaucetTokens(deployment, original) {
  return [
    { address: original.contracts.TestWBNB.address, symbol: "tWBNB", decimals: 18, amount: YIELD_DEMO.legacyDrip },
    { address: deployment.quoteToken, symbol: "TestUSDC", decimals: 6, amount: YIELD_DEMO.quoteDrip },
    ...YIELD_ASSETS.map((config, index) => ({
      address: deployment.assets[index].address,
      symbol: config.symbol,
      decimals: config.decimals,
      amount: config.drip,
    })),
  ];
}

/** Derive evidence from one canonical transaction, exact events and block-pinned balance changes, never completion flags. */
export async function verifyYieldFaucetCheck(client, journal, source, tokens) {
  assert.equal(journal.chainId, 97);
  assert.equal(journal.genesisHash, GENESIS);
  assert(same(journal.actor, EXPECTED_DEPLOYER));
  assert(same(journal.faucet, source.address));
  assert.equal(tokens.length, 6);
  assert.equal(new Set(tokens.map((token) => token.address.toLowerCase())).size, 6);
  assert.deepEqual(Object.keys(journal.transactions), [ID], "Only one reviewed faucet claim is permitted");
  const entry = journal.transactions[ID];
  assert.equal(entry.status, "confirmed");
  assert.equal(entry.hash, entry.receipt.transactionHash);
  assert.equal(entry.request.chainId, 97);
  assert.equal(BigInt(entry.request.value), 0n);
  assert(same(entry.request.to, source.address));
  const data = encodeFunctionData({ abi: tokenFaucetAbi, functionName: "dripAll", args: [EXPECTED_DEPLOYER] });
  assert.equal(entry.request.data, data, "Saved faucet calldata changed");
  assert(BigInt(entry.request.gas) > 0n && BigInt(entry.request.gas) <= 16_000_000n);
  assert(
    BigInt(entry.request.gasPrice) >= 0n && BigInt(entry.request.gas) * BigInt(entry.request.gasPrice) <= BUDGET,
    "Faucet maximum transaction fee exceeds 0.001 test BNB",
  );
  const receipt = await readCanonicalReceipt(client, entry.hash, ID);
  assert.equal(receipt.blockNumber, BigInt(entry.receipt.blockNumber));
  assert.equal(receipt.blockHash, entry.receipt.blockHash);
  extractFaucetClaim(receipt, source.address, EXPECTED_DEPLOYER);
  const transaction = await client.getTransaction({ hash: entry.hash });
  assert(same(transaction.from, EXPECTED_DEPLOYER));
  assert(same(transaction.to, source.address));
  assert.equal(transaction.input, data);
  assert.equal(transaction.value, 0n);
  assert.equal(transaction.chainId, 97);
  assert.equal(transaction.nonce, entry.request.nonce);
  assert.equal(transaction.gas, BigInt(entry.request.gas));
  assert.equal(transaction.gasPrice, BigInt(entry.request.gasPrice));
  const decoded = decodeFunctionData({ abi: tokenFaucetAbi, data: transaction.input });
  assert.equal(decoded.functionName, "dripAll");
  assert.deepEqual(decoded.args, [EXPECTED_DEPLOYER]);
  const events = parseEventLogs({
    abi: tokenFaucetAbi,
    logs: receipt.logs,
    eventName: "TokensDripped",
    strict: true,
  }).filter((event) => same(event.address, source.address));
  assert.equal(events.length, 6, "Claim did not emit exactly six dispenser transfers");
  const priorNumber = receipt.blockNumber - 1n;
  const priorBlock = await client.getBlock({ blockNumber: priorNumber });
  assert.equal(priorBlock.number, priorNumber);
  assert(/^0x[0-9a-f]{64}$/i.test(priorBlock.hash ?? ""));
  const balances = await Promise.all(
    tokens.map(async (token) => {
      const matching = events.filter((event) => same(event.args.token, token.address));
      assert.equal(matching.length, 1, `${token.symbol}: missing or duplicate dispense event`);
      assert(same(matching[0].args.recipient, EXPECTED_DEPLOYER));
      assert.equal(matching[0].args.amount, token.amount, `${token.symbol}: unexpected dispense amount`);
      const balance = (blockNumber) =>
        client.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [EXPECTED_DEPLOYER],
          blockNumber,
        });
      const [before, after, dripAmount] = await Promise.all([
        balance(priorNumber),
        balance(receipt.blockNumber),
        client.readContract({
          address: source.address,
          abi: tokenFaucetAbi,
          functionName: "dripAmount",
          args: [token.address],
          blockNumber: receipt.blockNumber,
        }),
      ]);
      assert.equal(dripAmount, token.amount, `${token.symbol}: reviewed dispenser amount changed`);
      assert.equal(after - before, token.amount, `${token.symbol}: exact receipt-block balance increase missing`);
      return {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        amount: token.amount.toString(),
        beforeBalance: before.toString(),
        afterBalance: after.toString(),
      };
    }),
  );
  const checked = await readCanonicalReceipt(client, entry.hash, ID);
  assert.equal(checked.blockHash, receipt.blockHash);
  assert.equal((await client.getBlock({ blockNumber: priorNumber })).hash, priorBlock.hash);
  return {
    status: "complete",
    scope: "Internal operator claim through planIntent, beforeStep and extract; six synthetic tokens have no value.",
    actor: EXPECTED_DEPLOYER,
    faucet: source.address,
    verifiedAt: new Date().toISOString(),
    beforeBlockNumber: priorNumber.toString(),
    receiptBlockNumber: receipt.blockNumber.toString(),
    receiptBlockHash: receipt.blockHash,
    transactions: [{ id: ID, hash: entry.hash, blockNumber: receipt.blockNumber.toString() }],
    tokens: balances,
  };
}

export async function main() {
  assert(
    process.argv.length === 3 && ["--broadcast", "--check"].includes(process.argv[2]),
    "Use --broadcast or --check",
  );
  const broadcast = process.argv[2] === "--broadcast";
  const env = { ...process.env };
  const envPath = resolve(ROOT, "contracts/.env.bsc.local");
  if (broadcast && existsSync(envPath)) {
    execFileSync("git", ["check-ignore", "--quiet", envPath], { cwd: ROOT });
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const rpc = env.BSC_TESTNET_RPC_URL ?? bscTestnet.rpcUrls.default.http[0];
  assert(
    new URL(rpc).protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname),
    "Use a public HTTPS BSC Testnet RPC",
  );
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpc, { timeout: 20_000, retryCount: 2 }),
    batch: { multicall: true },
  });
  const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
  const deploymentRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-yield-assets.json"), "utf8");
  const deployment = JSON.parse(deploymentRaw);
  const proofPaths = [
    "apps/web/src/data/bsc-yield-testnet-proof.json",
    "apps/web/public/bsc-yield-testnet-proof.json",
  ].map((path) => resolve(ROOT, path));
  const proofs = proofPaths.map((path) => JSON.parse(readFileSync(path, "utf8")));
  const reviewed = { adapterVenue: proofs[0].adapterVenue, adapterDeployment: proofs[0].adapterDeployment };
  assert.deepEqual(
    JSON.parse(stringify(YIELD_DEMO_DEPLOYMENTS[97])),
    reviewed.adapterVenue,
    "Rebuild the adapter: reviewed venue differs from public proof",
  );
  const deploymentConfig = ADDITIONAL_DEPLOYMENTS[97]?.find((source) => same(source.faucet, deployment.faucet));
  assert(deploymentConfig, "Faucet has no reviewed adapter deployment");
  assert.deepEqual(
    JSON.parse(stringify(deploymentConfig)),
    reviewed.adapterDeployment,
    "Rebuild the adapter: reviewed protocol differs from public proof",
  );
  const source = deploymentConfig.faucetProof;
  for (const proof of proofs) {
    assert.equal(proof.chainId, 97);
    assert.equal(proof.genesisHash, GENESIS);
    assert.deepEqual(proof.adapterVenue, reviewed.adapterVenue);
    assert.deepEqual(proof.adapterDeployment, reviewed.adapterDeployment);
  }
  const journalPath = resolve(ROOT, "contracts/deployments/bsc-testnet-yield-faucet-check.json");
  if (!broadcast)
    assert(existsSync(journalPath), "No faucet transaction journal exists; run the authorized broadcast first");
  const journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : {
        schemaVersion: 1,
        chainId: 97,
        genesisHash: GENESIS,
        actor: EXPECTED_DEPLOYER,
        faucet: source.address,
        deploymentManifestHash: sha(deploymentRaw),
        reviewedAdapterHash: sha(stringify(reviewed)),
        status: "running",
        transactions: {},
      };
  assert.equal(journal.schemaVersion, 1);
  assert.equal(journal.chainId, 97);
  assert.equal(journal.genesisHash, GENESIS);
  assert(same(journal.actor, EXPECTED_DEPLOYER));
  assert(same(journal.faucet, source.address));
  assert.equal(journal.deploymentManifestHash, sha(deploymentRaw));
  assert.equal(journal.reviewedAdapterHash, sha(stringify(reviewed)));
  const release = acquireDeploymentLock(resolve(ROOT, "contracts/.bsc-testnet-deployment.lock"));
  try {
    assert.equal(await client.getChainId(), 97);
    assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
    const original = await verifyPublishedYieldDeployment(client, deployment, originalRaw);
    await readDemoMarket(client); // Pin code hashes, synthetic identities, decimals and all venue routing.
    const tokens = expectedFaucetTokens(deployment, original);
    assert.deepEqual(
      source.tokens.map((address) => address.toLowerCase()),
      tokens.map((token) => token.address.toLowerCase()),
    );
    const intent = { kind: "faucetDrip", recipient: EXPECTED_DEPLOYER, faucet: source.address };
    const deps = {
      factory: DEPLOYMENTS[97].factory,
      factories: [DEPLOYMENTS[97].factory, deploymentConfig.factory],
      faucet: DEPLOYMENTS[97].faucet,
      faucets: [source],
    };
    if (broadcast) {
      let found;
      if (journal.transactions[ID]) {
        try {
          found = await client.getTransactionReceipt({ hash: journal.transactions[ID].hash });
        } catch (error) {
          if (error.name !== "TransactionReceiptNotFoundError") throw error;
        }
      }
      let plan;
      if (!found) {
        const status = await readFaucetStatus(
          client,
          source.address,
          EXPECTED_DEPLOYER,
          source.tokens,
          source.codehash,
        );
        assert(
          status.tokens.every((token) => token.enabled && token.funded && token.canDrip),
          "All six tokens must be funded and outside the operator's cooldown",
        );
        plan = await planIntent(client, EXPECTED_DEPLOYER, deps, intent);
        assert.equal(plan.steps.length, 1);
        const step = plan.steps[0];
        assert(same(step.address, source.address));
        assert.equal(step.functionName, "dripAll");
        assert.deepEqual(step.args, [EXPECTED_DEPLOYER]);
        await plan.beforeStep?.();
        await client.simulateContract({
          address: step.address,
          abi: step.abi,
          functionName: step.functionName,
          args: step.args,
          account: EXPECTED_DEPLOYER,
        });
      }
      const account = privateKeyToAccount(env.BSC_TESTNET_DEPLOYER_PRIVATE_KEY);
      assert(same(account.address, EXPECTED_DEPLOYER));
      const run = new SequentialDeployment({
        client,
        account,
        broadcast: true,
        manifestPath: journalPath,
        manifest: journal,
        maxFeePerGas: BigInt(env.BSC_TESTNET_MAX_GAS_PRICE_WEI ?? "5000000000"),
        spendLimit: BUDGET,
      });
      const data = encodeFunctionData({ abi: tokenFaucetAbi, functionName: "dripAll", args: [EXPECTED_DEPLOYER] });
      for (let retry = 0; ; ++retry) {
        try {
          await run.transaction(ID, { to: source.address, data });
          break;
        } catch (error) {
          if (retry >= 12 || !error.message.includes("ten sealed block confirmations required")) throw error;
          await delay(2_000);
        }
      }
      const receipt = await readCanonicalReceipt(client, journal.transactions[ID].hash, ID);
      if (plan) plan.extract?.(receipt);
    }
    const proof = await verifyYieldFaucetCheck(client, journal, source, tokens);
    journal.status = "complete";
    journal.faucetWalkthrough = proof;
    atomicJson(journalPath, journal);
    for (const path of proofPaths) {
      const current = JSON.parse(readFileSync(path, "utf8"));
      assert.deepEqual(current.adapterVenue, reviewed.adapterVenue);
      assert.deepEqual(current.adapterDeployment, reviewed.adapterDeployment);
      current.faucetWalkthrough = proof;
      atomicJson(path, current);
    }
    console.log(`Verified one adapter faucet claim and six exact balance increases: ${proof.transactions[0].hash}`);
  } finally {
    release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
