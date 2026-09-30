import test from "node:test";
import assert from "node:assert/strict";
import { runWithSealedConfirmationRetries } from "./resume-bsc-yield-deployment.mjs";

const options = { wait: async () => {}, report: () => {} };
test("reconciles a saved transaction after confirmations seal", async () => {
  let calls = 0;
  const result = await runWithSealedConfirmationRetries(async () => {
    if (++calls < 3) throw new Error("deploy:token: ten sealed block confirmations required");
    return "confirmed";
  }, options);
  assert.equal(result, "confirmed");
  assert.equal(calls, 3);
});
test("unknown nonce, revert and runtime failures are never retried", async () => {
  for (const message of ["Unrelated pending transaction", "transaction reverted", "runtime changed"]) {
    let calls = 0;
    await assert.rejects(
      runWithSealedConfirmationRetries(async () => {
        calls++;
        throw new Error(message);
      }, options),
      { message },
    );
    assert.equal(calls, 1);
  }
});
test("confirmation retries are bounded", async () => {
  let calls = 0;
  await assert.rejects(
    runWithSealedConfirmationRetries(
      async () => {
        calls++;
        throw new Error("ten sealed block confirmations required");
      },
      { ...options, attempts: 2 },
    ),
  );
  assert.equal(calls, 2);
});
