# BNB trading and protection integration plan

Prepared 23 September 2026. Plan only: no new contracts, governance operations or product changes were executed for this document. Continue on BSC Testnet (97), consistent with the existing testnet decision and Base reference. Keep the BNB yellow design and token focus.

## Outcome

Make the main BNB experience a usable product with **Trade, Get protection, My positions, Provide collateral and Account**, following the current Base application. A visitor should be able to discover actual supported pools, obtain test tokens, buy an asset, protect some or all of it, inspect their position, choose an eligible exit and sell tokens remaining in their wallet. Scenario exploration becomes a supporting learning tool.

The current BNB release delivered the protection foundation and proof, but did not deliver Base product parity. Its welcome page still emphasizes scenarios and the application navigation remains hidden behind wallet connection. Trading is absent; it cannot be enabled by changing a link.

## Verified baseline

Compared live Base `/welcome`, `/trade` and `/markets` with BNB `/welcome`, and inspected the current source revisions:

- Base: `afd0858998717913fd5ab098a67f2014deb493ee`.
- BNB: `64d1ba3de565626700d28f65b13af0ebe7ea28f3`.
- Base's current trading is **Base Sepolia test-token trading**, with an inventory-funded exchange and synthetic pricing. It is not a live mainnet DEX integration.
- BNB has the chain-97 faucet, synthetic tWBNB/TestUSDC pool, protection deposits, both exit paths, backing deposits and backing unlock/withdrawal. The published operator walkthrough contains 11 successful transactions.
- BNB has no Trade screen, exchange deployment, trade reader, quote configuration or `demoTrade` transaction intent.
- Base includes stocks, crypto and vault shares. BNB should reproduce the relevant workflows using tokens; vault support is a separate extension described below.

| Capability | Current BNB | Planned result |
| --- | --- | --- |
| Main entry | Risk explorer / scenarios | Direct Trade and Get protection entry points |
| Navigation before connection | Product screens mostly behind wallet gate | Browse assets, quotes and pool terms before connecting |
| Buy / sell | Missing | TestUSDC ↔ supported demo token, with onchain settlement |
| Get protection | Existing one-pool flow, hard to find | Asset cards, capacity/terms and a clear deposit journey |
| Purchased holdings | No integrated trading journey | Wallet holdings clearly separated from deposited positions |
| Manage / exit positions | Existing screens | Unified positions page with eligible actions, fees and receipt links |
| Provide backing | Existing flow under ambiguous “Provide protection” | Explicit “Provide collateral” with gain share and loss exposure |
| Test-token setup | Faucet on Account | Dedicated setup page that returns users to their intended action |
| Scenarios | Main product | Secondary `/learn/scenarios` tool |
| Vault shares | Unsupported by BSC demo initializer | Later, separately tested deployment extension |

## First release: complete tWBNB / TestUSDC product

Use the existing tokens, faucet, pool, position identities and collateral. Preserve the deployed pool rather than resetting balances or redeploying the entire protocol. Add the missing trading component and integrate the user journey.

### 1. Put the application at the front

Adapt Base's public application shell, responsive navigation, route restoration and connection/setup handoffs. Use:

- `/welcome`: token-focused landing page with Trade and Get protection actions.
- `/trade`: buy/sell with quotes visible before wallet connection.
- `/markets`: actual protection markets and their current availability.
- `/protection/new`: select an amount and review pool terms.
- `/positions`: connected wallet's deposited positions.
- `/provide`: backing deposits and withdrawal management.
- `/account`, `/activity`: wallet setup/balances and transaction history.
- `/test-tokens`, `/status`, `/how-it-works`: supporting utilities.
- `/learn/scenarios`: the existing read-only mainnet reference/scenario explorer.
- `/testnet/technical`: deployment evidence and architecture.

Keep old pool, deposit and position links functional. Update internal links when repurposing `/markets`; explain that its former scenario content moved. Preserve selected token, amount, direction and return destination through wallet connection and faucet setup. Clear stale transaction reviews when the wallet or chain changes. Keep mobile navigation usable during pending wallet operations.

Acceptance: a disconnected visitor sees the complete product navigation and can inspect supported assets/terms. A returning connected user can reach their positions directly. The scenario explorer no longer dominates onboarding.

### 2. Add a BSC Testnet trading venue

Adapt the mechanics of Base's `AlphaAssetExchange` into a BSC-specific exchange, initially supporting the existing tWBNB and TestUSDC. Fund both sides with existing free test-token inventory. Buying sends tWBNB to the user's wallet; selling returns TestUSDC. A purchase does not automatically create protection.

Preserve useful safeguards: exact-token transfer checks, reentrancy protection, explicit supported assets, finite trade sizes, inventory checks, deadlines, maximum input/minimum output and canonical receipt/event verification. Retain Base's displayed 0.3% demo trading fee as the proposed starting configuration. Keep trading fees distinct from protection terms and network gas.

The Base contract cannot be deployed unchanged: it requires chain 84532 and authenticates a Base-specific oracle runtime. Create and verify chain-97 contracts and a reviewed BSC deployment registry. No Base addresses, stock assumptions or chain guards should enter the BNB execution path.

**Price design needs an explicit implementation step.** The current BNB oracle changes continuously through a four-minute ±25% cycle. Near its 600 reference, a 0.5% trade tolerance can be consumed in roughly 1.2 seconds. Copying Base's quote settings would make ordinary human wallet confirmations unreliable.

Preferred approach: a bounded, deterministic test-only feed with stable price intervals and scheduled transitions, shared by trading and protection. Set quote expiry before the next transition and refresh/review again after any approval transaction. Test realistic human confirmation delays and never silently widen an accepted spending limit. Continue making rising/falling scenarios available within a short demo session.

