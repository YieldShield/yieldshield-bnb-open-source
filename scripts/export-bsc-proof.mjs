#!/usr/bin/env node
/** Export public evidence only after the independently verified frontend registry exists. No network or signer. */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./bsc-deployment.mjs";
import { assertPublicManifest } from "./publish-bsc-deployment.mjs";
import { assertTradingManifest } from "./verify-bsc-trading.mjs";
const originalRaw = readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json"), "utf8");
const m = JSON.parse(originalRaw);
assertPublicManifest(m);
const registry = readFileSync(resolve(ROOT, "packages/adapter-evm/src/deployments.ts"), "utf8").toLowerCase();
assert(
  registry.includes(m.contracts.Factory.address.toLowerCase()) &&
    registry.includes(m.contracts.Faucet.address.toLowerCase()),
  "Publish verified frontend registry before exporting evidence",
);
const flowPath = resolve(ROOT, "contracts/deployments/bsc-testnet-flow.json");
const flow = existsSync(flowPath) ? JSON.parse(readFileSync(flowPath)) : null;
const completed =
  flow?.status === "complete" && flow.pool === m.pool && flow.actor.toLowerCase() === m.deployer.toLowerCase();
const trading = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-trading.json")));
assertTradingManifest(trading, m, originalRaw);
const tradeRegistry = readFileSync(resolve(ROOT, "packages/adapter-evm/src/demo-deployments.ts"), "utf8").toLowerCase();
assert(
  tradeRegistry.includes(trading.exchange.toLowerCase()),
  "Publish verified trading registry before exporting evidence",
);
const tradeFlowPath = resolve(ROOT, "contracts/deployments/bsc-testnet-trading-flow.json");
const tradeFlow = existsSync(tradeFlowPath) ? JSON.parse(readFileSync(tradeFlowPath)) : null;
const tradingCompleted =
  tradeFlow?.status === "complete" &&
  tradeFlow.exchange.toLowerCase() === trading.exchange.toLowerCase() &&
  tradeFlow.pool.toLowerCase() === m.pool.toLowerCase() &&
  tradeFlow.actor.toLowerCase() === m.deployer.toLowerCase() &&
  Object.keys(tradeFlow.transactions).length === 6 &&
  Object.values(tradeFlow.transactions).every((transaction) => transaction.status === "confirmed");
const verifiedPath = resolve(ROOT, "contracts/deployments/bsc-source-verification.json");
const sources = existsSync(verifiedPath) ? JSON.parse(readFileSync(verifiedPath)) : null;
const contracts = Object.entries(m.contracts).map(([name, c]) => ({
  name,
  address: c.address,
  artifact: c.artifact,
  runtimeCodehash: c.runtimeCodehash,
  creationTransaction: c.txHash ?? m.transactions["pool:create"].hash,
}));
contracts.push({
  name: "Pool",
  address: m.pool,
  artifact: "ERC1967Proxy",
  runtimeCodehash: null,
  creationTransaction: m.transactions["pool:create"].hash,
});
contracts.push({
  name: "BscTestExchange",
  address: trading.exchange,
  artifact: "BscTestExchange",
  runtimeCodehash: trading.contracts.BscTestExchange.runtimeCodehash,
  creationTransaction: trading.transactions["deploy:BscTestExchange"].hash,
});
const proof = {
  schemaVersion: 1,
  network: "BSC Testnet",
  chainId: 97,
  genesisHash: m.genesisHash,
  pool: m.pool,
  operator: m.deployer,
  deployedAt: m.verifiedAt,
  contracts,
  sourceVerification: contracts.every(
    (c) =>
      sources?.contracts?.[c.address.toLowerCase()]?.runtimeMatch === "exact_match" &&
      sources?.contracts?.[c.address.toLowerCase()]?.creationMatch === "exact_match",
  )
    ? "exact_match"
    : "pending",
  deploymentTransactions: Object.entries(m.transactions)
    .map(([action, t]) => ({
      action,
      hash: t.hash,
      blockNumber: t.receipt.blockNumber,
    }))
    .concat(
      Object.entries(trading.transactions).map(([action, t]) => ({
        action: `trading:${action}`,
        hash: t.hash,
        blockNumber: t.receipt.blockNumber,
      })),
    ),
  trading: {
    exchange: trading.exchange,
    pair: "tWBNB / TestUSDC",
    feeBps: 30,
    initialInventory: { tWBNB: "250", TestUSDC: "250000" },
    operatorWalkthrough: tradingCompleted
      ? {
          scope: tradeFlow.scope,
          actor: tradeFlow.actor,
          completedAt: tradeFlow.completedAt,
          positionId: tradeFlow.stages["protect:one"].positionId,
          transactions: Object.entries(tradeFlow.transactions).map(([action, t]) => ({
            action,
            hash: t.hash,
            blockNumber: t.receipt.blockNumber,
          })),
        }
      : null,
  },
  walkthrough: completed
    ? {
        scope: flow.scope,
        actor: flow.actor,
        completedAt: flow.completedAt,
        transactions: Object.entries(flow.transactions).map(([action, t]) => {
          assert.equal(t.status, "confirmed");
          const [stage, index] = action.split(":");
          return {
            action,
            label: flow.stages[stage]?.steps[Number(index)]?.label ?? action,
            hash: t.hash,
            blockNumber: t.receipt.blockNumber,
          };
        }),
      }
    : null,
  limitations: [
    "Synthetic valueless assets; no real deposits or TVL",
    "Internal testing; no independent company audit",
    "Operator walkthroughs are not independent user adoption",
    "Trading prices follow a synthetic four-minute scenario, not a real BNB feed",
    "Centralized operator behind a two-day timelock",
  ],
};
for (const path of ["apps/web/src/data/bsc-testnet-proof.json", "apps/web/public/bsc-testnet-proof.json"]) {
  const target = resolve(ROOT, path);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, JSON.stringify(proof, null, 2) + "\n");
}
console.log(
  `Exported ${contracts.length} contract addresses, ${proof.deploymentTransactions.length} deployment receipts, ${proof.walkthrough?.transactions.length ?? 0} protection and ${proof.trading.operatorWalkthrough?.transactions.length ?? 0} trading walkthrough receipts.`,
);
