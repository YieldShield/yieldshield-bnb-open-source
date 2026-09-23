#!/usr/bin/env node
/** Read-only network checks; --write publishes entry points only after all checks succeed. No signer is loaded. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  http,
  getAddress,
  isAddress,
  keccak256,
  zeroAddress,
  zeroHash,
  encodeDeployData,
} from "viem";
import { bscTestnet } from "viem/chains";
import {
  ROOT,
  artifact,
  assertRuntimeMatches,
  linkBytecode,
  readCanonicalReceipt,
  SequentialDeployment,
} from "./bsc-deployment.mjs";
import { verifyDeployment } from "./deploy-bsc-testnet.mjs";
export const EXPECTED_DEPLOYER = "0x045f932e49fb395862794acEc3FCCc118BE2f27e";
export const GENESIS = "0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function assertPublicManifest(m) {
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.chainId, 97, "BSC Testnet only");
  assert.equal(m.local, false, "Local rehearsals must never be published");
  assert.equal(m.genesisHash, GENESIS, "Public testnet genesis required");
  assert.equal(m.status, "complete", "Public deployment must be complete");
  assert(same(m.deployer, EXPECTED_DEPLOYER), "Unexpected deployment operator");
  assert(isAddress(m.pool ?? "") && !same(m.pool, zeroAddress), "Missing public pool");
  for (const name of [
    "Factory",
    "CompositeOracle",
    "Faucet",
    "TestWBNB",
    "TestUSDC",
    "Timelock",
    "BscScenarioOracle",
    "BscPoolInitializeModule",
    "BasePoolRouter",
    "BaseFactoryRouter",
  ]) {
    const c = m.contracts?.[name];
    assert(c && isAddress(c.address) && !same(c.address, zeroAddress), `Missing ${name}`);
    assert(
      /^0x[\da-f]{64}$/i.test(c.runtimeCodehash ?? "") && c.runtimeCodehash !== zeroHash,
      `Missing ${name} runtime proof`,
    );
    assert(/^0x[\da-f]{64}$/i.test(c.txHash ?? ""), `Missing ${name} deployment receipt`);
  }
  assert(Object.keys(m.transactions ?? {}).length === 43, "Expected the complete 43-step deployment");
  for (const [id, t] of Object.entries(m.transactions)) {
    assert.equal(t.status, "confirmed", `${id} is not confirmed`);
    assert.equal(t.request?.chainId, 97, `${id} has wrong chain`);
    assert.equal(t.hash, t.receipt?.transactionHash, `${id} receipt mismatch`);
    assert(BigInt(t.receipt?.blockNumber ?? 0) > 0n);
    assert(
      /^0x[\da-f]{64}$/i.test(t.receipt?.blockHash ?? "") && t.receipt.blockHash !== zeroHash,
      `${id} unsealed receipt`,
    );
  }
}
export async function main() {
  assert(process.argv.length === 3 && ["--check", "--write"].includes(process.argv[2]), "Use --check or --write");
  const m = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/bsc-testnet-alpha.json")));
  assertPublicManifest(m);
  const rpc = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";
  assert(
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname),
    "Public verification cannot use loopback",
  );
  const client = createPublicClient({ chain: bscTestnet, transport: http(rpc, { timeout: 20000, retryCount: 2 }) });
  assert.equal(await client.getChainId(), 97);
  assert.equal((await client.getBlock({ blockNumber: 0n })).hash, GENESIS);
  const modules = JSON.parse(readFileSync(resolve(ROOT, "contracts/config/base-modules.json")));
  const run = new SequentialDeployment({
    client,
    account: { address: EXPECTED_DEPLOYER },
    broadcast: true,
    manifest: m,
  });
  for (const c of Object.values(m.contracts)) {
    for (const [file, libs] of Object.entries(artifact(c.artifact).bytecode.linkReferences ?? {}))
      for (const name of Object.keys(libs)) run.links[`${file}:${name}`] = m.contracts[name].address;
  }
  for (const [id, t] of Object.entries(m.transactions)) {
    const r = await readCanonicalReceipt(client, t.hash, id);
    assert.equal(r.blockHash, t.receipt.blockHash);
    assert.equal(r.blockNumber, BigInt(t.receipt.blockNumber));
    const actual = await client.getTransaction({ hash: t.hash });
    assert(same(actual.from, EXPECTED_DEPLOYER), `${id}: unexpected sender`);
    assert(same(actual.to ?? zeroAddress, t.request.to ?? zeroAddress), `${id}: unexpected target`);
    assert.equal(actual.input, t.request.data);
    assert.equal(actual.value, 0n);
    assert.equal(actual.chainId, 97);
  }
  for (const [name, c] of Object.entries(m.contracts)) {
    const a = artifact(c.artifact),
      code = await client.getCode({ address: c.address });
    assert(code && code !== "0x", `${name}: missing runtime`);
    assert.equal(keccak256(code), c.runtimeCodehash, `${name}: runtime changed`);
    assertRuntimeMatches(a, code, c.address, run.links);
    if (c.txHash) {
      const t = m.transactions[`deploy:${name}`];
      assert(t && t.hash === c.txHash, `${name}: missing recipe transaction`);
      assert.equal(
        t.request.data,
        encodeDeployData({
          abi: a.abi,
          bytecode: linkBytecode(a.bytecode.object, a.bytecode.linkReferences, run.links),
          args: c.constructorArguments,
        }),
        `${name}: constructor data changed`,
      );
      assert(same(t.receipt.contractAddress, c.address), `${name}: deployment address changed`);
    }
  }
  const address = (name) => m.contracts[name].address;
  const routers = { SplitRiskPool: address("BasePoolRouter"), SplitRiskPoolFactory: address("BaseFactoryRouter") };
  for (const [original, config] of Object.entries(modules))
    for (const [group, module] of Object.entries(config.modules)) {
      await run.expect(
        routers[original],
        config.router,
        group.toLowerCase() + "Module",
        [],
        address(original === "SplitRiskPool" && group === "Initialize" ? "BscPoolInitializeModule" : module.contract),
      );
    }
  await verifyDeployment(run, {
    timelock: address("Timelock"),
    factory: address("Factory"),
    composite: address("CompositeOracle"),
    shield: address("TestWBNB"),
    usd: address("TestUSDC"),
    oracle: address("BscScenarioOracle"),
    faucet: address("Faucet"),
    pool: m.pool,
    routers,
  });
  if (process.argv[2] === "--write") {
    const text = `// Generated after public BSC Testnet receipts, runtimes, routing and ownership verification.\nimport type { Address } from "viem";\nexport type EvmDeployment = { factory: Address; compositeOracle: Address; faucet?: Address; deploymentBlock?: bigint };\nexport const DEPLOYMENTS: Record<number, EvmDeployment> = {\n  97: {\n    factory: "${getAddress(address("Factory"))}",\n    compositeOracle: "${getAddress(address("CompositeOracle"))}",\n    faucet: "${getAddress(address("Faucet"))}",\n    deploymentBlock: ${BigInt(m.deploymentBlock)}n,\n  },\n};\n`;
    writeFileSync(resolve(ROOT, "packages/adapter-evm/src/deployments.ts"), text);
  }
  console.log(
    `Public BSC Testnet verified. ${process.argv[2] === "--write" ? "Frontend registry written." : "No files changed."} Pool: ${m.pool}`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.shortMessage ?? e.message);
    process.exitCode = 1;
  });
