# YieldShield on BNB Chain

A BSC Testnet trading and token-protection demo using valueless test tokens and a synthetic price cycle. A separate read-only explorer shows BSC mainnet reference prices and modeled scenarios.

- Website: https://bnb.yieldshield.ai
- Trade test tokens: https://bnb.yieldshield.ai/trade
- Get testnet protection: https://bnb.yieldshield.ai/markets
- Explore mainnet reference scenarios: https://bnb.yieldshield.ai/learn/scenarios
- Claim free test tokens: https://bnb.yieldshield.ai/test-tokens
- Operator: Hawig Ventures UG (haftungsbeschränkt), Germany
- Contact: david@yieldshield.ai
- Source: [this repository](.)
- Release and grant evidence: [BNB release notes](docs/BNB_RELEASE.md)
- Try the testnet: https://bnb.yieldshield.ai/testnet
- Contract reference: https://bnb.yieldshield.ai/testnet/technical
- [Deployment runbook](docs/BSC_TESTNET_RUNBOOK.md) · [Internal security review](docs/BNB_SECURITY_REVIEW_2026-09-23.md)
- Origin: [pinned Base baseline](BASELINE.md)

## What works

On BSC Testnet (chain 97), connect an EVM wallet, claim free demo tokens, buy or sell tWBNB against TestUSDC, open a protected position, provide backing and view positions. The deployed exchange and protection pool have been exercised together by an operator wallet. An independent user browser-wallet signing session has not yet been recorded. See the [release evidence](docs/BNB_RELEASE.md).

Separately, explore WBNB, BTCB, Binance-Peg ETH and CAKE mainnet reference prices without a wallet at `/learn/scenarios`. Change token quantity, market movement and available collateral to compare modeled outcomes. These references do not price the synthetic testnet pool or serve as executable swap quotes.

The reference-data API reads Chainlink feeds on BNB Smart Chain (chain 56). WBNB uses BNB/USD, BTCB uses BTC/USD and Binance-Peg ETH uses ETH/USD; those references do not measure wrapper or peg risk. The browser stops calculations when observations expire or the service fails.

**Protection contracts are deployed on BSC Testnet (chain 97).** One tWBNB / TestUSDC pool supports faucet claims, backing deposits, protected deposits, token withdrawals, protected TestUSDC exits, and protector unlock/withdrawal. A separate testnet exchange supports bounded trades between the same two tokens. Both assets are fixed-supply, valueless test tokens. tWBNB is not wrapped BNB. The synthetic oracle follows a four-minute price cycle; it does not use the mainnet market references. Mainnet references remain read only.

The pool is `0x711c600188a4BEE06C35848280FB76FF2d91F7F3`; the exchange is `0x2DdF03a89A861028fA00A1282365A68A284f9386`. The [original deployment manifest](contracts/deployments/bsc-testnet-alpha.json) records 43 transactions; the [trading manifest](contracts/deployments/bsc-testnet-trading.json) records its extension. Wallet actions are enabled only by the independently verified chain-97 registry. Internal testing and bytecode checks are not an independent company audit. This is not real-asset insurance or a production launch.

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

## Contract scope and inherited source

The BNB port reuses the Base modular architecture and selected upstream reward-accounting, wallet preflight and canonical receipt fixes. Historical Base, Robinhood and Solana files remain references; their addresses and reports are not BNB deployment or audit evidence. The BSC deployment recipe is `scripts/deploy-bsc-testnet.mjs`, with a dedicated manifest and chain/genesis guards. See the [runbook](docs/BSC_TESTNET_RUNBOOK.md) for builds, local rehearsal, public deployment, recovery, source-publication terms and controls.

GitHub repository visibility and publishing compiler source bundles to an explorer are separate actions. Source matching establishes correspondence with deployed bytecode, not contract safety. Check the current repository visibility and applicable licenses before describing the code as publicly reusable.

[Oracle review and trust assumptions](docs/BNB_ORACLE_REVIEW.md) describes the read-only mainnet path. The new synthetic path and its limits are documented in the runbook and public technical reference.

## License

YieldShield-authored source is available under the [MIT License](LICENSE). Three oracle files carry `GPL-2.0-or-later` identifiers, and inherited Scaffold-ETH source retains its original MIT attribution. The [third-party notices](THIRD_PARTY_NOTICES.md) identify these exceptions and the pinned dependency sources. Licensing source code does not imply that the testnet demo has undergone an independent security audit.
