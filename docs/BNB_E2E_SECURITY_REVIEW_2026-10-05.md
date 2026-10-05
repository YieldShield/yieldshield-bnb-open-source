# BNB testnet end-to-end and security review — 2026-10-05

This is an internal verification of the synthetic BSC Testnet application at https://bnb.yieldshield.ai. It is not an independent audit or a certification for real deposits. No mainnet transactions or real-asset integrations were added.

## Repairs

Each repair was committed separately in the deployment repository and mirrored to the public source:

- Restore the ESLint workspace command and ignore vendored contract tooling in the application lint scope.
- Discover actual installed EVM providers; explain absent wallets and common transaction blockers.
- Preserve typed amounts and reject scientific notation, commas, signs, precision overflow and oversized values. Previously `1e3` could become `13`.
- Reauthenticate user-created pool proxies, immutable routers and modules before every wallet signature, including after approvals.
- Add a restrictive Content Security Policy, HTTPS enforcement and HSTS. The deployed BSC RPC and font sources remain explicitly allowed.
- Remove the development shell helper and its five transitive high advisories; initialize local contract configuration with native filesystem operations without overwriting existing files.
- Align Foundry lock revisions with the actual submodule checkouts and verify both revision-format and tag-format entries.
- Expire cached position availability, use action-specific simulations for exits, and display blockers. This avoids both offering a blocked protected exit and suppressing a permitted same-token exit because of an unrelated oracle label.
- Gate deposit review and confirmation on fresh opening/collateral availability and current capacity. Reset a protection flow when its selected pool changes.
- Expire backing balance/notice observations, pause actions while confirmed state refreshes, clear the previous amount after success, and explain that every partial backing withdrawal requires a fresh notice. Premium collection and no-exposure backing exits remain subject to the actual contract simulation rather than the aggregate oracle label.
- Correct token-setup continuation text for destinations such as pool creation.
- Enforce complete workspace lint, full dependency audits and Foundry lock checks in CI.

## Automated verification

Deployment repository:

- Application production build, type check and workspace lint pass.
- 46 web tests, 217 EVM adapter tests, 59 BNB script tests, and six live-run signing restriction tests pass.
- 111 inherited Base script tests and 125 inherited adapter security regressions pass; the latter are also part of the 217 adapter tests above.
- 148 contract-tooling tests pass.
- Foundry: 1,486 passed, zero failed, seven skipped. Skips require optional network-fork credentials. They are not claimed as verified.
- SDK: two passed, one Solana surfnet integration skipped because no local surfnet is running. This is outside the BNB flow.
- Pool/factory selector routing, generated module storage parity, code-size checks and BSC initializer timing slots pass.
- Full root and contract dependency scans report zero advisories, including development dependencies.

The public source was independently installed and built against its own existing dependency revisions: 46 web tests, 217 adapter tests, 148 contract-tooling tests and 1,487 Foundry tests pass, with the same seven optional fork skips. Its root and contract dependency scans also report zero advisories. Its OpenZeppelin upgradeable revision differs from the deployment repository; neither current compilation is asserted to be the byte-for-byte source of old immutable deployments.

## Static analysis

Slither 0.11.5 completed against fresh full compiler build information: 447 contracts, 74 detectors, 858 reported instances. Its high-severity gate exits 255 because findings remain classified High by the tool. This review does **not** change the detector filters to claim a green audit.

The 64 High instances fall into six classes: deterministic demo price phases, initializer delegatecalls to immutable code-hash-pinned modules, generated module state initialized in shared proxy storage, intentional dependency FullMath XOR, dependency MockPyth fixtures, and off-chain minting scripts. Relevant live runtime authentication, storage parity, initialization/chain guards and adversarial callback tests were checked. These explanations are internal triage, not independent assurance.

Aderyn 0.6.8 completed with 88 detectors, seven High detector classes and 21 Low classes. Its initial macOS run crashed after writing the report; rerunning with `--skip-update-check --no-snippets` completed. High classes cover native currency handling, inherited Pyth refunds, the intentional modular-inverse XOR, state changes protected by reentrancy locks, generated interface names, calendar arithmetic and assembly return forwarding. Counts and source locations remain in [the triage record](security/2026-10-05-static-analysis-triage.json). Medium/Low findings across the inherited code were not independently audited exhaustively.

## Live testnet evidence

The bounded test runner uses the same production `sendEvmIntent` function, Wagmi wallet-session checks, plan preflights, per-step simulations and canonical receipt validation used by the web app. Its headless connector is restricted to the dedicated testnet operator, chain 97 and its pinned genesis, reviewed targets, zero native transaction value, and a cumulative maximum gas reservation of 0.02 test BNB. Keys and signed raw transactions are never published. A local journal retains exact hashes before submission and refuses ambiguous replay.

A BSC RPC reported confirmation heights before the sealed head caught up; the runner reconciled the same stored creation hash, without a second creation. A sell was stopped after approval when its synthetic price moved outside the reviewed limit; the runner reconciled the approval and used a newly reviewed bounded quote. These are fail-closed behaviors, not evidence of an unchecked successful trade.

The completed run at 2026-10-05T11:42:19.420Z confirmed **59 actions and 78 canonical transactions**. It verified 40 published contract runtime hashes, all five buy/sell markets, protection deposits, partial and full same-token exits, protected TestUSDC exits, both creation factories, pool funding, notices and cancellation, premium claims for every asset, and partial/full backing withdrawals. After each partial backing withdrawal, the runner verified the notice reset and waited for a fresh notice before withdrawing the remainder. A premature full backing exit was rejected during simulation before any signature; it was recorded as an unsubmitted attempt.

Transaction hashes, sealed block hashes and numbers, created pools, and action results are published in [bsc-e2e-proof.json](../apps/web/public/bsc-e2e-proof.json). The two new test pools are empty after their positions closed. Existing seeded collateral positions remain; this test evidence is not organic usage or mainnet TVL. The maximum cumulative gas reservation was 3092923400000000 wei of test BNB, below the 0.02-test-BNB guard. A final key-free check re-reads the runtimes and recorded canonical receipts.

CI for final code passed in both [deployment source](https://github.com/YieldShield/yieldshield-bnb/actions/runs/37303924622) and [public source](https://github.com/YieldShield/yieldshield-bnb-open-source/actions/runs/37303997185). Deployment verification is recorded after the public release.

## Browser coverage and limits

The in-app browser checked welcome/trade/catalog/pool terms, category filtering, legal routes, the token setup page, missing-wallet guidance, amount rejection, scenario API data and responsive navigation. Building shared packages during local hot reload temporarily replaced the React context; a full reload restored the development screen. Final production checks use a fresh browser tab and do not rely on that development console history.

The in-app browser has no wallet extension installed. Extension installation, signing popups and a second independent user account are **not** claimed as browser-tested. Transaction behavior is verified through the bounded real testnet sender above. Wallet UI testing with an installed extension remains a useful separate manual acceptance check.

Preview access remained protected after automatic approval review rejected creating a temporary share link. The final hosted browser verification uses the authorized public production website. No team collaboration or deployment-protection settings were disabled.
