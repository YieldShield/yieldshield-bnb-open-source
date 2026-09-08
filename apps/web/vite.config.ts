import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // This edition only bundles the BSC testnet wallet implementation.
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_");
  const family = process.env.VITE_CHAIN_FAMILY ?? env.VITE_CHAIN_FAMILY ?? "evm";
  if (family !== "evm") throw new Error("The BNB edition requires the EVM chain adapter.");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@chain-impl": fileURLToPath(new URL(`./src/chain/impl.${family}.tsx`, import.meta.url)),
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: { port: 5174, proxy: { "/api/markets": "http://127.0.0.1:3002" } },
    build: {
      chunkSizeWarningLimit: 900,
    },
  };
});
