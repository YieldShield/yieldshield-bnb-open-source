import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicManifest, EXPECTED_DEPLOYER, GENESIS } from "./publish-bsc-deployment.mjs";
const hash = "0x" + "12".repeat(32),
  addr = "0x" + "12".repeat(20);
function manifest() {
  const c = { address: addr, runtimeCodehash: hash, txHash: hash };
  return {
    schemaVersion: 1,
    chainId: 97,
    local: false,
    genesisHash: GENESIS,
    status: "complete",
    deployer: EXPECTED_DEPLOYER,
    pool: addr,
    contracts: Object.fromEntries(
      [
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
      ].map((n) => [n, c]),
    ),
    transactions: Object.fromEntries(
      Array.from({ length: 43 }, (_, i) => [
        String(i),
        {
          status: "confirmed",
          hash,
          request: { chainId: 97 },
          receipt: { transactionHash: hash, blockHash: hash, blockNumber: "1" },
        },
      ]),
    ),
  };
}
test("complete public evidence reaches the on-chain verification stage", () =>
  assert.doesNotThrow(() => assertPublicManifest(manifest())));
for (const [name, change] of [
  ["local rehearsal", (m) => (m.local = true)],
  ["wrong chain", (m) => (m.chainId = 56)],
  ["wrong genesis", (m) => (m.genesisHash = hash)],
  ["incomplete deployment", (m) => (m.status = "preparing")],
  ["wrong operator", (m) => (m.deployer = addr)],
  ["missing pool", (m) => delete m.pool],
  ["missing runtime", (m) => delete m.contracts.Factory.runtimeCodehash],
  ["missing step", (m) => delete m.transactions["1"]],
  ["unconfirmed step", (m) => (m.transactions["1"].status = "submitted")],
  ["wrong transaction chain", (m) => (m.transactions["1"].request.chainId = 56)],
  ["substituted receipt", (m) => (m.transactions["1"].receipt.transactionHash = "0x" + "34".repeat(32))],
  ["unsealed receipt", (m) => (m.transactions["1"].receipt.blockHash = "0x" + "00".repeat(32))],
])
  test(`publication rejects ${name} before any output is written`, () => {
    const m = manifest();
    change(m);
    assert.throws(() => assertPublicManifest(m));
  });
