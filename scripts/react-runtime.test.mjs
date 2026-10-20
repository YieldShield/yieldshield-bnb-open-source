import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

test("the app and wallet adapters share a compatible React renderer", () => {
  const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const React = web("react");
  const { renderToStaticMarkup } = web("react-dom/server");
  for (const adapter of ["adapter-evm", "adapter-solana"]) {
    const requireAdapter = createRequire(new URL(`../packages/${adapter}/package.json`, import.meta.url));
    assert.equal(requireAdapter("react"), React, `${adapter} must share the app's React instance`);
  }
  assert.equal(renderToStaticMarkup(React.createElement("span", null, "ready")), "<span>ready</span>");
});
