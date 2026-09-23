# YieldShield BSC Testnet runbook

Prepared 23 September 2026. Chain 97 only. These contracts use valueless synthetic tWBNB and TestUSDC. tWBNB is not wrapped BNB. Never reuse this configuration for real assets.

## Build and verify

Use Node.js 24 and Foundry. From a clean checkout:

```sh
git submodule update --init --recursive
npm ci
npm ci --prefix contracts --ignore-scripts
(cd contracts && forge build --extra-output storageLayout)
node scripts/verify-base-modules.mjs
npm run build
npm run test:bnb
npm run test:web
(cd contracts && forge test --match-path 'test/Bsc*.t.sol')
(cd contracts && forge test --match-path 'test/base-modules/*.t.sol')
```

The generator preserves the original storage layout and 111 pool / 104 factory selectors. All 15 routers and modules fit the runtime/initcode limits. Solidity is pinned to 0.8.35, Cancun, optimizer 200 runs and viaIR. The BSC initializer authenticates test-token runtimes and delegates to the codehash-pinned original initializer before changing only the two demo timing slots.

## Public deployment and recovery

The dedicated public operator is `0x045f932e49fb395862794acEc3FCCc118BE2f27e`. Its key belongs only in the ignored, mode-0600 `contracts/.env.bsc.local` file. The file accepts `BSC_TESTNET_DEPLOYER_PRIVATE_KEY`, `BSC_TESTNET_EXPECTED_DEPLOYER`, optional `BSC_TESTNET_RPC_URL`, `BSC_TESTNET_MAX_GAS_PRICE_WEI` and `BSC_TESTNET_MAX_TOTAL_FEE_BNB`. Never upload it to Vercel or commit it.

```sh
npm run prepare:bsc
# Review contracts/deployments/bsc-testnet-plan.json before broadcasting.
npm run deploy:bsc
npm run verify:bsc
node scripts/publish-bsc-deployment.mjs --write
node scripts/export-bsc-proof.mjs
npm run build
node scripts/smoke-bsc-testnet.mjs
```

Preparation requires the public operator address but does not create a signer. Broadcast checks chain ID, canonical testnet genesis, expected signer, gas caps, available balance, compilation metadata and deployment recipe. It records the exact signed hash and request before network submission. The 43-step deployment is resumable using the same command and manifest. No automatic replacement transaction is issued.

A lagging public RPC can return a receipt before its latest-block response reaches ten confirmations. The tool stops with `ten sealed block confirmations required`. Wait briefly and resume: it reconciles each saved hash, checks canonical block membership and rechecks the receipt. Do not clear the manifest or rerun with a fresh nonce. A consumed nonce without the expected receipt is a hard stop requiring investigation.

The deployment lock prevents concurrent signer use. Remove a stale lock only after proving the recorded process is no longer running and reconciling pending transactions. Keep the two deployment-engine scripts unchanged while resuming; their digest is part of the persisted recipe.

Publication independently checks all receipts, sender/calldata/value, compiled runtime, constructor arguments, immutable router bindings, proxy implementation slots, token identities, ownership and timelock roles. It then writes the chain-97 frontend registry. Local manifests cannot pass publication.

## Public walkthrough

After public verification, `node scripts/bsc-public-flow.mjs --broadcast` uses the same transaction planner and canonical wallet receipt verifier as the website. It claims the faucet, provides 1,000 TestUSDC backing, deposits and withdraws 1 tWBNB, opens another position and exercises protection, then unlocks and withdraws its backing position. It waits for actual public block timestamps. Its journal is `contracts/deployments/bsc-testnet-flow.json`; rerunning resumes existing actions. This is operator testing, not independent user adoption. After completion, run `node scripts/export-bsc-proof.mjs` and rebuild to include the walkthrough receipts on the public technical page.

The walkthrough has its own 0.01 test BNB maximum gas reservation and a 1 gwei gas-price cap. It records transaction intentions before sending. Never run deployment and walkthrough concurrently with the same operator.

## Local rehearsal

Run Anvil on loopback, port 8597, chain 97, with its public development mnemonic. Set the deployment variables to a public Anvil account and the loopback RPC, then use:

```sh
node scripts/deploy-bsc-testnet.mjs --broadcast --local
BSC_TESTNET_RPC_URL=http://127.0.0.1:8597 node scripts/smoke-bsc-testnet.mjs --local
BSC_TESTNET_RPC_URL=http://127.0.0.1:8597 node scripts/bsc-local-flow.mjs
```

Local deployment/evidence are saved under ignored `artifacts/local`. The flow uses development account 2, snapshots/reverts its changes, advances only the local clock, and uses deployless multicall because a fresh Anvil chain lacks Multicall3. Its test-only browser clock follows Anvil timestamps. None of those overrides runs in the public website or public walkthrough.

## Demo economics and controls

- One pool: 18-decimal tWBNB / 6-decimal TestUSDC.
- Fixed token supplies: 1,000,000 tWBNB and 10,000,000 TestUSDC; no mint authority.
- Faucet claim: 5 tWBNB + 10,000 TestUSDC per wallet per day, while inventory lasts.
- Seeded backing: 100,000 TestUSDC. It is free test liquidity, not customer deposits or real TVL.
- Synthetic four-minute triangular price cycle: 600 → 750 → 600 → 450 → 600 TestUSDC per tWBNB. The oracle uses a formula, not market observations or real peg monitoring.
- Protected exit minimum age: 60 seconds. Protector unlock delay: 120 seconds. Collateral availability still constrains withdrawals.
- Factory and faucet administration pass through a two-day timelock. The dedicated operator alone proposes/executes/cancels; the timelock is its own administrator. This is centralized testnet administration, not decentralized governance.
- Routers bind immutable modules; these proxy implementations reject upgrades. Administration can still affect protocol parameters and oracle routing under the documented timelock.

## Sources and deployment evidence

The onchain deployment manifest records addresses, exact transaction requests, canonical receipts and runtime hashes. Source publication is a separate action. `node scripts/prepare-bsc-source-bundle.mjs` prepares only compiler-listed Solidity files and settings under ignored `artifacts/bsc-source-review`. Publishing that bundle to Sourcify requires authorization for public archival under its submission licence. Source matching proves a relationship between source and bytecode; it is not a security audit.

The repository remains private unless separately authorized. Grant reviewers can use the public demo, architecture description and explorer evidence; give them repository access or approve the intended code release before claiming the BNB implementation is publicly reusable.

## User support

Start at `/testnet`, connect a normal EVM wallet to BSC Testnet, obtain test BNB from the official BNB faucet and claim demo assets on Account. The app checks chain, balances, faucet inventory/cooldown, price availability, capacity and action eligibility before signing. Approval and action transactions have distinct status messages and explorer links. The wallet path validates two sealed confirmations; deployment tooling validates ten.

If an action is uncertain, inspect the displayed transaction hash before repeating it. Mainnet `/markets` data is read only and does not price the synthetic pool. Gasless or smart-account wallet compatibility has not been established by the operator walkthrough; wallets need test BNB for gas.
