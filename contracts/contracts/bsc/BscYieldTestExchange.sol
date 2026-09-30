// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { BscYieldScenarioOracle } from "./BscYieldScenarioOracle.sol";
import { BscTestToken } from "./BscTestToken.sol";
import { BscYieldTestToken } from "./BscYieldTestToken.sol";

/// @notice Inventory-funded trades in valueless synthetic yield-asset references only.
/// @dev No owner, minting, upgrades, withdrawal key or mutable quote configuration.
contract BscYieldTestExchange is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error DemoChainOnly();
    error InvalidOracle();
    error InvalidTrade();
    error QuoteExpired();
    error SlippageExceeded();
    error InsufficientInventory();
    error InexactTransfer();
    uint256 public constant DEMO_CHAIN_ID = 97;
    uint256 public constant feeBps = 30;
    uint256 public constant maxStockAmount = 25e18;
    uint256 public constant MAX_DEADLINE_DELAY = 10 minutes;
    BscYieldScenarioOracle public immutable oracle;
    address public immutable quoteToken;
    mapping(address => bool) public supportedStock;
    mapping(address => uint256) public maxAssetAmount;
    mapping(address => uint256) public assetScale;
    event Swapped(
        address indexed trader,
        address indexed stock,
        bool buy,
        uint256 stockAmount,
        uint256 usdcAmount,
        uint256 feeAmount
    );

    constructor(address oracle_, uint256[] memory maximumAmounts) {
        _requireDemoChain();
        if (oracle_.codehash != keccak256(type(BscYieldScenarioOracle).runtimeCode)) revert InvalidOracle();
        BscYieldScenarioOracle scenario = BscYieldScenarioOracle(oracle_);
        uint256 count = scenario.tokenCount();
        address quoteAsset = scenario.quoteToken();
        if (
            count == 0 || count > 8 || count != maximumAmounts.length
                || quoteAsset.codehash != scenario.quoteTokenCodeHash() || BscTestToken(quoteAsset).decimals() != 6
        ) {
            revert InvalidOracle();
        }
        oracle = scenario;
        quoteToken = quoteAsset;
        for (uint256 i; i < count; ++i) {
            address asset = scenario.demoTokens(i);
            uint8 tokenDecimals = BscYieldTestToken(asset).decimals();
            uint256 scale = 10 ** tokenDecimals;
            if (
                asset == quoteAsset || supportedStock[asset]
                    || asset.codehash != keccak256(type(BscYieldTestToken).runtimeCode)
                    || (tokenDecimals != 18 && tokenDecimals != 8) || maximumAmounts[i] == 0
                    || maximumAmounts[i] > 1_000_000 * scale
            ) {
                revert InvalidOracle();
            }
            supportedStock[asset] = true;
            maxAssetAmount[asset] = maximumAmounts[i];
            assetScale[asset] = scale;
        }
    }

    function quote(address stock, bool buy, uint256 stockAmount)
        public
        view
        returns (uint256 usdcAmount, uint256 feeAmount, uint256 price)
    {
        _requireDemoChain();
        if (!supportedStock[stock] || stockAmount == 0 || stockAmount > maxAssetAmount[stock]) revert InvalidTrade();
        price = oracle.getPrice(stock);
        uint256 notional =
            Math.mulDiv(stockAmount, price, assetScale[stock] * 100, buy ? Math.Rounding.Ceil : Math.Rounding.Floor);
        feeAmount = Math.mulDiv(notional, feeBps, 10000, Math.Rounding.Ceil);
        if (notional == 0 || (!buy && notional <= feeAmount)) revert InvalidTrade();
        usdcAmount = buy ? notional + feeAmount : notional - feeAmount;
        if (IERC20(buy ? stock : quoteToken).balanceOf(address(this)) < (buy ? stockAmount : usdcAmount)) {
            revert InsufficientInventory();
        }
    }

    function swap(address stock, bool buy, uint256 stockAmount, uint256 usdcLimit, uint256 deadline)
        external
        nonReentrant
        returns (uint256 usdcAmount)
    {
        _requireDemoChain();
        if (deadline < block.timestamp || deadline - block.timestamp > MAX_DEADLINE_DELAY) revert QuoteExpired();
        if (usdcLimit == 0) revert InvalidTrade();
        uint256 feeAmount;
        (usdcAmount, feeAmount,) = quote(stock, buy, stockAmount);
        if ((buy && usdcAmount > usdcLimit) || (!buy && usdcAmount < usdcLimit)) revert SlippageExceeded();
        _transferExact(IERC20(buy ? quoteToken : stock), msg.sender, address(this), buy ? usdcAmount : stockAmount);
        _transferExact(IERC20(buy ? stock : quoteToken), address(this), msg.sender, buy ? stockAmount : usdcAmount);
        emit Swapped(msg.sender, stock, buy, stockAmount, usdcAmount, feeAmount);
    }

    function _transferExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 fromBefore = token.balanceOf(from);
        uint256 toBefore = token.balanceOf(to);
        if (from == address(this)) token.safeTransfer(to, amount);
        else token.safeTransferFrom(from, to, amount);
        uint256 fromAfter = token.balanceOf(from);
        uint256 toAfter = token.balanceOf(to);
        if (
            fromBefore < fromAfter || fromBefore - fromAfter != amount || toAfter < toBefore
                || toAfter - toBefore != amount
        ) revert InexactTransfer();
    }

    function _requireDemoChain() private view {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
    }
}
