#!/usr/bin/env node
/** Read-only verification through the same adapter used by the website. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { createEvmAdapter, readFaucetStatus } from "../packages/adapter-evm/dist/index.js";
const local = process.argv.includes("--local");
const rpc = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
assert.equal(local, ["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpc).hostname));
const manifest = JSON.parse(
  readFileSync(
    new URL(
      local ? "../artifacts/local/bsc-deployment.json" : "../contracts/deployments/bsc-testnet-alpha.json",
      import.meta.url,
    ),
  ),
);
assert.equal(manifest.local, local);
assert.equal(manifest.chainId, 97);
assert.equal(manifest.status, "complete");
const address = (name) => manifest.contracts[name].address;
const client = createPublicClient({ chain: bscTestnet, transport: http(rpc) });
assert.equal(await client.getChainId(), 97);
assert.equal((await client.getBlock({ blockNumber: 0n })).hash, manifest.genesisHash);
const adapter = createEvmAdapter({
  chain: bscTestnet,
  rpcUrl: rpc,
  factory: address("Factory"),
  compositeOracle: address("CompositeOracle"),
  faucetAddress: address("Faucet"),
});
// Local Anvil has no preinstalled Multicall3; execute the same calls using viem's deployless helper.
if (local) {
  const multicall = adapter.publicClient.multicall;
  adapter.publicClient.multicall = (args) => multicall({ ...args, deployless: true });
}
const pools = await adapter.reader.loadPools();
const pool = pools.find((p) => p.address.toLowerCase() === manifest.pool.toLowerCase());
assert(pool, "Pool must be visible to the web adapter");
assert.equal(pool.shielded.symbol, "tWBNB");
assert.equal(pool.shielded.decimals, 18);
assert.equal(pool.backing.symbol, "TestUSDC");
assert.equal(pool.backing.decimals, 6);
assert.equal(pool.stats.active, true);
assert.equal(pool.oracle.paused, false);
const faucet = await readFaucetStatus(client, address("Faucet"), manifest.deployer, [
  address("TestWBNB"),
  address("TestUSDC"),
]);
assert(faucet.ready);
assert(faucet.tokens.every((t) => t.funded));
console.log(
  JSON.stringify({
    scope: local ? "local rehearsal" : "public BSC Testnet",
    pool: pool.address,
    tokens: [pool.shielded.symbol, pool.backing.symbol],
    active: pool.stats.active,
    oraclePaused: pool.oracle.paused,
    faucetReady: faucet.ready,
    oracleLabel: adapter.info.oracleLabel,
  }),
);
