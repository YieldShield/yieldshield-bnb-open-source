# Third-party source and notices

This repository contains adapted source from other projects. A repository-level license for project-authored code does not override file-level SPDX identifiers or upstream notices.

- **Uniswap v3-core:** `contracts/contracts/oracles/libraries/FullMath.sol` and `TickMath.sol` are derived from [Uniswap v3-core v1.0.0](https://github.com/Uniswap/v3-core/tree/v1.0.0/contracts/libraries). `contracts/contracts/oracles/UniswapV3TWAPFeed.sol` is marked GPL-2.0-or-later and incorporates or depends on that code. Preserve the file-level SPDX identifiers. The [GPL-2.0-or-later license text](licenses/GPL-2.0-or-later.txt) accompanies these files.
- **Scaffold-ETH 2 / BuidlGuidl:** the Foundry `Makefile`, `script/Deploy.s.sol`, `script/DeployHelpers.s.sol`, `script/VerifyAll.s.sol`, and retained `scripts-js` account, deployment and ABI helpers originated in or were adapted from the Scaffold-ETH 2 starter. The original [MIT license and copyright notice](licenses/BUIDLGUIDL-MIT.txt) credits Copyright (c) 2023 BuidlGuidl. YieldShield modifications do not remove that notice.
- **Foundry submodules:** `contracts/lib/forge-std`, `openzeppelin-contracts`, `openzeppelin-contracts-upgradeable`, and `solidity-bytes-utils` are pinned Git submodules. Their own upstream licenses apply when their contents are fetched.

Package dependencies resolved through npm lockfiles are not copied into the Git repository. Their package licenses apply to installed or bundled distributions. See [contracts/NOTICE](contracts/NOTICE) for the contracts workspace notice.
