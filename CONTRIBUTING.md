# Contributing to YieldShield BNB

This repository contains a BSC Testnet trading and protection demo using valueless synthetic tokens. The BSC mainnet references under `/learn/scenarios` are read-only. Keep changes and claims within that scope.

## Set up

Use Node.js 24, npm and Foundry. From a fresh clone:

```sh
git submodule update --init --recursive
npm ci
npm ci --prefix contracts --ignore-scripts
npm run build
```

The [README](README.md) explains how to run the web app and API locally. The [BSC Testnet runbook](docs/BSC_TESTNET_RUNBOOK.md) explains deployment and verification. Do not use a real private key or valuable asset for local testing.

## Check a change

Run checks relevant to the files you changed. The primary BNB checks are:

```sh
npm run test:bnb
npm run test:web
npm run test:scripts --prefix contracts
npm audit --omit=dev --audit-level=moderate
npm audit --prefix contracts --omit=dev --audit-level=moderate
(cd contracts && forge test --match-path 'test/Bsc*.t.sol')
```

Changes to inherited pool or router logic also need the modular and inherited oracle regression suites in the [CI workflow](.github/workflows/ci.yml). Explain any changed deployment address, source identity, economic assumption or user-facing risk in the pull request. Include tests for behavior changes and update the README or runbook when behavior changes.

Keep local `.env` files, signing keys, deployment plans and generated artifacts out of Git. Report suspected vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue or pull request.
