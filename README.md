# YieldShield on Base

An **unaudited early alpha** for exploring Coinbase tokenized-stock references on Base mainnet and testing conditional protection with valueless mock tokens on Base Sepolia.

- Website: https://base.yieldshield.ai
- Market API: https://base-api.yieldshield.ai/api/markets
- Operator: Hawig Ventures UG (haftungsbeschränkt), Germany
- Contact: david@yieldshield.ai

## Current release state

The frontend and read-only market service are implemented. Public Base Sepolia contract deployment is **pending test-ETH funding and a live, fresh market session**. The UI explicitly shows deployment pending until verified contract addresses are published. No mainnet transactions or real-asset deposits are supported. Recurring Sepolia oracle submissions remain disabled pending the operator's explicit authorization.

The consumer design comes from the existing YieldShield application; Solidity comes from the existing YieldShield contracts. The Base edition adds blue branding, stock references, legal/risk pages, fail-closed reads, verified exit quotes and a Base-compatible immutable module deployment.

## Two separate networks

| Function | Network | Assets and trust |
|---|---|---|
| Stock references and scenarios | Base mainnet, 8453 | Canonical AAPLc, NVDAc, METAc and GOOGLc identities; official Chainlink TRV feeds and Coinbase registry. Read only. |
| Protection / collateral / faucet | Base Sepolia, 84532 | Valueless mock stocks and TestUSDC. Operator-attested source relay; **not** Coinbase-issued shares or a Chainlink-operated Sepolia feed. Pending public deployment. |

Protection can fail, collateral may be insufficient, and there is no guaranteed return or insurance. Internal agent reviews and automated tests are not an independent audit.

## Development

Use Node.js 24 and the committed lockfiles. The existing repository includes compatibility adapters for other chains; the web build defaults to Base Sepolia EVM.

```sh
npm ci
npm run build
npm run start:api
# In a separate terminal:
npm run dev -w web -- --host 127.0.0.1
```

The Vite preview forwards `/api/markets` to the local API on port 3001. The Railway API has an isolated `services/package.json` and lockfile, and installs only its own runtime dependencies. No wallet key is needed for live market references.

```sh
npm run test:web
npx vitest run packages/adapter-evm/test/security.test.ts
node --test services/base-market-data.test.mjs scripts/deploy-base-sepolia.test.mjs
node scripts/verify-base-modules.mjs
```

## Contract review and deployment

- [Immutable module review](contracts/config/BASE_MODULE_SECURITY_REVIEW.md)
- [Oracle review and primary sources](docs/BASE_ORACLE_REVIEW.md)
- [Full local deployment rehearsal](contracts/config/BASE_SEPOLIA_REHEARSAL_REPORT.md)
- [Deployment preparation and recovery](contracts/config/BASE_SEPOLIA_DEPLOYMENT_CHECKLIST.md)
- [Explicit exchange-session calendar](contracts/config/base-us-equity-sessions-2026.json)

Initialize pinned contract dependencies with `git submodule update --init --recursive`, install the contract package dependencies, and build Foundry artifacts with storage layouts before preparation. Never commit private keys. Local test deployment configuration belongs only in ignored `contracts/.env.base.local`.

The deployment script defaults to preparation. Public execution requires the explicit `--broadcast` option and enforces chain 84532, a dedicated signer, module sizes, artifact hashes, governance/bootstrap closure, source identity and live-session checks. Its public manifest is written only from actual confirmed transactions; do not publish unsigned-plan placeholder addresses.

Stock openings require an original source price no older than one hour and an explicit allowed session. A fresh relay transaction never makes an old price fresh. Independent source-state observations expire after ten minutes. A source pause, stale observation or unavailable sequencer causes the alpha to stop accepting affected actions.

## Hosting

Vercel builds only the web service and forwards `/api/markets` to Railway. Railway uses `Dockerfile.base-api`, port 3001, `/health`, one replica and the GitHub main branch. `/health` indicates service availability and separately reports source readiness; unavailable market observations return 503. No recurring wallet-funded updater is enabled in this release.

Vercel excludes contracts, local environment files and development artifacts from the frontend upload. Railway's image includes only the market service and its production dependencies. After a completed public deployment, run `node scripts/sync-base-deployment.mjs` to verify contract bytecode and deployment receipts before publishing frontend addresses. Rebuild and deploy the frontend afterward.
