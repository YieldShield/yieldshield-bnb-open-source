import http from "node:http";
import { marketHandler } from "./bnb-market-handler.mjs";
const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/api/markets") return void marketHandler(req, res);
  res.setHeader("Content-Type", "application/json");
  res.statusCode = path === "/health" && req.method === "GET" ? 200 : 404;
  res.end(
    JSON.stringify(
      res.statusCode === 200 ? { service: "YieldShield BNB", transactionsEnabled: false } : { error: "Not found" },
    ),
  );
});
server.listen(Number(process.env.PORT || 3002), "127.0.0.1", () => console.log("YieldShield BNB market API ready"));
process.on("SIGTERM", () => server.close());
