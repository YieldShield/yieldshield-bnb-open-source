# Base oracle integration: internal security review

Reviewed 8 September 2026. This is an internal agent-assisted implementation review and regression suite, not an independent professional audit. No contract deployment, financial transaction, or source-price fabrication was performed during this review.

## Source verification

- [Base tokenized-stock specification](https://docs.base.org/specifications/b20/tokenized-stocks-on-base): canonical token/feed addresses, native B20 precompiles, raw-balance accounting, corporate-action registry, and market-feed behavior.
- [Chainlink Coinbase feed documentation](https://docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase): Total Return Value pricing, issuer-managed oracle pauses, and closed-market behavior.
- [Chainlink's published Coinbase registry ABI](https://github.com/smartcontractkit/external-adapters-js/blob/db6cecc6b287b14a96dcc49c5e579894c8df452f/packages/composites/tokenized-equity/src/config/CoinbaseOracleRegistryABI.json) and [its caller](https://github.com/smartcontractkit/external-adapters-js/blob/db6cecc6b287b14a96dcc49c5e579894c8df452f/packages/composites/tokenized-equity/src/lib/coinbase.ts): `getOracleParams(address)` returns `(uint128 multiplier, bool paused)`. The width is uint128, not the uint256 mentioned in some third-party summaries.
- Public Base RPC calls to registry `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD` for AAPLc and NVDAc each returned multiplier `1e18`, pause `false`. This independently confirms the published ABI is callable on the deployed registry. AAPLc feed returned round `36893488147419103375`, answer `31845000000`, updatedAt `1788826639`, and matching answeredInRound. This is a historical observation, not a current price claim.
- The parent implementation agent verified Base USDC/USD proxy `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` against the [official Chainlink reference-data directory](https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-base-1.json): 8 feed decimals, 86400-second heartbeat, 0.3% deviation.

## Findings addressed

1. **Wrong corporate-action signal.** The existing stock wrapper read a pause flag on the stock token. Coinbase uses a separate registry, and a transfer pause is a different signal. `CoinbaseStockOracleFeed` now reads the exact registry method and rejects missing, reverting, truncated, overlong, or noncanonical results. Zero or oversized multipliers and noncanonical booleans fail closed. All execution-price paths preserve the guard.
2. **Double-adjustment risk.** Coinbase Chainlink feeds already contain the multiplier. The new wrapper uses it only to validate registry data; it never multiplies the feed answer. Regression tests verify raw 8-decimal token amounts use the Total Return Value exactly once, including fractional tokens.
3. **B20 falsely classified as rebasing.** The factory rejected every token exposing `scaledBalanceOf`, including B20's display helper. A narrow chain-8453 canonical Coinbase address allowlist now exempts only that marker. Every other rebasing marker remains rejected. The exemption does not apply on Sepolia or to a similar-looking address.
4. **Corporate-action wrapper bypass.** Canonical Base stocks now require the pinned stock wrapper even before wrapper configuration. Configuration also requires the opening-policy capability, preventing a missing capability from being snapshotted as optional. Single-feed, explicitly typed, and dual-feed route tests cover the restriction.
5. **False freshness through test feeds.** The Sepolia relay and per-token aggregator do not expose a permissionless refresh. Re-reporting a price cannot advance its source timestamp. A repeated source round must retain its answer and round timestamps; source blocks, price rounds, and sequencer-status timestamps cannot regress.
6. **Old pause observations presented as healthy.** Price age and state-observation age are separate. Each asset's pause and sequencer observation expires after ten minutes, even when other assets keep receiving reports. Submissions require a source block no older than five minutes. A newer global sequencer-down observation also blocks direct reads of an older healthy asset report.
7. **Accidental real-asset relay deployment.** Both relay contracts reject constructor deployment outside Base Sepolia, chain 84532. Only published Coinbase stock token/feed pairs and the explicit Base USDC/USD pair can be registered. Source identity is permanent after registration; stocks require 8-decimal test tokens and USDC requires 6 decimals.

## New deployment components

- `contracts/contracts/libraries/BaseStockTokenLib.sol`
- `contracts/contracts/oracles/CoinbaseStockOracleFeed.sol`
- `contracts/contracts/oracles/BaseSepoliaStockRegistry.sol`
- `contracts/contracts/oracles/BaseSepoliaStockAggregator.sol`

The factory and `CompositeOracle` retain their existing external interfaces. The historic `setRobinhoodStockOracleFeed` method pins the new wrapper through the shared stock capability interface. The module implementation agent regenerated the factory modules after the original factory change.

Required initialization order: deploy test tokens and relay; register the permanent source pairs; submit real source observations; deploy per-token aggregators; configure Chainlink's sequencer feed to the relay; register token feeds; configure explicit one-hour stock opening ages and market sessions; configure the Coinbase wrapper's stock tokens; pin the wrapper; then register pool oracle routes. USDC uses the inner Chainlink adapter directly. Configuration methods that inspect prices correctly reject unavailable source observations.

For each report, read price, registry, and sequencer state using the same Base mainnet block tag. Preserve all source round fields. The backend must not replace `updatedAt` with a local clock value, stretch freshness settings to make a demo succeed, or substitute a constant price when a source is unavailable.

## Verification completed

420 focused tests passed:

- 19 new `BaseOracleSecurityTest` cases.
- 22 new `BaseSepoliaStockRelayTest` cases.
- 301 existing composite-oracle, factory, stock-wrapper, stock-session, oracle-bounds, and oracle-bugfix cases.
- 78 existing composite dual-feed cases.

Commands used:

```text
forge test --offline --extra-output storageLayout --match-path 'test/Base*.t.sol'
forge test --offline --extra-output storageLayout --match-contract '^(CompositeOracleTest|StockMarketSessionProtectionTest|RobinhoodStockOracleFeedTest|SplitRiskPoolFactoryTest|OracleBugFixesTest|OracleBoundsTest)$'
forge test --offline --extra-output storageLayout --match-contract '^CompositeOracleDualFeedTest$'
```

Compiled runtime byte sizes: Coinbase wrapper 5090; Sepolia registry 6390; Sepolia aggregator 1554; CompositeOracle 23195; ChainlinkOracleFeed 9164; session gate 2191. Each is below the 24576-byte runtime limit. Oversized-initcode warnings refer to test harnesses that embed many contracts, not these deployable oracle components.

## Material limitations and remaining operational checks

The Sepolia relay is an operator-attested test facility, not a trustless bridge or a Chainlink-operated feed. Its authorized operator can submit dishonest data; test tokens must remain clearly labeled as valueless alpha assets. Its sequencer adapter represents the observed **Base mainnet** source sequencer, not an independently measured Base Sepolia sequencer. Native Sepolia liveness and operator recovery remain operational assumptions.

The existing one-hour opening-price age is intentionally shorter than the stock feeds' possible daily heartbeat. Some otherwise healthy periods will reject new protection. Ordinary price use remains capped at 24 hours. The existing last-close extension remains limited to guarded same-asset closed-session exit paths and still rejects corporate-action/emergency pauses; it does not authorize stale cross-asset settlement.

The relay aggregator's stock sanity interval and USDC $0.50–$1.50 interval are local alpha limits, not published Chainlink source circuit-breaker bounds. Mainnet risk limits need a separate production review before real assets are accepted.

The calendar must be populated from an explicit reviewed market schedule and maintained through holidays and future dates. A missing day blocks openings. Issuer transfer restrictions can still prevent stock deposits or exits even when an oracle is healthy.

Before activating the deployed alpha, verify the backend reports actual data with the documented tuple, owner/operator roles and permanent source pairs match the deployment manifest, source observations are recent, the market/opening state is represented honestly in the application, and wallet transaction tests run against the final deployed contracts. This review did not substitute for those deployment checks.
