# BNB yield asset research and testnet scope

Reviewed on 30 September 2026. `config/bnb-yield-assets.json` is an informational catalog of four BNB Smart Chain mainnet reference assets. Its addresses must never be used as BSC Testnet trading, faucet, or protection destinations. The functional demos use separate, valueless synthetic tokens on chain 97. They do not hold the real assets, stake with the referenced protocols, earn the protocols' returns, or insure their failures. No APY is promised or copied into this catalog.

## Selected reference assets

| Reference | Synthetic demo | BSC mainnet token | Token decimals | Role |
| --- | --- | --- | --- | --- |
| slisBNB | tSlisBNB | `0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B` | 18 | BNB staking exposure |
| WBETH | tWBETH | `0xa2E3356610840701BDf5611a53974510Ae27E2e1` | 18 | ETH staking exposure |
| sUSDe | tsUSDe | `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2` | 18 | Synthetic dollar rewards exposure |
| vUSDT (Venus Core Pool) | tvUSDT | `0xfD5840Cd36d94D7229439859C0112a4185BC0255` | 8 | Stablecoin lending receipt |

**slisBNB:** Lista's BNB staking token represents staked BNB and accumulated validator rewards through an increasing BNB redemption value. It is the most direct fit for the BNB version's native staking story. Unstaking involves validator unbonding; Lista's current user guide describes a 7–15 day wait. The relevant risks include BNB price changes, validator performance, contract/governance changes, redemption delays and discounts in secondary markets. These are observations about the real asset, not benefits provided by the demo. Sources: [Lista asset overview](https://docs.bsc.lista.org/introduction/liquid-staking-slisbnb/about-slisbnb), [contract registry](https://docs.bsc.lista.org/for-developer/liquid-staking-slisbnb/smart-contract), [redemption guide](https://docs.bsc.lista.org/user-guide/liquid-staking-slisbnb/redeem-bnb-from-slisbnb).

**WBETH:** Binance's value-accruing ETH staking token is available on BNB Smart Chain. ETH staking rewards are reflected in the WBETH-to-ETH conversion rate rather than payments to each self-custody holder. Redemption through Binance depends on its processes and waiting period; the market price can differ from the redemption value. ETH price, staking, custody, contract and liquidity risks therefore matter independently. Source and contract confirmation: [Binance WBETH FAQ](https://www.binance.com/en/support/faq/detail/e252366155174ba6887f6b32e3798273).

**sUSDe:** Ethena staking receipts represent USDe plus vested discretionary rewards. The BNB address is a bridged representation, distinct from the Ethereum ERC4626 staking contract. A dollar-denominated receipt does not imply a guaranteed dollar peg or yield. Funding/basis income, collateral, exchanges, custody, bridge security, governance and redemption cooldowns matter. Ethena's documentation says acquisition of sUSDe is not offered to persons resident or registered in the EU/EEA. The synthetic demo supplies no real sUSDe and provides no Ethena acquisition/staking action. Sources: [Ethena address registry](https://docs.ethena.fi/technical-design/key-addresses), [staking mechanics](https://docs.ethena.fi/technical-design/staking-usde), [risk overview](https://docs.ethena.fi/protocol-overview/risks), [current terms](https://docs.ethena.fi/resources/terms-of-service).

