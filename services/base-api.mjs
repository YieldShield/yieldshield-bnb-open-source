import http from "node:http";
import { createPublicClient, http as rpcHttp } from "viem";
import { base } from "viem/chains";
import { readSourceSnapshot, publicSnapshot } from "./base-market-data.mjs";
const source = createPublicClient({
  chain: base,
  transport: rpcHttp(process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org", { timeout: 12000, retryCount: 1 }),
});
let snapshot,
  lastSuccess = 0,
  updating = false;
async function refresh() {
  if (updating) return;
  updating = true;
  try {
    snapshot = await readSourceSnapshot(source);
    lastSuccess = Date.now();
  } catch {
    console.error("Source data unavailable; cached observations expire after two minutes.");
  } finally {
    updating = false;
  }
}
function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}
const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && path === "/health") {
    send(res, 200, {
      service: "YieldShield Base alpha",
      sourceReady: Date.now() - lastSuccess < 120000,
      relayEnabled: false,
    });
    return;
  }
  if (req.method === "GET" && (path === "/api/markets" || path === "/markets")) {
    try {
      if (!snapshot) throw new Error("Unavailable");
      send(res, 200, publicSnapshot(snapshot));
    } catch {
      send(res, 503, { error: "Live Base stock references are temporarily unavailable." });
    }
    return;
  }
  send(res, 404, { error: "Not found" });
});
server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () => console.log("YieldShield Base API listening"));
void refresh();
const interval = setInterval(() => void refresh(), 60000);
process.on("SIGTERM", () => {
  clearInterval(interval);
  server.close();
});
