import test from "node:test";
import assert from "node:assert/strict";
import { assertTestRequest } from "./bsc-e2e-check.mjs";

const actor = "0x1111111111111111111111111111111111111111";
const target = "0x2222222222222222222222222222222222222222";
const request = { from: actor, to: target, data: "0x12345678", chainId: "0x61", value: "0x0" };

test("the live test runner accepts a reviewed, zero-value chain-97 request", () => {
  assert.doesNotThrow(() => assertTestRequest(request, actor, [target]));
});
for (const [name, changes, message] of [
  ["mainnet", { chainId: "0x38" }, /Wrong transaction chain/],
  ["native transfer", { value: "0x1" }, /Native transfers/],
  ["different account", { from: target }, /Unexpected signing account/],
  ["unreviewed target", { to: actor }, /not reviewed/],
  ["empty calldata", { data: "0x" }, /Missing transaction calldata/],
]) {
  test(`the live test runner refuses ${name}`, () => {
    assert.throws(() => assertTestRequest({ ...request, ...changes }, actor, [target]), message);
  });
}