**vUSDT:** Select the Venus Core Pool receipt, not similarly named receipts from deprecated isolated pools. Supplying USDT mints vUSDT; accrued borrowing interest changes the underlying USDT redemption value. Eight token decimals are separate from the exchange-rate mantissa scaling. Redemption depends on available pool liquidity, market flags and collateral obligations when users also borrow. USDT peg/reserves, bad debt, oracle, contract and governance risks remain relevant. Sources: [current market registry and lifecycle warning](https://docs-v4.venus.io/deployed-contracts/markets), [supply/borrow guide](https://docs-v4.venus.io/guides/supply-borrow), [conversion math](https://docs-v4.venus.io/guides/protocol-math), [risk management](https://docs-v4.venus.io/risk/risk-management).

## On-chain metadata check

Read-only `eth_call` requests to the public BNB Smart Chain RPC `https://bsc-dataseed.bnbchain.org` confirmed the token decimals above. `vUSDT.underlying()` returned `0x55d398326f99059fF775485246999027B3197955`, the BNB USDT address in Venus's registry. A latest-state batch near BNB block 124906287 returned `markets(vUSDT).isListed = true` and `actionPaused(vUSDT, action) = false` for mint, redeem, borrow and repay. These flags are an observation at research time, not a permanent availability guarantee. The public endpoint did not serve the historical state when the same checks were pinned to an earlier block.

Mainnet token decimals do not dictate mock token decimals. Read the separate demo contracts' metadata for transaction amounts. Catalog metadata should be matched by explicit synthetic demo symbol, not by mainnet token address.

## Alternatives and priority

| Candidate | Research outcome | Priority |
| --- | --- | --- |
| ankrBNB | Ankr still documents a reward-bearing BNB staking product. It overlaps slisBNB's first-demo role, so add after testing the four different asset types. Use the current ankrBNB contract, not legacy aBNBb/aBNBc identifiers. [Ankr overview](https://www.ankr.com/docs/liquid-staking/bnb/overview/), [legacy token migration](https://www.ankr.com/docs/switch/overview/). | Next BNB staking option |
| asUSDF | Aster documents the active BNB token `0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb` with 18 decimals (also checked on-chain). Yield accrues from delta-neutral positions and funding fees to its net asset value. Custodian, exchange, funding, liquidation and USDT risks apply. It overlaps the selected synthetic-dollar example; Aster's media kit also requires approval for brand use. [Token registry](https://docs.asterdex.com/overview/smart-contracts), [mechanics](https://docs.asterdex.com/earn/overview/mint-asusdf), [redemptions](https://docs.asterdex.com/usdf-stablecoin/overview/faqs), [risks](https://docs.asterdex.com/usdf-stablecoin/overview/fund-custody-and-risk-management), [branding terms](https://docs.asterdex.com/resources/media-kit). | Later, with suitable asset identity artwork |
| BNBx | Stader announced its sunset in January 2026 and disabled new deposits. A historical token listing is not evidence of an active product. [Official sunset announcement](https://www.staderlabs.com/blogs/sunsetting-bnbx-focusing-stader-on-high-impact-ecosystems/). | Exclude |
| SolvBTC / xSolvBTC | The current documentation describes base SolvBTC as a BTC reserve representation. That alone should not be presented as an intrinsically yield-bearing token. Evaluate a specific strategy receipt such as xSolvBTC separately, including its backing, custody, redemption and strategy exposure. The BNB registry distinguishes SolvBTC `0x4aae823a6a0b376De6A78e74eCC5b079d38cBCf7` from xSolvBTC `0x1346b618dc92810ec74163e4c27004c921d446a5`. [Product definition](https://docs.solv.finance/key-products/solvbtc), [contract registry](https://docs.solv.finance/developer-guide/contracts). | Later BTC strategy research |

## Production integration requirements

The first integration intentionally implements synthetic BSC Testnet trading/protection examples. Before a real-asset version, each asset needs its own execution and redemption path, verified underlying units, rate conversion, available liquidity and eligibility checks. A BNB or ETH price feed alone cannot detect an LST discount; an underlying dollar feed alone cannot detect a stablecoin depeg or a receipt's loss of backing. Protection terms and settlement observations must match the risk actually measured. Keep this catalog separate from `config/bnb-assets.json`, which describes the existing mainnet reference feed scenarios.

## Images and attribution

The icons are locally hosted to keep the app's display independent of third-party availability. Asset names and marks identify researched reference tokens; they do not imply partnership or endorsement. They are not newly created YieldShield logos. See [token artwork provenance](../apps/web/public/assets/tokens/ATTRIBUTION.md) for download locations, licenses and hashes. The vUSDT SVG was checked for script elements, event handlers, external references, embedded images and animation; none were present. Original token artwork and trademark rights remain with their owners.
