// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { ProtocolAccessControlUpgradeable } from "../base/ProtocolAccessControlUpgradeable.sol";
import { BasePoolInitializeModule } from "../base-modules/BasePoolInitializeModule.sol";
import { BscTestToken } from "./BscTestToken.sol";
import { BscYieldTestToken } from "./BscYieldTestToken.sol";
import { TokenWhitelistLib } from "../libraries/TokenWhitelistLib.sol";

/// @notice Testnet-only initializer reusing reviewed pool logic and the existing demo quote token.
/// @dev Quote identity is immutable because the original token predates dependency upgrades.
///      Only timing slots55/56 are changed after the original initialization validations.
contract BscYieldPoolInitializeModule is ProtocolAccessControlUpgradeable {
    error DemoChainOnly();
    error InvalidModule();
    error InvalidDemoToken();
    error UnknownSelector();
    uint256 public constant DEMO_CHAIN_ID = 97;
    uint256 public constant DEMO_MINIMUM_POOL_TIME = 60;
    uint256 public constant DEMO_UNLOCK_DURATION = 120;
    address public immutable originalModule;
    bytes32 public immutable originalModuleCodeHash;
    address public immutable quoteToken;
    bytes32 public immutable quoteTokenCodeHash;
    BasePoolInitializeModule.PoolConfig private _poolConfig;

    constructor(address originalModule_, address quoteToken_, bytes32 quoteCodeHash_) {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
        if (originalModule_.code.length == 0) revert InvalidModule();
        if (
            quoteToken_ == address(0) || quoteCodeHash_ == bytes32(0) || quoteToken_.codehash != quoteCodeHash_
                || BscTestToken(quoteToken_).decimals() != 6 || !BscTestToken(quoteToken_).isSyntheticDemo()
        ) revert InvalidDemoToken();
        originalModule = originalModule_;
        originalModuleCodeHash = originalModule_.codehash;
        quoteToken = quoteToken_;
        quoteTokenCodeHash = quoteCodeHash_;
        _disableInitializers();
    }

    fallback() external {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
        if (
            msg.sig != BasePoolInitializeModule.initialize.selector
                && msg.sig != BasePoolInitializeModule.initializeWithAccessControl.selector
        ) revert UnknownSelector();
        if (originalModule.codehash != originalModuleCodeHash) revert InvalidModule();
        (TokenWhitelistLib.TokenInfo memory shielded, TokenWhitelistLib.TokenInfo memory backing) =
            abi.decode(msg.data[4:], (TokenWhitelistLib.TokenInfo, TokenWhitelistLib.TokenInfo));
        if (
            shielded.token.codehash != keccak256(type(BscYieldTestToken).runtimeCode)
                || (BscYieldTestToken(shielded.token).decimals() != 18
                    && BscYieldTestToken(shielded.token).decimals() != 8) || backing.token != quoteToken
                || backing.token.codehash != quoteTokenCodeHash
        ) revert InvalidDemoToken();
        (bool success, bytes memory data) = originalModule.delegatecall(msg.data);
        if (!success) assembly ("memory-safe") { revert(add(data, 32), mload(data)) }
        _poolConfig.minimumPoolTime = DEMO_MINIMUM_POOL_TIME;
        _poolConfig.unlockDuration = DEMO_UNLOCK_DURATION;
        assembly ("memory-safe") { return(add(data, 32), mload(data)) }
    }
}
