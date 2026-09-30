// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply synthetic yield-asset reference; no value, interest, staking or redemption.
/// @dev Constructor-only metadata; no owner, minting, upgrades or transfer fees.
contract BscYieldTestToken is ERC20 {
    error DemoChainOnly();
    error InvalidDemoToken();
    uint256 public constant DEMO_CHAIN_ID = 97;
    uint8 private _demoDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 supply, address recipient)
        ERC20(name_, symbol_)
    {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
        if ((decimals_ != 8 && decimals_ != 18) || supply == 0 || recipient == address(0)) revert InvalidDemoToken();
        _demoDecimals = decimals_;
        _mint(recipient, supply);
    }

    function decimals() public view override returns (uint8) {
        return _demoDecimals;
    }

    function isSyntheticDemo() external pure returns (bool) {
        return true;
    }
}
