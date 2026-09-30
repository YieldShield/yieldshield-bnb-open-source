// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IPriceOracle } from "../interfaces/IPriceOracle.sol";
import { BscTestToken } from "./BscTestToken.sol";
import { BscYieldTestToken } from "./BscYieldTestToken.sol";

/// @notice Formula prices for valueless test tokens referencing yield-bearing assets.
/// @dev Each cycle illustrates accelerated yield growth and a temporary downside shock.
///      The growth resets each cycle: it is neither APY nor redeemable protocol yield.
///      There are no publishers, price setters, upgrades, or administrator controls.
contract BscYieldScenarioOracle is IPriceOracle {
    error DemoChainOnly();
    error InvalidConfiguration();
    error UnsupportedToken(address token);
    error BeforeDemoEpoch();

    uint256 public constant DEMO_CHAIN_ID = 97;
    uint256 public constant QUOTE_PRICE = 1e8;
    uint256 public constant MAX_BASE_PRICE = 1_000_000e8;
    address public quoteToken;
    bytes32 public quoteTokenCodeHash;
    uint64 public epoch;
    uint64 public cycleSeconds;
    address[] public demoTokens;
    mapping(address => uint256) public basePrice;
    mapping(address => uint256) public demoYieldBpsPerCycle;
    mapping(address => uint256) public downsideBps;
    mapping(address => uint256) private _tokenScale;

    constructor(
        address quoteToken_,
        bytes32 quoteCodeHash_,
        address[] memory tokens,
        uint256[] memory prices,
        uint256[] memory yieldBps,
        uint256[] memory shocks,
        uint64 cycleSeconds_
    ) {
        _requireDemoChain();
        if (
            quoteToken_ == address(0) || quoteCodeHash_ == bytes32(0) || quoteToken_.codehash != quoteCodeHash_
                || BscTestToken(quoteToken_).decimals() != 6 || !BscTestToken(quoteToken_).isSyntheticDemo()
                || tokens.length == 0 || tokens.length > 8 || tokens.length != prices.length
                || tokens.length != yieldBps.length || tokens.length != shocks.length || cycleSeconds_ < 4 minutes
                || cycleSeconds_ > 1 days || cycleSeconds_ % 4 != 0 || block.timestamp > type(uint64).max
        ) revert InvalidConfiguration();
        quoteToken = quoteToken_;
        quoteTokenCodeHash = quoteCodeHash_;
        epoch = uint64(block.timestamp);
        cycleSeconds = cycleSeconds_;
        basePrice[quoteToken_] = QUOTE_PRICE;
        _tokenScale[quoteToken_] = 1e6;
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            if (
                basePrice[token] != 0 || token.codehash != keccak256(type(BscYieldTestToken).runtimeCode)
                    || (BscYieldTestToken(token).decimals() != 18 && BscYieldTestToken(token).decimals() != 8)
                    || prices[i] < 1e6 || prices[i] > MAX_BASE_PRICE || yieldBps[i] == 0 || yieldBps[i] > 100
                    || shocks[i] < 100 || shocks[i] > 2500
            ) revert InvalidConfiguration();
            basePrice[token] = prices[i];
            demoYieldBpsPerCycle[token] = yieldBps[i];
            downsideBps[token] = shocks[i];
            _tokenScale[token] = 10 ** BscYieldTestToken(token).decimals();
            demoTokens.push(token);
        }
    }

    function isDemo() external pure returns (bool) {
        return true;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "YieldShield synthetic yield-asset scenarios; not APY or market prices";
    }

    function tokenCount() external view returns (uint256) {
        return demoTokens.length;
    }

    function getPrice(address token) public view returns (uint256) {
        return priceAt(token, block.timestamp);
    }

    function getPriceUnsafe(address token) external view returns (uint256) {
        return getPrice(token);
    }

    function getPriceForFeeAccrual(address token) external view returns (uint256) {
        return getPrice(token);
    }

    function getPriceWithStrictCircuitBreaker(address token) external view returns (uint256) {
        return getPrice(token);
    }

    function priceAt(address token, uint256 timestamp) public view returns (uint256) {
        _requireDemoChain();
        uint256 baseline = basePrice[token];
        if (baseline == 0) revert UnsupportedToken(token);
        if (timestamp < epoch) revert BeforeDemoEpoch();
        if (token == quoteToken) return QUOTE_PRICE;
        uint256 phase = (timestamp - epoch) % cycleSeconds;
        uint256 quarter = cycleSeconds / 4;
        uint256 growth = Math.mulDiv(baseline, demoYieldBpsPerCycle[token] * phase, 10000 * cycleSeconds);
        // Shock starts halfway through the cycle, peaks at three quarters, then recovers.
        uint256 shockProgress =
            phase <= quarter * 2 ? 0 : phase <= quarter * 3 ? phase - quarter * 2 : cycleSeconds - phase;
        uint256 shock = Math.mulDiv(baseline, downsideBps[token] * shockProgress, 10000 * quarter);
        return baseline + growth - shock;
    }

    function getValue(address token, uint256 amount) public view returns (uint256) {
        return Math.mulDiv(amount, getPrice(token), _tokenScale[token]);
    }

    function getValueUnsafe(address token, uint256 amount) external view returns (uint256) {
        return getValue(token, amount);
    }

    function getEquivalentAmount(address tokenA, uint256 amountA, address tokenB) public view returns (uint256) {
        uint256 priceA = getPrice(tokenA);
        uint256 priceB = getPrice(tokenB);
        return Math.mulDiv(amountA, priceA * _tokenScale[tokenB], priceB * _tokenScale[tokenA]);
    }

    function getEquivalentAmountUnsafe(address tokenA, uint256 amountA, address tokenB)
        external
        view
        returns (uint256)
    {
        return getEquivalentAmount(tokenA, amountA, tokenB);
    }

    function supportsCircuitBreaker(address token) external view returns (bool) {
        return _supported(token);
    }

    function supportsStrictProtectedPrice(address token) external view returns (bool) {
        return _supported(token);
    }

    function supportsProtectionOpeningEligibility(address token) external view returns (bool) {
        return _supported(token);
    }

    function isProtectionOpeningAllowed(address token) external view returns (bool) {
        return _supported(token);
    }

    /// @dev This is the formula evaluation time, never a market publication timestamp.
    function isPriceStale(address token) external view returns (bool, uint64) {
        getPrice(token);
        if (block.timestamp > type(uint64).max) revert InvalidConfiguration();
        return (false, uint64(block.timestamp));
    }

    function _supported(address token) private view returns (bool) {
        return block.chainid == DEMO_CHAIN_ID && basePrice[token] != 0;
    }

    function _requireDemoChain() private view {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
    }
}
