# BNB internal engineering review — 23 September 2026

Scope: the BSC Testnet synthetic protection slice, its deployment/publication tools, inherited reward fixes, wallet preflight/receipt path and user disclosures. This is an internal engineering/agent review. No audit company has been commissioned, and this document is not independent certification.

## Reviewed implementation

The inherited BNB baseline was e2bc6ad from Base. Relevant Base work was selected against afd0858 rather than merging the entire later product. Separate commits record accounting fixes (`fb73a2a`, `b900cb9`), deployment safeguards (`d4b519e`, `2713e4a`), BSC contracts (`4d56c14`), wallet/faucet/preflight/receipt changes (`dbca4de` through `aafff2d`), deployment rehearsal (`5039876`) and website walkthrough (`b73cd92`). Subsequent publication, evidence and release commits form part of this dated review; see repository history for their exact revisions.

The public deployment is chain 97, canonical genesis `0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34`, operator `0x045f932e49fb395862794acEc3FCCc118BE2f27e`, pool `0x711c600188a4BEE06C35848280FB76FF2d91F7F3`. The full manifest contains 43 transactions. Solidity 0.8.35, Cancun, viaIR and optimizer 200 settings are pinned. Source settings are checked against local compiler metadata.

## Findings addressed

| Area | Finding / consequence | Resolution and evidence |
| --- | --- | --- |
| Reward conservation | Inherited reward dust could be allocated twice; historical fractions could enter new/reset protector debt. | Ported the two Base fixes; conservation, late-entry and partial-exit regressions pass. Do not treat upstream severity labels as a new independent assessment. |
| Chain-specific demo timing | Simply shortening general pool delays could affect real assets or corrupt storage. | Chain-97-only wrapper authenticates synthetic token runtimes, pins original initializer codehash and changes only two verified timing slots. Both initialization paths are compared against the original initializer in tests. |
| Token and oracle identity | A token symbol alone cannot establish a safe test asset. | Fixed-supply chain-97 test tokens; oracle validates token runtime and decimal choices. Public checks bind token addresses, supplies, decimals, oracle routes and constructor inputs. |
| Deployment confirmation | Public RPC confirmation helpers can return receipts while a latest-block endpoint still lags. | Save exact signed intent/hash before submission, require ten canonical sealed confirmations and transaction inclusion, and recheck receipts. Resume after lag reuses the exact hash; ambiguous consumed nonces stop execution. |
| Manifest trust | A manifest claiming completion cannot alone justify enabling wallet actions. | Publication checks actual receipt blocks, sender/calldata/value, compiled code, constructor inputs, immutable routing, proxy slots, ownership and timelock roles before writing the frontend registry. Local or incomplete manifests are rejected. |
| Imported wallet behavior | Base chain assumptions, optimistic faucet availability and transaction feedback could mislead BSC users. | Restrict to 97; validate live inventory/cooldown/balances and action eligibility; display approval/action stages and canonical explorer receipts; adapt labels and token scales. |
| Custom pool UI | The generic creation form exposed timings that the short demo initializer would override. | Removed that entry point and redirect its old route to the bounded one-pool walkthrough. |
| Product claims | Synthetic prices, seeded balances and operator activity could be mistaken for market data, TVL or customers. | Separate mainnet references, label synthetic nonredeemable tokens and centralized controls, and publish operator activity as internal test evidence. |

## Verification completed

| Check | Result |
| --- | --- |
| BSC synthetic protection, oracle, chain/token guards | 11 tests passed; oracle fuzz test runs 256 cases |
| Modular contract regression suites | 225 tests passed |
| Inherited Base oracle/relay regressions | 41 tests passed |
| Wallet and faucet regressions | 134 tests passed |
| BNB API, deployment and publication guards | 51 Node tests passed |
| Web tests | 15 passed |
| Storage layout and selector compatibility | Exact original layout; 111 pool and 104 factory selectors preserved |
| Runtime/initcode limits | All 15 routers/modules within bounds; largest runtime 21,045 bytes |
| Production dependency scan | npm audit reported zero vulnerabilities at check time |
| Local lifecycle | 43-step deployment plus 11 wallet-planned canonical transactions; both exit modes and collateral unlock/exit |
| Public deployment | 43 canonical transactions, runtime/binding/ownership checks and active-pool/funded-faucet adapter read passed |
| Interface | Production build, scoped lint and desktop/mobile guide inspection passed; final public release checks recorded in release evidence |

These are scoped checks, not proof of absence of defects. Some suites share underlying behaviors; do not sum their counts as independent security guarantees. The dependency result is point-in-time and excludes development dependencies. Local time advancement and public testnet waits must remain clearly distinguished.

The public walkthrough journal separately records its status and receipts. Only a `complete` journal is exported as successful walkthrough evidence. Operator execution uses the web planner and receipt verifier but does not substitute for a user signing through a browser wallet. Fresh external-wallet testing and user feedback remain recommended before submission.

## Known limitations and retained controls

- All economic inputs are synthetic. The four-minute formula is predictable and can be gamed; it exists to demonstrate contract branches, not price or hedge real tokens.
- Shortened timing is intentional for the authenticated test assets. It must never be applied to real-value pools.
- Seeded backing is free test liquidity. It says nothing about protector demand, sustainable returns or a market-priced loss scenario.
- The dedicated operator controls administration through a two-day timelock. This is centralized, and administrative/oracle changes remain part of the trust model.
- Public RPCs and the hosted website are availability dependencies. The app must expose unavailable data rather than promise immediate execution. Explorer availability is separate from receipt validity.
- The core contracts have substantial inherited complexity. Selected regressions and internal review do not establish production readiness. Real-asset acceptance would need a new, explicitly scoped readiness decision; it is outside this application proof.
- Source verification establishes correspondence with bytecode; it is not an audit. The BNB repository is private until separately authorized, and third-party licence/release obligations still need review before an open-source grant commitment.
- Smart-account/gasless wallet compatibility, independent browser-wallet signing and external adoption are not established by the operator script.

## Next checks before the grant submission

Finish and retain the public walkthrough receipts, publish the corresponding website evidence, try the demo with an ordinary independently controlled wallet, resolve source-access/licence scope and record actual user feedback. Submit a truthful internal-review summary and prospective scope; do not claim an independent company audit or mainnet launch.
