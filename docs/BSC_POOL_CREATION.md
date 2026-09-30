# Create and fund a BSC Testnet pool

Open [Create a pool](https://bnb.yieldshield.ai/create-pool), or select **Create a pool** from Markets or Provide collateral. Connect an EVM wallet on BSC Testnet (chain 97). Only synthetic test tokens are supported; no mainnet assets are accepted.

1. Choose tWBNB, tSlisBNB, tWBETH, tsUSDe or tvUSDT as the protected asset. TestUSDC is the backing asset. The app selects the reviewed factory automatically.
2. Set the backers’ share of positive gains, creator gain fee and collateral ratio. The review displays the combined fees and the remaining protected-holder share. Percentages accept at most two decimal places.
3. Supply the creation bond. At this release both factories require 500 TestUSDC. The app reads the current requirement and rechecks it before each signature. The dispenser supplies free test tokens; test BNB is needed for transaction fees.
4. Review the terms, approve only the requested bond amount if necessary, and confirm creation in the wallet. Creation is permissionless; neither factory ownership nor a protocol administrator is required.
5. Select **Fund this pool** after confirmation. The new pool starts empty: the bond is held by the factory and adds no protection capacity. A separate TestUSDC backing deposit creates a backing position.
6. Open the pool’s detail page to review the terms or make a protected deposit. Markets offers a comparison when an asset has multiple pools. Funding links preserve the exact pool address and do not substitute another pool if the requested address cannot be verified.

## Terms and limits

| Setting                          | Current value or allowed range                     |
| -------------------------------- | -------------------------------------------------- |
| Backers’ share of positive gains | 1–50%                                              |
| Creator fee on positive gains    | 0–20%                                              |
| Protocol fee on positive gains   | 1%                                                 |
| Collateral ratio                 | 100–500%; current backing-token floor also applies |
| Creation bond                    | Currently 500 TestUSDC, separate from backing      |
| Protected-exit delay             | 60 seconds                                         |
| Backer withdrawal notice         | 120 seconds                                        |
| Protected receipt transfer lock  | 1 day                                              |
| Backer receipt transfer lock     | 28 days                                            |
| Maximum pool value               | 10,000,000 synthetic USD units                     |
| Active pool limit                | Currently 100 per factory                          |

The fees apply to positive gains, not principal. Network and trading fees are separate. Only the three creator terms and the bond amount are configurable in this flow. Other values are defaults of the verified deployed contracts; governance can administer pools under existing contract controls. A creator may recover a bond by closing an empty pool under the contract’s checks. This release does not add a pool-closing interface.

## Verification boundaries

The adapter checks chain ID and genesis, proxy bytecode and implementation slots, pinned factory/pool routers, token and oracle bytecode, whitelist membership, token decimals, factory state, current limits and the required bond. Reads use one fresh sealed block and recheck its canonical identity. The adapter revalidates creation settings and balances before every signature, including after an approval. Confirmation requires a unique creation event from the correct factory with the expected creator, assets, fees and collateral ratio.

New pool discovery checks the pool proxy’s code, implementation and parent factory. This authenticates the deployment; it is not a claim that pools are risk-free. Valueless demo prices remain synthetic and do not track live yields. The testnet experiment has internal tests, not an independent company audit.

## Recorded operator walkthrough — 30 September 2026

The dedicated testnet wallet created one pool from each factory, funded each with 1,000 TestUSDC, and opened a protected position. This exercises both the 18-decimal tWBNB and 8-decimal tvUSDT paths. Both pools use a 7% backer gain share, 0.5% creator gain fee and 175% collateral ratio. Each creation deposited a separate 500 TestUSDC bond. The wallet was not a factory owner at either creation block.

| Asset  | New pool                                                                                      | Creation receipt                                                                                             | Protected deposit |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| tWBNB  | [0x0a342360…](https://testnet.bscscan.com/address/0x0a342360568A984662443D946855Af60a8763e72) | [Receipt](https://testnet.bscscan.com/tx/0xa5902a1953a51fe278ef42837fac5dfe8c96067e4b56a21c7424b0b40209def6) | 0.01 tWBNB        |
| tvUSDT | [0x6838795E…](https://testnet.bscscan.com/address/0x6838795E1006Df0A01478fCFA5a4252CE3E68E1d) | [Receipt](https://testnet.bscscan.com/tx/0x2fd79aa5dec830ae0632466eff58df10d09b4375ea7c74d19d68eec7dabea32c) | 10 tvUSDT         |

There are 12 confirmed transactions including exact token approvals. The [journal](../contracts/deployments/bsc-testnet-pool-creation-check.json) records each signed request and canonical receipt identity. The [public proof](https://bnb.yieldshield.ai/bsc-pool-creation-proof.json) contains only public transaction and pool evidence. No new factory or implementation was deployed.

To recheck the historical evidence without a wallet key or any writes:

```sh
npm run build:packages
BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com node scripts/bsc-pool-creation-check.mjs --check
```

Receipt-block state requires an archive-capable endpoint. The default BNB endpoint returned `missing trie node` for older state during this release; [PublicNode’s documented testnet endpoint](https://bsc.publicnode.com/?testnet) served the historical reads. Endpoint availability can change. The verifier fails if historical state is unavailable rather than substituting current state.

`--broadcast` is for the dedicated, already authorized operator wallet only. It loads an ignored local environment file, is restricted to chain 97 and the pinned genesis, persists every plan and transaction before broadcast, and caps cumulative maximum fees at 0.02 test BNB with zero native transaction value. It resumes exact saved hashes and never creates replacement pools after an uncertain broadcast. Ordinary contributors should use `--check`; no key is required to run the website or tests.
