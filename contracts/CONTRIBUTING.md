# Contributing to YieldShield smart contracts

Start with the repository-wide [contributing guide](../CONTRIBUTING.md) and [security policy](../SECURITY.md). The BNB deployment uses valueless synthetic assets on BSC Testnet; inherited Base, Robinhood and other-chain contracts are not BNB deployment evidence.

For contract logic changes, run the relevant Foundry suites, format checks and size checks:

```sh
forge fmt --check
forge build --offline
forge test --match-path 'test/Bsc*.t.sol'
forge test --match-path 'test/base-modules/*.t.sol'
node scripts-js/checkContractSizes.js
```

The [CI workflow](../.github/workflows/ci.yml) also runs inherited oracle/relay regressions and contracts tooling tests. For security-sensitive logic, consider `make slither` and `make aderyn`, and describe the reviewed findings in the pull request. Do not commit local environment files, keystores, generated build output or private broadcast plans.
