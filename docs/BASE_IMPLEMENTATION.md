# YieldShield Base alpha

The consumer interface is based on YieldShield/yieldshield-app. The contracts are imported from YieldShield/smart-contracts at fa236d04fe2dfc570f7c1ea22e2d904194f728f5.

Initial target: Base Sepolia (84532), with valueless test assets and separately labelled live Coinbase tokenized stock data from Base mainnet (8453). Never represent test tokens as issuer-backed shares.

Deployment: base.yieldshield.ai on Vercel, with a dedicated Railway market-data/oracle service. Operator: Hawig Ventures UG (haftungsbeschränkt).

Implementation milestones:
1. Import app and contracts, preserving upstream source and pinned dependencies.
2. Split the existing pool/factory dispatch for Base contract size limits; test storage and behaviour.
3. Integrate Coinbase total-return feeds, freshness, corporate-action and sequencer guards.
4. Base wallet/network, test faucet, genuine onchain pool flows, and public stock explorer.
5. Alpha risk notices, legal notice, privacy and terms with the supplied entity.
6. Full build, oracle failure tests, onchain lifecycle verification, deploy and smoke checks.

Primary integration references (checked 2026-09-08):
- https://docs.base.org/specifications/b20/tokenized-stocks-on-base
- https://docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase
- https://docs.chain.link/data-feeds/tokenized-equity-feeds
- https://www.base.org/stocks
- https://www.base.org/batches (deadline September 9)
