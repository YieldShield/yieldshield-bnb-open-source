# BSC Testnet release — 23 September 2026

The testnet protocol, synthetic trading exchange and integrated operator walkthrough are deployed and confirmed. This supersedes the read-only September 8 contract status below. Sections labelled “prior” or “historical” below describe the product at that earlier date, not its current capabilities.

## Trading and protection integration

- Product entry: https://bnb.yieldshield.ai/welcome; trading at `/trade`, protection markets at `/markets`, free assets at `/test-tokens`, and positions at `/positions`.
- Trading exchange: [0x2DdF03a89A861028fA00A1282365A68A284f9386](https://testnet.bscscan.com/address/0x2DdF03a89A861028fA00A1282365A68A284f9386), bound to the original synthetic oracle and tWBNB/TestUSDC pair. The existing pool was not redeployed or reconfigured.
- Trading extension: three canonical receipts for deployment and initial inventory of 250 tWBNB plus 250,000 TestUSDC. Fee 0.3%, trade cap 25 tWBNB, explicit payment/proceeds bound and deadline.
- Integrated walkthrough: six canonical operator transactions. [Buy 2 tWBNB](https://testnet.bscscan.com/tx/0xd026f6cb6bb047127cd6202842c33c5aa5da1325a57dc4baa48349a13ccd2278), [protect 1 tWBNB](https://testnet.bscscan.com/tx/0x08f409c86109aa0d480a636bf069b1057cbf2211de59abc05f9e9d6aa9325a9b) in the existing pool, and [sell 0.5 tWBNB](https://testnet.bscscan.com/tx/0x117d7eb0b4d5fc5cfb64cb930b1b075026ddffd63da672524ded6d346c41e0c5). The other three receipts are spending approvals. The protection deposit minted a receipt position; this is operator integration evidence, not independent customer activity.
- Proof JSON now records 30 contract addresses, 46 deployment/funding receipts, 11 prior protection walkthrough receipts and 6 integrated trading walkthrough receipts. Internal runtime/receipt checks passed; source publication and an independent company audit remain separate and pending.
- The public testnet demo uses valueless synthetic tokens and a four-minute scenario price. It does not trade real BNB or accept real assets. A human wallet may need to refresh a quote if the synthetic price moves outside its chosen bound during signing.

Production deployment `dpl_9R1rcP1r4QRoX9bJrxkgCB3WDJsA` is Ready for commit `4fccdcb9c78df33beac1eaeec637e4aa717c6bda` and assigned to `bnb.yieldshield.ai`. Public HTTPS returned 200 for `/welcome`, `/trade`, `/markets`, `/test-tokens`, `/how-it-works`, `/learn/scenarios`, `/testnet/technical`, the 30-contract proof JSON and the existing BSC market API. The proof JSON includes 46 deployment/funding and 17 operator walkthrough receipts. A browser wallet session by an independent user remains untested; the onchain flow was exercised by the dedicated operator wallet.

Local release checks passed: the full production build, 19 BSC-specific contract tests (including 256 fuzz runs in each applicable case), 51 BNB service/deployment tests, 150 EVM adapter tests and 18 web tests. Scoped lint and formatting passed. Repository-wide `npm run lint` includes vendored `contracts/lib` code and a pre-existing generator issue; it is not a clean gate. [GitHub workflow 35833478677](https://github.com/YieldShield/yieldshield-bnb/actions/runs/35833478677) started no jobs: GitHub reported failed account payments or a spending limit. Hosted CI must be restored separately; no remote test pass is claimed.

### Prior protection-only release

- Demo: https://bnb.yieldshield.ai/testnet
- Technical reference and evidence: https://bnb.yieldshield.ai/testnet/technical
- Machine-readable addresses and receipts: https://bnb.yieldshield.ai/bsc-testnet-proof.json
- Pool: [0x711c600188a4BEE06C35848280FB76FF2d91F7F3](https://testnet.bscscan.com/address/0x711c600188a4BEE06C35848280FB76FF2d91F7F3)
- Deployment: 43 canonical transactions; compiled code, constructor data, router bindings, proxy storage, ownership and timelock roles independently checked before enabling the registry.
- Walkthrough: 11 canonical transactions using the web planner and wallet receipt checks. Both shield positions and the walkthrough backing position were closed. The separate seeded backing position remains.
- Free test assets only; synthetic prices; chain 97. There is no mainnet protection deployment or independent company audit.
- At the time of this protection-only snapshot, GitHub remained private. Explorer source submission to Sourcify requires separate acceptance of its public archival terms; bytecode checks alone are not source publication.

The walkthrough used the funded deployment operator, not an independent customer. Actual public block timestamps enforced both delays; local rehearsal had separately advanced only Anvil time. Public confirmation finished at 2026-09-23T06:58:12.757Z.

## Hosted release and CI status

Vercel production deployment `dpl_4xDY9eaTfEeaGUxhiu8Y4xEvqZVi` is Ready for application commit `c52ff26578118cc29381243adaa1c9656a7175d5`, with `bnb.yieldshield.ai` assigned. Public HTTPS checks returned 200 for the guide, technical reference, proof JSON and market API. The JSON contains 29 contract addresses, 43 deployment transactions and 11 walkthrough transactions; the market API remains read-only chain 56.

[GitHub workflow 35829394824](https://github.com/YieldShield/yieldshield-bnb/actions/runs/35829394824) could not start either job: GitHub reported failed recent account payments or a spending limit requiring attention. No CI steps ran. This is separate from the passing local checks listed below. Restore GitHub Actions billing/allowance and rerun the workflow; do not describe remote CI as passed.

## Public walkthrough receipts

| Step                 | BSC Testnet receipt                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| faucet:0             | [0xd38630c6ff…](https://testnet.bscscan.com/tx/0xd38630c6ffdfc87324b28bc9f9ea0f40b712cff5f699f8ab42b4447d17d226c2) |
| backing:0            | [0xb1451b02cb…](https://testnet.bscscan.com/tx/0xb1451b02cb50cc29e27e1361571304aff606e66976cfd1ae95b66bdc70acfab7) |
| backing:1            | [0x0266d22612…](https://testnet.bscscan.com/tx/0x0266d22612d9d73627cfd78d437a8f1de551e710601618f95a31da61ed9ae65e) |
| shield-normal:0      | [0x677fe097cc…](https://testnet.bscscan.com/tx/0x677fe097cc0697c9b7503382d1286ede8df3a78be4492b8e9ea061c4de1dcbc1) |
| shield-normal:1      | [0x3237894a3c…](https://testnet.bscscan.com/tx/0x3237894a3cecd8045a5c792fe02cd2ce2a61c023529d5f815b4ae8c8ed4e4492) |
| withdraw-normal:0    | [0x7e789d8d57…](https://testnet.bscscan.com/tx/0x7e789d8d5718d4e58e582350afa3095fe5898805f5e508bb1611fcc86a61e83d) |
| shield-protected:0   | [0xbd7f60b690…](https://testnet.bscscan.com/tx/0xbd7f60b690417e90ae60d5bad25aad0d403a9b5e41bd6f91e07a053cbe88870c) |
| shield-protected:1   | [0xae464dd702…](https://testnet.bscscan.com/tx/0xae464dd702bca4fbabd9d51f0c1248ff9557eb68250f9eac2cf63f52b4a90ee5) |
| withdraw-protected:0 | [0xf76c486f28…](https://testnet.bscscan.com/tx/0xf76c486f28a98b1016f04ff1d738fd2414ccd9bc1429edc16b3601bcc78e0683) |
| unlock:0             | [0xce5389a425…](https://testnet.bscscan.com/tx/0xce5389a425da8d56f8aa50dc7e6a62a926826ee8a32315f0841a35decae8f4de) |
| withdraw-backing:0   | [0xc176c02559…](https://testnet.bscscan.com/tx/0xc176c02559b965b1bed1bf9736ac94ef21dbe1a4a424e54810c15410e55d4da4) |

## Release verification

Local checks passed: 11 BSC contract tests, 225 modular-contract regressions, 41 inherited oracle/relay regressions, 134 wallet/faucet tests, 51 BNB API/deployment/publication tests, 15 web tests, build, scoped lint and production dependency audit (zero reported vulnerabilities). Public pool/faucet reads passed through the website adapter. Desktop/mobile checks covered the guide, contract reference and wallet connection entry point. Browser wallet signing by an independent user remains a recommended follow-up; the operator script is not presented as that evidence.

See the [internal review](BNB_SECURITY_REVIEW_2026-09-23.md) and [runbook](BSC_TESTNET_RUNBOOK.md). Grant application planning is maintained separately from this source repository. No grant application was submitted as part of this release.

---

# Historical BNB preview and grant evidence

Date: 2026-09-08. The status and suggested application wording in this section were superseded by the deployed protection pool and exchange described above.

## Delivered

- Separate YieldShield/yieldshield-bnb repository, starting from committed Base snapshot e2bc6adb77d23ffb8b6d35738dfce0a7d94afcea.
- Yellow BNB design, responsive welcome page and token-risk explorer.
- Live, traceable BSC references for WBNB, BTCB, Binance-Peg ETH and CAKE.
- Interactive token quantity, price change and collateral scenarios, including shortfall examples.
- Own same-origin market API, source validation and automatic expiration.
- Provider, terms, privacy and risk pages using Hawig Ventures UG (haftungsbeschränkt).
- Disabled contract actions with explicit BSC Testnet status.

## Validation

Automated tests cover malformed and stale oracle data, wrong networks, changed source blocks, incomplete reads, failed feeds, HTTP behavior, browser-side validation, bounded scenario math and inherited EVM security controls.

Desktop and 390-pixel mobile checks covered navigation, token selection, quantity changes, price-drop and collateral-shortfall examples. The local API was stopped to verify that prices and calculations disappear behind an unavailable message, then restarted to verify recovery. Testnet status shows no active deposit or wallet-connect action.

Published at https://bnb.yieldshield.ai with the explorer at https://bnb.yieldshield.ai/markets.

Production application commit: 69d42e3d1cdb2ef289ed814b086306c058b14e9d. Deployment: https://yieldshield-f4qyqm3g8-noc2-6281s-projects.vercel.app. Vercel project: yieldshield-bnb (prj_8BS9I2rfw7mZrHpwjJGbojsQZi1I), team HawigUG. GitHub main is connected for future deployments.

The production build, 15 web tests, 6 BNB service tests, 44 EVM security tests, ESLint, and production dependency audit passed locally. The inherited Base service/deployment suite passed 84 tests. GitHub application and inherited contract checks passed for the release configuration at 1df7502: https://github.com/YieldShield/yieldshield-bnb/actions/runs/34212540204.

Public HTTPS checks confirmed GET /api/markets returns 200 with all four fresh references, POST /api/markets returns 405 with no-store, and the removed /api/drip route returns 404. Direct /markets, /connect and /privacy requests returned 200. A production observation at BSC block 120666263 contained all four available references. The live browser showed no warnings or errors during navigation and scenario checks. Mobile width checks found no horizontal overflow at 390 pixels.

The new repository lives locally at /Users/david/Documents/source/yieldshield-bnb. No Base repository source or deployment was changed by this release.

## Suggested application wording

YieldShield is developing token downside-protection infrastructure for BNB Chain. Our current BNB-specific prototype includes a deployed token-risk explorer with live BSC price references for WBNB, BTCB, Binance-Peg ETH and CAKE, transparent source information, and interactive collateral scenarios. It builds on our existing YieldShield codebase and demonstrates the BNB user experience and data integration. Executable protection on BSC Testnet is the next milestone; this release does not accept deposits or claim live TVL.

## Next milestone for a stronger grant application

Build one complete BSC Testnet protection pool using valueless mock tokens. Deliver a BSC-specific deployment configuration, explicit oracle assumptions, verified deployment receipts, a test-token faucet, and a repeatable deposit/protect/withdraw demonstration. Add more tokens only after that lifecycle works. Document testnet users and transaction counts from actual activity; do not count scenario interactions as onchain usage.

A subsequent security review and defined economic constraints should precede any real-asset rollout. Existing internal reviews and Base contract reports must not be described as a BNB audit.

## Applicant

Hawig Ventures UG (haftungsbeschränkt)  
Herzogin-Juliana-Straße 7  
55469 Simmern, Germany  
Managing Director: David Hawig  
Commercial Register: HRB 24975, Amtsgericht Bad Kreuznach  
Contact: david@yieldshield.ai

The repository was created private to match the Base repository. Grant reviewers will need authorized repository access or a separately approved public source release.
