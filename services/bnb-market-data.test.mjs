import test from "node:test";
import assert from "node:assert/strict";
import { ASSETS, readSourceSnapshot, publicSnapshot } from "./bnb-market-data.mjs";
import { createMarketHandler } from "./bnb-market-handler.mjs";
const timestamp = 1_800_000_000;
const now = () => timestamp * 1000;
const success = (result) => ({ status: "success", result });
function client(overrides = {}) {
  return {
    getChainId: async () => 56,
    getBlockNumber: async () => 1010n,
    getBlock: async () => ({ number: 1000n, timestamp: BigInt(timestamp - 5), hash: `0x${"a".repeat(64)}` }),
    multicall: async ({ blockNumber, contracts }) => {
      assert.equal(blockNumber, 1000n);
      assert.equal(contracts.length, 12);
      return ASSETS.flatMap((a) => [
        success([2n, 500n * 10n ** 8n, BigInt(timestamp - 20), BigInt(timestamp - 20), 2n]),
        success(8),
        success(a.description),
      ]);
    },
    ...overrides,
  };
}
test("reads exactly the BSC catalog at one block and exposes source identity", async () => {
  const data = publicSnapshot(await readSourceSnapshot(client(), { now }), { now });
  assert.equal(data.chainId, 56);
  assert.equal(data.blockNumber, "1000");
  assert.equal(data.tokens.length, 4);
  assert.equal(data.tokens[0].priceUsd, 500);
  assert.equal(data.tokens[1].referenceSymbol, "BTC");
  assert.ok(data.tokens.every((a) => a.status === "reference-available"));
});
test("rejects the wrong chain, stale/future blocks and changed block identities", async () => {
  await assert.rejects(readSourceSnapshot(client({ getChainId: async () => 8453 }), { now }), /mainnet/);
  for (const offset of [-121, 1]) {
    await assert.rejects(
      readSourceSnapshot(
        client({
          getBlock: async () => ({ number: 1000n, timestamp: BigInt(timestamp + offset), hash: `0x${"a".repeat(64)}` }),
        }),
        { now },
      ),
      /block/,
    );
  }
  let reads = 0;
  await assert.rejects(
    readSourceSnapshot(
      client({
        getBlock: async () => ({
          number: 1000n,
          timestamp: BigInt(timestamp - 5),
          hash: `0x${(++reads === 1 ? "a" : "b").repeat(64)}`,
        }),
      }),
      { now },
    ),
    /changed/,
  );
});
test("bad individual feeds cannot enable a scenario or disable healthy tokens", async () => {
  const original = client();
  for (const mutation of [
    (rows) => {
      rows[0] = { status: "failure" };
    },
    (rows) => {
      rows[0].result[1] = 0n;
    },
    (rows) => {
      rows[0].result[1] = -10n;
    },
    (rows) => {
      rows[0].result[3] = BigInt(timestamp + 2);
    },
    (rows) => {
      rows[0].result[4] = 1n;
    },
    (rows) => {
      rows[1] = success(18);
    },
    (rows) => {
      rows[2] = success("BTC / USD");
    },
  ]) {
    const c = client({
      multicall: async (args) => {
        const rows = await original.multicall(args);
        mutation(rows);
        return rows;
      },
    });
    const data = publicSnapshot(await readSourceSnapshot(c, { now }), { now });
    assert.equal(data.tokens[0].status, "unavailable");
    assert.equal(data.tokens[0].priceUsd, null);
    assert.equal(data.tokens[1].status, "reference-available");
  }
});
test("cached reads preserve oracle age and expire at the source-block deadline", async () => {
  const original = client();
  const snapshot = await readSourceSnapshot(
    client({
      multicall: async (args) => {
        const rows = await original.multicall(args);
        rows[0].result[2] = rows[0].result[3] = BigInt(timestamp - 280);
        return rows;
      },
    }),
    { now },
  );
  assert.equal(publicSnapshot(snapshot, { now }).tokens[0].status, "reference-available");
  assert.equal(publicSnapshot(snapshot, { now: () => now() + 30_000 }).tokens[0].status, "stale");
  assert.throws(() => publicSnapshot(snapshot, { now: () => now() + 121_000 }), /expired/);
});
test("incomplete RPC responses fail the whole observation", async () => {
  await assert.rejects(readSourceSnapshot(client({ multicall: async () => [] }), { now }), /Incomplete/);
});
function response() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = body;
    },
  };
}
test("HTTP responses deduplicate concurrent reads, never allow POST or expose RPC errors", async () => {
  let reads = 0;
  const original = client();
  const handler = createMarketHandler(
    client({
      multicall: async (args) => {
        reads++;
        return original.multicall(args);
      },
    }),
    { now },
  );
  const a = response(),
    b = response();
  await Promise.all([handler({ method: "GET" }, a), handler({ method: "GET" }, b)]);
  assert.equal(reads, 1);
  assert.equal(a.statusCode, 200);
  assert.equal(a.headers["Cache-Control"], "no-store");
  const post = response();
  await handler({ method: "POST" }, post);
  assert.equal(post.statusCode, 405);
  const error = response();
  await createMarketHandler(
    client({
      getChainId: async () => {
        throw new Error("secret-rpc-url");
      },
    }),
    { now },
  )({ method: "GET" }, error);
  assert.equal(error.statusCode, 503);
  assert.ok(!error.body.includes("secret"));
});
