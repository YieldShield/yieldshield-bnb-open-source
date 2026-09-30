# Yield-asset trading and protection demos

The BNB app adds four synthetic BSC Testnet markets: `tSlisBNB`, `tWBETH`, `tsUSDe` and `tvUSDT`. The original `tWBNB` market remains available. Each uses the existing six-decimal `TestUSDC` for trading and pool backing. The reference assets, verified mainnet identities, mechanisms and alternatives are documented in [the research report](bnb-yield-assets.md). Mainnet catalog addresses are display information and never execution targets.

## Model and scope

The new oracle illustrates modest share-value growth followed by a downside shock in a repeating 240-second cycle. Growth resets each cycle. The model is accelerated, deterministic and has no connection to current prices, rates or protocol rewards. It is not an APY, staking integration or redemption claim. The exchange holds inventories of fixed-supply, valueless test tokens and enforces the reviewed payment/proceeds limit. Each asset has a separate protection pool with seeded test collateral, a 60-second wait for protected exit and a 120-second backing unlock.

`tvUSDT` deliberately uses eight decimals to exercise lending-receipt unit handling. The other new test tokens use 18 decimals. Per-asset limits are 25 tSlisBNB, 10 tWBETH, 25,000 tsUSDe and 50,000 tvUSDT. Every trade charges a 0.3% synthetic quote-token fee.

The new token dispenser supplies 5 tWBNB, 10,000 TestUSDC, 5 tSlisBNB, 2 tWBETH, 1,000 tsUSDe and 50,000 tvUSDT per eligible wallet every 24 hours, while funded. The app uses this six-token dispenser automatically. The original dispenser remains deployed for earlier flows and is not offered as a separate choice in the app. Test BNB for network fees comes from the official BNB faucet.

## Deployment controls

The extension reuses the original factory and pool logic modules. A separate factory proxy, composite oracle and chain-97-only pool initializer isolate the new whitelist and token-decimal handling. The initializer authenticates the original TestUSDC address/runtime, the new synthetic-token runtime and the original initialization module. It applies only the short testnet exit delays after the original validations. It does not change an existing pool or bypass the original factory's governance.

The original two-day timelock owns the new factory and dispenser after bootstrap is finalized. The scenario oracle and inventory exchange have no administrator, upgrade path, minting or withdrawal key. The seeded test liquidity is excluded from real TVL. Internal review and testing are not an independent security audit.

## Reproduce and verify

Use Node.js 24, the pinned Foundry dependencies and Solidity configuration. Preparation is read-only and never loads a signing key. Deployment requires the existing dedicated chain-97 operator in the ignored `contracts/.env.bsc.local`, with test BNB only. Never commit that file.

```sh
npm ci
npm ci --prefix contracts --ignore-scripts
git submodule update --init --recursive
cd contracts
forge test --match-path 'test/Bsc*.t.sol' --extra-output storageLayout
cd ..
node scripts/deploy-bsc-yield-assets.mjs --prepare
npm run deploy:bsc:yield
node scripts/verify-bsc-yield-assets.mjs --write
```

The sequential deployment records each signed request/hash before sending, rejects ambiguous nonces, reconciles only its exact saved transaction and checks canonical receipts with ten sealed confirmations. It caps cumulative deployment fees at 0.03 test BNB. Pool addresses are obtained from canonical factory events before the backing deposits are prepared. It stops if inherited code or governance no longer matches the original manifest. The deployment command waits and reconciles its exact saved transactions when confirmations have not yet sealed; other errors stop immediately.

The independent verifier reconstructs expected deployment calldata and checks transaction destinations, receipts, inherited modules, runtime code, routing, token metadata, ownership, pool configuration and initial funding. It publishes a trimmed proof without keys or signer configuration. Verified values are then pinned in the adapter's additional factory, trading and faucet registries. Build-time settings cannot add execution targets; every signature rechecks eligibility against the reviewed deployment.

```sh
npm run build
npm run test:bnb
npm run test:web
node scripts/bsc-yield-assets-flow.mjs --broadcast
npm run walkthrough:bsc:yield:faucet
```

The four-asset operator walkthrough exercises the published contracts directly; the website’s intent routing is separately checked against the deployed markets. The separate dispenser check uses the compiled website adapter’s intent planner, preflight and receipt checks, then independently verifies the six exact transfers and balance changes at the confirmed block. Both save resumable transaction journals and trimmed public evidence. Their receipts are internal integration evidence, not external adoption. An independent browser-wallet signing session and a real-asset launch are separate future work.

## Real-asset follow-up

A real integration needs protocol-specific rate conversion, redemption and acquisition routes, executable liquidity checks, eligibility handling and observations that measure the stated risk. Reusing BNB/USD or ETH/USD alone cannot detect an LST discount, and a dollar reference cannot measure receipt backing or a stablecoin depeg. Prioritize slisBNB for the BNB-native staking story and vUSDT for lending coverage, then assess WBETH and bridged sUSDe against their custody, redemption and bridge dependencies. The current UI does not acquire any of these real assets.
