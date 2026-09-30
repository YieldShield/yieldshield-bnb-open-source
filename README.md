# YieldShield on BNB Chain

A BSC Testnet trading and token-protection demo for BNB staking, ETH staking, stablecoin yield and lending receipts, using valueless synthetic tokens. A separate read-only explorer shows BSC mainnet reference prices and modeled scenarios.

- Website: https://bnb.yieldshield.ai
- Trade test tokens: https://bnb.yieldshield.ai/trade
- Get testnet protection: https://bnb.yieldshield.ai/markets
- Create a testnet pool: https://bnb.yieldshield.ai/create-pool
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

On BSC Testnet (chain 97), connect an EVM wallet, claim free demo tokens, buy or sell tWBNB, tSlisBNB, tWBETH, tsUSDe and tvUSDT against TestUSDC, open a protected position, provide backing, create a pool and view positions. The deployed exchanges and protection pools have been exercised together by a dedicated operator wallet. An independent user browser-wallet signing session has not yet been recorded. See the [release evidence](docs/BNB_RELEASE.md).

Pool creation supports all five protected assets with TestUSDC backing. Choose the backers’ gain share (1–50%), creator gain fee (0–20%) and collateral ratio (100–500%, subject to the current backing-token floor). The protocol gain fee is 1%. Both factories currently require a **500 TestUSDC creation bond**, held separately from pool backing. After creation, use **Fund this pool** to add collateral to that exact pool. New pools appear in Provide collateral and in the asset’s pool comparison on Markets. Factory identity, live settings, the required bond and wallet balance are checked before signing; the receipt must match the reviewed terms. See the [pool creation guide](docs/BSC_POOL_CREATION.md).

Separately, explore WBNB, BTCB, Binance-Peg ETH and CAKE mainnet reference prices without a wallet at `/learn/scenarios`. Change token quantity, market movement and available collateral to compare modeled outcomes. These references do not price the synthetic testnet pool or serve as executable swap quotes.

The reference-data API reads Chainlink feeds on BNB Smart Chain (chain 56). WBNB uses BNB/USD, BTCB uses BTC/USD and Binance-Peg ETH uses ETH/USD; those references do not measure wrapper or peg risk. The browser stops calculations when observations expire or the service fails.

**Protection contracts are deployed on BSC Testnet (chain 97).** Five seeded TestUSDC-backed protection pools support protected deposits and both withdrawal paths; users can create additional pools. The original tWBNB market retains its synthetic BNB price cycle; a separate four-asset oracle illustrates accelerated yield growth and downside shocks. A six-token dispenser supplies the test assets, and funded exchanges enforce per-asset trade limits and a reviewed payment/proceeds bound. All six tokens are fixed-supply and have no redeemable value. There is no real staking, protocol yield, redemption or acquisition in these demos. Mainnet references remain read only.

The four new references are Lista slisBNB, Binance WBETH, Ethena sUSDe and Venus Core vUSDT. [Research and primary sources](docs/bnb-yield-assets.md) explain the selection, verified mainnet addresses, risks and alternatives. Local token logos include [provenance and third-party notices](apps/web/public/assets/tokens/ATTRIBUTION.md). The research catalog is display-only; wallet actions use the independently verified chain-97 registry.

The original pool is `0x711c600188a4BEE06C35848280FB76FF2d91F7F3`; its exchange is `0x2DdF03a89A861028fA00A1282365A68A284f9386`. The [original deployment manifest](contracts/deployments/bsc-testnet-alpha.json) records 43 transactions; the [trading manifest](contracts/deployments/bsc-testnet-trading.json) records its extension. The [yield extension manifest](contracts/deployments/bsc-testnet-yield-assets.json) and [four-asset walkthrough](contracts/deployments/bsc-testnet-yield-assets-flow.json) record the new deployment and both exits for every asset. See the [yield demo runbook](docs/BSC_YIELD_DEMO_RUNBOOK.md) and [public evidence](https://bnb.yieldshield.ai/bsc-yield-testnet-proof.json). Wallet actions are enabled only by the independently verified chain-97 registry. Internal testing and bytecode checks are not an independent company audit. This is not real-asset insurance or a production launch.

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

The tests cover source identity, stale/future data, incomplete RPC responses, cache expiration, HTTP failures, scenario math, multiple factory/exchange routing, reviewed dispenser selection, 8-decimal receipt units and inherited EVM transaction guards. CI also checks contract storage/size compatibility and the four-asset trading/protection flows.

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
