#!/usr/bin/env node
/** Resume only known saved transactions while BSC seals their confirmations. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runWithSealedConfirmationRetries(
  action,
  { attempts = 60, wait = (ms) => new Promise((done) => setTimeout(done, ms)), report = console.log } = {},
) {
  for (let attempt = 0; attempt < attempts; ++attempt) {
    try {
      return await action();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("ten sealed block confirmations required") ||
        attempt === attempts - 1
      )
        throw error;
      report("Waiting for sealed testnet confirmations before reconciling the saved transaction.");
      await wait(4000);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3 && process.argv[2] === "--broadcast", "Use --broadcast");
  const { main } = await import("./deploy-bsc-yield-assets.mjs");
  await runWithSealedConfirmationRetries(main);
}