Switching the existing pool's token feed requires a reviewed operation through the two-day timelock. Version the extension manifest and effective oracle configuration; retain the first deployment/proof as historical evidence. Inspect open positions before the switch and document the scenario change. If retaining the existing continuous feed, equivalent wallet-delay tests must pass before enabling trading; do not treat frequent quote failures as a finished product.

Acceptance: real testnet Buy and Sell transactions settle with the expected assets, explicit bounds and explorer receipts; empty inventory, expired quotes, wrong tokens and wrong networks fail clearly.

### 3. Integrate trading into the wallet adapter and interface

Port the Base trade screen and relevant reader/planner behavior, keeping the BNB visual language. The dependency slice includes:

- `Trade.tsx`, trade-state helpers and balance refresh behavior.
- Demo market/quote types, exchange ABI, readers, transaction intent and receipt extraction.
- A BSC-specific registry of token addresses, decimals, supported pairs, runtime hashes and current price sources.
- Freshness checks tied to owner, asset, direction, quantity, network and execution bounds.

Remove hardcoded Base requirements such as chain 84532, four/eight-asset counts, tAAPLc defaults and stock-only labels. Only deployed, verified BSC assets become selectable. Display executable synthetic prices in the trading flow; keep the read-only mainnet reference prices in the learning area.

Acceptance: buy and sell quotes match the selected wallet and draft, approvals and trades have separate feedback, a changed account/expired quote requires review, and reloads retain recovery transaction links.

### 4. Join the full product journey

After a purchase, show the confirmed wallet balance and “Protect these tokens.” Carry the exact token and amount into the protection flow. Show capacity, gain sharing, fees, wait time and backing asset before deposit. Refresh actual eligibility after connection or approval.

Use Base's clearer separation of wallet holdings and protection positions. Token withdrawals make the returned tokens available to Trade again. A protected exit shows the TestUSDC actually received. “Provide collateral” should clearly describe the other side: supply TestUSDC, earn the applicable gain share, bear backing losses and follow the unlock process.

Retain existing BSC preflight and canonical receipt safeguards while reconciling Base's newer availability/status screens. Port the coherent dependency slice instead of merging the full Base repository with its unrelated chain, stock, vault and relay configuration.

Acceptance: a user can complete `faucet → buy → protect → view position → withdraw → sell`, plus a second protected-payout path and the backing deposit/unlock/withdrawal path. Partial wallet holdings never appear as protected merely because a user also owns a protection position.

### 5. Verify and publish the integrated release

Test the complete story with real public block times and a fresh browser wallet. Retain operator automation as repeatable evidence, and distinguish it from independent user testing.

Required cases: buy/sell and receipt/balance agreement; approval followed by a changed quote; rejection or cancellation; account/network changes; insufficient gas or inventory; unavailable pricing; full protection capacity; waiting periods; token withdrawal and protected payout; backing unlock/withdrawal; direct navigation and mobile layouts. Preserve the existing accounting/storage regressions.

Publish the updated application, versioned manifests and fresh trade/protection receipts. Update grant evidence to describe the actual integrated product. Source publication remains a separate approval already requested; an independent audit company is not part of this plan. GitHub Actions currently cannot start because of account billing/allowance, so record local checks accurately and restore hosted CI separately.

## Expand the asset catalogue after the first complete flow

Add tBTCB, tETH and tCAKE, each with explicit test-token identity, decimals, oracle route, exchange inventory, faucet funding and a genuinely deployed protection pool. Do not promote the four mainnet reference cards into executable markets just by adding buttons.

Deploy contracts first; schedule asset onboarding, feed changes and faucet administration through the existing two-day timelock; execute after the delay and validate every resulting binding. Existing bootstrap shortcuts are closed. New pool creation and seed backing follow verified asset onboarding. Keep token/exchange/protection registries consistent and disclose per-asset availability.

Acceptance: every enabled asset supports both trading and the stated protection flows, or displays a precise reason that a particular action is unavailable. Claims of four supported markets require four verified working integrations.

## Advanced Base parity: vaults and alternative collateral

Base also supports yield-vault shares and vault-backed collateral. Reproducing this would require BNB test vaults (for example vWBNB/vUSDC), real test-token backing, deposit/redeem accounting, explicit yield funding, share-price feeds, trading and additional protection pools.

The existing BSC initializer authenticates the exact `BscTestToken` runtime and enforces 18-decimal shield / 6-decimal backing assets. Vaults cannot be made compatible with a frontend configuration change. A separately reviewed initializer/router and appropriate new pool deployment path are required, preserving existing pools. Vault receipts paid out as collateral must expose a separate redemption action.

This extension follows the token trading/protection release. It is necessary for vault-feature parity with Base, but does not need to delay the main token product. Real mainnet trading or accepting real-value assets would be a further, separately scoped project.

## Commit and rollout sequence

Commit each independently reviewable step, matching the user's existing preference:

1. `feat: make BNB trading and protection the primary navigation`
2. `feat: add BSC demo pricing and inventory-funded exchange`
3. `test: cover BSC quotes, inventory, deadlines and wallet delays`
4. `deploy: verify BSC trading extension and schedule required governance`
5. `feat: wire BSC trade quotes and wallet transactions`
6. `feat: connect trades to protection and position management`
7. `feat: add BNB setup, availability and recovery flows`
8. `deploy: enable verified BSC trading after governance activation`
9. `test: record complete browser and public-chain product walkthrough`
10. `docs: update BNB release and grant evidence for the integrated product`

Additional token markets and vault support get their own implementation, governance, verification and release commits. UI work can proceed while timelock operations mature. The first release is complete only when the integrated journey works; a navigation facelift alone is not the acceptance criterion.
