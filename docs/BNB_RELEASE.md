# BNB preview and grant evidence

Date: 2026-09-08

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

Production URL, deployment and final validation results are recorded below after publishing.

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
