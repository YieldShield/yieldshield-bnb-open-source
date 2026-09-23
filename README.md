# YieldShield on BNB Chain

A working token-risk preview with a yellow BNB design, live BNB Smart Chain price references, and interactive collateral scenarios.

- Website: https://bnb.yieldshield.ai
- Token explorer: https://bnb.yieldshield.ai/markets
- Operator: Hawig Ventures UG (haftungsbeschränkt), Germany
- Contact: david@yieldshield.ai
- Source: https://github.com/YieldShield/yieldshield-bnb
- Release and grant evidence: [BNB release notes](docs/BNB_RELEASE.md)
- Next steps: [Grant readiness and security plan — 23 September](docs/BNB_PREAPPLICATION_PLAN_2026-09-23.md)
- Origin: [pinned Base baseline](BASELINE.md)

## What works

Explore WBNB, BTCB, Binance-Peg ETH and CAKE without connecting a wallet. Change token quantity, market movement and available collateral to compare holding a position with a modeled collateral exit. Source addresses, oracle timestamps and the BSC block are available from the interface.

The API reads Chainlink feeds on BNB Smart Chain (chain 56). WBNB uses BNB/USD, BTCB uses BTC/USD and Binance-Peg ETH uses ETH/USD; those references do not measure wrapper or peg risk and are not executable swap quotes. The browser stops calculations when observations expire or the service fails.

**Protection contracts are not deployed on BSC in this release.** There are no real deposits, live pools, insurance policies, guaranteed exits or yield claims. The future wallet flow is restricted to BSC Testnet (chain 97) and stays disabled until reviewed deployment addresses are registered. Mainnet references are read only.

## Run locally

Use Node.js 24 and npm. No wallet or private key is required.

```sh
npm ci
npm run build
npm run start:api
# In a second terminal:
npm run dev -w web -- --host 127.0.0.1
```

Open http://127.0.0.1:5174. Vite forwards /api/markets to the local service on port 3002. The local API also exposes /health. An optional server-only BSC_MAINNET_RPC_URL can replace the public RPC endpoints; never place credentials in a VITE_ variable.

```sh
npm run test:web
npm run test:bnb
```

The tests cover source identity, stale/future data, incomplete RPC responses, cache expiration, HTTP failures, scenario math and inherited EVM transaction guards.

## Deploy the preview

Vercel builds the web app and hosts api/markets.mjs in the same project. It does not depend on the Base API or a Railway service. The committed Vercel configuration routes page URLs to the SPA while keeping the market API separate. There is no scheduled oracle relay.

```sh
vercel link --project yieldshield-bnb
vercel deploy --prod
```

Choose the intended Vercel team when linking. No deployment keys belong in Git. The upload excludes contract sources, other-chain services, faucets, scripts, tests, environment files and local build artifacts.

## Inherited source and future contracts

The repo starts from a committed Base edition snapshot. Its contract modules and compatibility adapters remain as source for the next phase. Files named Base, Robinhood or Solana, their scripts and historical reports are inherited references; they are not evidence of a BNB deployment or BNB audit.

Do not run the Base deployment or stock relay scripts to deploy this edition. A BSC-specific contract configuration, mock-token setup, oracle design, deployment rehearsal and transaction verification are still required. Start with one test-token pair and prove the complete protection and collateral lifecycle before expanding to four assets. A public testnet release requires actual deployment receipts and a reviewed manifest; placeholders must never enable transactions.

[Oracle review and trust assumptions](docs/BNB_ORACLE_REVIEW.md) describes the current read-only path.
