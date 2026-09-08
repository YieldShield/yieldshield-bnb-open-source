# BNB reference data review

Reviewed 2026-09-08. This records source checks and implementation behavior, not an independent security audit.

## Sources

- [Chainlink BSC feed directory](https://reference-data-directory.vercel.app/feeds-bsc-mainnet.json)
- [BNB/USD](https://data.chain.link/feeds/bsc/mainnet/bnb-usd)
- [BTC/USD](https://data.chain.link/feeds/bsc/mainnet/btc-usd)
- [ETH/USD](https://data.chain.link/feeds/bsc/mainnet/eth-usd)
- [CAKE/USD](https://data.chain.link/feeds/bsc/mainnet/cake-usd)

config/bnb-assets.json pins the four token identities and the standard feed proxies from the directory. It is shared by the API and browser. Each feed's onchain decimals and description must match the catalog. SVR proxy variants were not selected.

| Display token   | BSC token address                          | Reference feed proxy                       |
| --------------- | ------------------------------------------ | ------------------------------------------ |
| WBNB            | 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c | 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE |
| BTCB            | 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c | 0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf |
| Binance-Peg ETH | 0x2170Ed0880ac9A755fd29B2688956BD959F933F8 | 0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e |
| CAKE            | 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 | 0xB6064eD41d4f67e353768aA239cA86f4F73665a1 |

All four selected feeds have eight decimals. Directory heartbeat values were 27 seconds for BNB and 60 seconds for BTC, ETH and CAKE when reviewed. Heartbeat values are metadata, not a promise of continuous availability. Every reference has an application maximum age of 300 seconds.

A live read at BSC block 120663417 returned positive values from all four configured feeds with original oracle timestamps 14–26 seconds old. The token contracts' symbol reads returned WBNB, BTCB, ETH and Cake. This was a release smoke check, not a reserve or token-contract audit.

## Read and expiration behavior

1. Confirm RPC chain ID 56.
2. Select a source block ten blocks behind the observed tip. Require a valid hash and timestamp, not in the future and at most 120 seconds old.
3. Read all feed rounds, decimals and descriptions at that one block. Validate positive answers and round IDs, answeredInRound, and round timestamps against the block.
4. Re-read the block identity after multicall. A changed hash fails the observation.
5. Preserve original oracle timestamps and raw answers. A failed individual feed becomes unavailable without inventing a price.
6. Cache source reads for at most 20 seconds, deduplicating concurrent requests. Every response recalculates feed age and source expiry. A failed refresh returns HTTP 503; no prior successful response is substituted.
7. The browser independently checks chain, block metadata, exact catalog identities, price consistency and timestamps. It refreshes every 30 seconds and checks expiration every second. A source observation expires at its block time plus 120 seconds, even if the cached response arrived recently.

Only GET is accepted. API responses use Cache-Control: no-store and hide internal RPC error details.

## Trust and limits

RPC responses and the hosted API remain trusted inputs. A block hash comparison and a ten-block buffer do not constitute a proof of consensus finality. The service does not verify state proofs or independently reconcile multiple RPC providers. Fallback endpoints improve availability, not trust independence.

BNB/USD is a reference for WBNB; BTC/USD and ETH/USD are underlying-asset references for pegged tokens. They do not verify wrapping, custody, reserves, redemption, peg stability or executable token prices. The model cannot calculate depeg coverage from these references.

The scenario compares two alternative whole-position outcomes. Exit value is capped at entry value and reduced if modeled collateral is insufficient. It excludes fees, competition for shared backing, oracle/contract failures, execution changes and pool-specific rules. It is not an onchain quote.

No mainnet feeds are relayed into testnet contracts in this release. A later executable protection implementation must define its own oracle adapter, freshness and price-divergence controls, token configuration and pool lifecycle.
