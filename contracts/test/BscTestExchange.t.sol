// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Test } from "forge-std/Test.sol";
import { BscScenarioOracle } from "../contracts/bsc/BscScenarioOracle.sol";
import { BscTestExchange } from "../contracts/bsc/BscTestExchange.sol";
import { BscTestToken } from "../contracts/bsc/BscTestToken.sol";

contract BscTestExchangeTest is Test {
    address private constant TRADER = address(0xA11CE);
    address private constant SINK = address(0xBEEF);

    BscTestToken private usd;
    BscTestToken private asset;
    BscScenarioOracle private oracle;
    BscTestExchange private exchange;

    function setUp() public {
        vm.chainId(97);
        usd = new BscTestToken("Test USD", "TestUSDC", 6, 10_000_000e6, address(this));
        asset = new BscTestToken("Test WBNB", "tWBNB", 18, 1_000_000e18, address(this));
        address[] memory tokens = new address[](1);
        tokens[0] = address(asset);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 600e8;
        oracle = new BscScenarioOracle(address(usd), tokens, prices, 240);
        exchange = new BscTestExchange(address(oracle));

        usd.transfer(address(exchange), 1_000_000e6);
        asset.transfer(address(exchange), 1_000e18);
        usd.transfer(TRADER, 100_000e6);
        asset.transfer(TRADER, 25e18);
        vm.startPrank(TRADER);
        usd.approve(address(exchange), type(uint256).max);
        asset.approve(address(exchange), type(uint256).max);
        vm.stopPrank();
    }

    function testMetadataAndExactQuote() public view {
        assertEq(block.chainid, 97);
        assertEq(address(exchange.oracle()), address(oracle));
        assertEq(exchange.quoteToken(), address(usd));
        assertEq(exchange.assetToken(), address(asset));
        assertTrue(exchange.supportedStock(address(asset)));
        assertFalse(exchange.supportedStock(address(usd)));
        assertEq(exchange.feeBps(), 30);
        assertEq(exchange.maxStockAmount(), 25e18);
        assertEq(exchange.maxAssetAmount(address(asset)), 25e18);
        assertEq(exchange.assetScale(address(asset)), 1e18);
        (uint256 buyCost, uint256 buyFee, uint256 price) = exchange.quote(address(asset), true, 1e18);
        (uint256 sellOutput, uint256 sellFee,) = exchange.quote(address(asset), false, 1e18);
        assertEq(price, 600e8);
        assertEq(buyCost, 601_800_000);
        assertEq(buyFee, 1_800_000);
        assertEq(sellOutput, 598_200_000);
        assertEq(sellFee, 1_800_000);
    }

    function testBuyThenSellTransfersOnlyBetweenTraderAndInventory() public {
        uint256 traderUsdBefore = usd.balanceOf(TRADER);
        uint256 traderAssetBefore = asset.balanceOf(TRADER);
        uint256 inventoryUsdBefore = usd.balanceOf(address(exchange));
        uint256 inventoryAssetBefore = asset.balanceOf(address(exchange));
        (uint256 cost,,) = exchange.quote(address(asset), true, 1e18);
        vm.prank(TRADER);
        assertEq(exchange.swap(address(asset), true, 1e18, cost, block.timestamp + 60), cost);
        assertEq(usd.balanceOf(TRADER), traderUsdBefore - cost);
        assertEq(asset.balanceOf(TRADER), traderAssetBefore + 1e18);
        assertEq(asset.balanceOf(address(exchange)), inventoryAssetBefore - 1e18);

        (uint256 output,,) = exchange.quote(address(asset), false, 1e18);
        vm.prank(TRADER);
        assertEq(exchange.swap(address(asset), false, 1e18, output, block.timestamp + 60), output);
        assertEq(asset.balanceOf(TRADER), traderAssetBefore);
        assertEq(usd.balanceOf(TRADER), traderUsdBefore - 3_600_000);
        assertEq(usd.balanceOf(address(exchange)), inventoryUsdBefore + 3_600_000);
        assertEq(asset.balanceOf(address(exchange)), inventoryAssetBefore);
        assertEq(usd.balanceOf(SINK), 0);
        assertEq(asset.balanceOf(SINK), 0);
    }

    function testMovingScenarioPriceCannotExecuteWithOldBuyLimit() public {
        (uint256 oldCost,,) = exchange.quote(address(asset), true, 1e18);
        vm.warp(uint256(oracle.epoch()) + 60);
        (uint256 newCost,, uint256 price) = exchange.quote(address(asset), true, 1e18);
        assertEq(price, 750e8);
        assertGt(newCost, oldCost);
        vm.prank(TRADER);
        vm.expectRevert(BscTestExchange.SlippageExceeded.selector);
        exchange.swap(address(asset), true, 1e18, oldCost, block.timestamp + 60);
        vm.prank(TRADER);
        assertEq(exchange.swap(address(asset), true, 1e18, newCost, block.timestamp + 60), newCost);
    }

    function testTradeLimitsAndDeadlines() public {
        vm.expectRevert(BscTestExchange.InvalidTrade.selector);
        exchange.quote(address(usd), true, 1e18);
        vm.expectRevert(BscTestExchange.InvalidTrade.selector);
        exchange.quote(address(asset), true, 0);
        vm.expectRevert(BscTestExchange.InvalidTrade.selector);
        exchange.quote(address(asset), false, 25e18 + 1);
        vm.expectRevert(BscTestExchange.InvalidTrade.selector);
        exchange.quote(address(asset), false, 1);

        (uint256 cost,,) = exchange.quote(address(asset), true, 1e18);
        (uint256 output,,) = exchange.quote(address(asset), false, 1e18);
        vm.startPrank(TRADER);
        vm.expectRevert(BscTestExchange.QuoteExpired.selector);
        exchange.swap(address(asset), true, 1e18, cost, block.timestamp - 1);
        vm.expectRevert(BscTestExchange.QuoteExpired.selector);
        exchange.swap(address(asset), true, 1e18, cost, block.timestamp + 10 minutes + 1);
        vm.expectRevert(BscTestExchange.InvalidTrade.selector);
        exchange.swap(address(asset), true, 1e18, 0, block.timestamp + 60);
        vm.expectRevert(BscTestExchange.SlippageExceeded.selector);
        exchange.swap(address(asset), true, 1e18, cost - 1, block.timestamp + 60);
        vm.expectRevert(BscTestExchange.SlippageExceeded.selector);
        exchange.swap(address(asset), false, 1e18, output + 1, block.timestamp + 60);
        assertEq(exchange.swap(address(asset), true, 1e18, cost, block.timestamp + 10 minutes), cost);
        vm.stopPrank();
    }

    function testQuoteRequiresOutputInventoryOnBothSides() public {
        vm.prank(address(exchange));
        asset.transfer(SINK, 1_000e18);
        vm.expectRevert(BscTestExchange.InsufficientInventory.selector);
        exchange.quote(address(asset), true, 1e18);
        vm.prank(address(exchange));
        usd.transfer(SINK, 1_000_000e6);
        vm.expectRevert(BscTestExchange.InsufficientInventory.selector);
        exchange.quote(address(asset), false, 1e18);
    }

    function testConstructorAndCallsRejectOtherChainsAndRuntimeChanges() public {
        vm.chainId(56);
        vm.expectRevert(BscTestExchange.DemoChainOnly.selector);
        new BscTestExchange(address(oracle));
        vm.expectRevert(BscTestExchange.DemoChainOnly.selector);
        exchange.quote(address(asset), true, 1e18);
        vm.expectRevert(BscTestExchange.DemoChainOnly.selector);
        exchange.swap(address(asset), true, 1e18, 1e18, block.timestamp + 60);
        vm.chainId(97);

        vm.expectRevert(BscTestExchange.InvalidOracle.selector);
        new BscTestExchange(address(usd));
        vm.etch(address(asset), hex"00");
        vm.expectRevert(BscTestExchange.InvalidOracle.selector);
        new BscTestExchange(address(oracle));
    }

    function testConstructorRejectsMultiTokenOracle() public {
        BscTestToken second = new BscTestToken("Second", "SECOND", 18, 1_000e18, address(this));
        address[] memory tokens = new address[](2);
        tokens[0] = address(asset);
        tokens[1] = address(second);
        uint256[] memory prices = new uint256[](2);
        prices[0] = 600e8;
        prices[1] = 2_000e8;
        BscScenarioOracle multi = new BscScenarioOracle(address(usd), tokens, prices, 240);
        vm.expectRevert(BscTestExchange.InvalidOracle.selector);
        new BscTestExchange(address(multi));
    }

    function testFuzzRoundTripCannotIncreaseTraderQuoteBalance(uint256 rawAmount) public {
        uint256 amount = bound(rawAmount, 1e14, 25e18);
        uint256 beforeUsd = usd.balanceOf(TRADER);
        (uint256 cost,,) = exchange.quote(address(asset), true, amount);
        vm.prank(TRADER);
        exchange.swap(address(asset), true, amount, cost, block.timestamp + 60);
        (uint256 output,,) = exchange.quote(address(asset), false, amount);
        vm.prank(TRADER);
        exchange.swap(address(asset), false, amount, output, block.timestamp + 60);
        assertLt(usd.balanceOf(TRADER), beforeUsd);
    }
}
