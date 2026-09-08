import { createPublicClient, fallback, http } from "viem";
import { bsc } from "viem/chains";
import { readSourceSnapshot, publicSnapshot } from "./bnb-market-data.mjs";

export function createMarketHandler(client, { now = Date.now } = {}) {
  let snapshot;
  let savedAt = 0;
  let pending;
  return async function markets(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      if (!snapshot || now() - savedAt > 20_000) {
        if (!pending) pending = readSourceSnapshot(client, { now }).then((result) => {
          snapshot = result;
          savedAt = now();
        }).finally(() => { pending = undefined; });
        await pending;
      }
      // Evaluate time-sensitive state again on every response; cache age does not refresh feed age.
      const payload = publicSnapshot(snapshot, { now });
      res.statusCode = 200;
      res.end(JSON.stringify(payload));
    } catch {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "Live BNB Chain references are temporarily unavailable. Please try again." }));
    }
  };
}

const endpoints = process.env.BSC_MAINNET_RPC_URL
  ? [process.env.BSC_MAINNET_RPC_URL]
  : ["https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed.nariox.org"];
export const marketHandler = createMarketHandler(createPublicClient({
  chain: bsc,
  transport: fallback(endpoints.map((url) => http(url, { timeout: 6000, retryCount: 0 })), { retryCount: 0 }),
}));
