// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { BscScenarioOracle } from "./BscScenarioOracle.sol";
import { BscTestToken } from "./BscTestToken.sol";

/// @notice Inventory-funded exchange for one valueless BSC Testnet demo token and TestUSDC.
/// @dev Transfers only between the trader and this contract. Inventory is supplied by direct
///      transfers; there is no owner, minting, arbitrary recipient, price setter, or withdrawal key.
contract BscTestExchange is ReentrancyGuard {
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

    BscScenarioOracle public immutable oracle;
    address public immutable quoteToken;
    address public immutable assetToken;
    mapping(address => bool) public supportedStock;
    mapping(address => uint256) public maxAssetAmount;
    mapping(address => uint256) public assetScale;

    // Keep the Base demo exchange event signature for existing wallet receipt checks.
    event Swapped(
        address indexed trader,
        address indexed stock,
        bool buy,
        uint256 stockAmount,
        uint256 usdcAmount,
        uint256 feeAmount
    );

    constructor(address oracle_) {
        _requireDemoChain();
        if (oracle_.codehash != keccak256(type(BscScenarioOracle).runtimeCode)) revert InvalidOracle();
        BscScenarioOracle scenario = BscScenarioOracle(oracle_);
        if (scenario.tokenCount() != 1) revert InvalidOracle();

        address quoteAsset = scenario.quoteToken();
        address asset = scenario.demoTokens(0);
        bytes32 tokenRuntime = keccak256(type(BscTestToken).runtimeCode);
        if (
            quoteAsset == asset || quoteAsset.codehash != tokenRuntime || asset.codehash != tokenRuntime
                || BscTestToken(quoteAsset).decimals() != 6 || BscTestToken(asset).decimals() != 18
        ) revert InvalidOracle();

        oracle = scenario;
        quoteToken = quoteAsset;
        assetToken = asset;
        supportedStock[asset] = true;
        maxAssetAmount[asset] = maxStockAmount;
        assetScale[asset] = 1e18;
    }

    /// @notice Exact asset quantity (18 decimals); total TestUSDC amount (6 decimals) includes fee.
    /// @dev A quote does not reserve inventory. Buys round cost up; sells round proceeds down.
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

    /// @notice Buy: usdcLimit is maximum input. Sell: usdcLimit is minimum output.
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
