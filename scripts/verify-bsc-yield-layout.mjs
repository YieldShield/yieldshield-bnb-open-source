#!/usr/bin/env node
/** Read-only layout and size guard for the testnet adapter. Compile with --extra-output storageLayout. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { artifact } from "./bsc-deployment.mjs";
export function assertYieldInitializerLayout(original, adapter) {
  assert(original.storageLayout && adapter.storageLayout, "Compile with --extra-output storageLayout");
  const describe = (layout, id) => {
    const t = layout.types[id];
    const result = { encoding: t.encoding, label: t.label, numberOfBytes: t.numberOfBytes };
    if (t.members)
      result.members = t.members.map((m) => ({
        label: m.label,
        slot: m.slot,
        offset: m.offset,
        type: describe(layout, m.type),
      }));
    for (const key of ["key", "value", "base"]) if (t[key]) result[key] = describe(layout, t[key]);
    return result;
  };
  const prefixLength = original.storageLayout.storage.findIndex((s) => s.label === "poolConfig") + 1;
  assert(prefixLength > 0, "Original pool configuration missing");
  const baseline = original.storageLayout.storage
    .slice(0, prefixLength)
    .map((s) => ({ label: s.label, slot: s.slot, offset: s.offset, type: describe(original.storageLayout, s.type) }));
  const actual = adapter.storageLayout.storage.map((s) => ({
    label: s.label === "_poolConfig" ? "poolConfig" : s.label,
    slot: s.slot,
    offset: s.offset,
    type: describe(adapter.storageLayout, s.type),
  }));
  assert.deepEqual(actual, baseline, "Yield initializer storage prefix differs from original module");
  const config = adapter.storageLayout.storage.find((s) => s.label === "_poolConfig");
  assert.equal(config.slot, "50");
  const members = adapter.storageLayout.types[config.type].members;
  assert.equal(members.find((m) => m.label === "minimumPoolTime").slot, "5");
  assert.equal(members.find((m) => m.label === "unlockDuration").slot, "6");
}
export function main() {
  assertYieldInitializerLayout(artifact("BasePoolInitializeModule"), artifact("BscYieldPoolInitializeModule"));
  for (const name of [
    "BscYieldTestToken",
    "BscYieldScenarioOracle",
    "BscYieldTestExchange",
    "BscYieldPoolInitializeModule",
  ]) {
    const a = artifact(name);
    assert((a.deployedBytecode.object.length - 2) / 2 <= 24576, `${name}: runtime limit exceeded`);
    assert((a.bytecode.object.length - 2) / 2 <= 49152, `${name}: initcode limit exceeded`);
  }
  console.log("Yield initializer preserves original slots0..58; timing slots55/56 and contract sizes verified.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
