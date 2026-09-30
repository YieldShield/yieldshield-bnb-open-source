// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { BscTestToken } from "../contracts/bsc/BscTestToken.sol";
import { BscYieldTestToken } from "../contracts/bsc/BscYieldTestToken.sol";
import { BscYieldScenarioOracle } from "../contracts/bsc/BscYieldScenarioOracle.sol";
import { BscYieldTestExchange } from "../contracts/bsc/BscYieldTestExchange.sol";
import { BscYieldPoolInitializeModule } from "../contracts/bsc/BscYieldPoolInitializeModule.sol";
import { BaseModuleTestDeploy } from "./base-modules/BaseModuleTestDeploy.sol";
import { BasePoolRouter } from "../contracts/base-modules/BasePoolRouter.sol";
import { SplitRiskPool } from "../contracts/SplitRiskPool.sol";
import { SplitRiskPoolFactory } from "../contracts/SplitRiskPoolFactory.sol";
import { CompositeOracle } from "../contracts/oracles/CompositeOracle.sol";
import { YSTimelockController } from "../contracts/governance/YSTimelockController.sol";
import { ConfigurableTokenFaucet } from "../contracts/mocks/ConfigurableTokenFaucet.sol";
import { IShieldReceiptNFT } from "../contracts/interfaces/IShieldReceiptNFT.sol";
import { ErrorsLib } from "../contracts/libraries/ErrorsLib.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract BscYieldAssetsTest is Test {
    address private constant USER = address(0xA11CE);
    BscTestToken private usd;
    BscYieldTestToken[4] private tokens;
    BscYieldScenarioOracle private oracle;
    BscYieldTestExchange private exchange;
    SplitRiskPoolFactory private factory;
    SplitRiskPool[4] private pools;
    BasePoolRouter private originalRouter;
    BasePoolRouter private router;
    BscYieldPoolInitializeModule private initializer;
    CompositeOracle private composite;
    YSTimelockController private timelock;
    uint256[4] private prices = [uint256(600e8), 2000e8, 110000000, 2000000];
    uint256[4] private scales = [uint256(1e18), 1e18, 1e18, 1e8];

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function setUp() public {
        vm.chainId(97);
        usd = new BscTestToken("Demo USD - no value", "TestUSDC", 6, 10_000_000e6, address(this));
        address[] memory assets = new address[](4);
        uint256[] memory baselines = new uint256[](4);
        uint256[] memory yields = new uint256[](4);
        uint256[] memory shocks = new uint256[](4);
        uint256[] memory limits = new uint256[](4);
        string[4] memory symbols = ["tSlisBNB", "tWBETH", "tsUSDe", "tvUSDT"];
        for (uint256 i; i < 4; ++i) {
            tokens[i] = new BscYieldTestToken(
                "Synthetic reference - no value", symbols[i], i == 3 ? 8 : 18, 100_000_000 * scales[i], address(this)
            );
            assets[i] = address(tokens[i]);
            baselines[i] = prices[i];
            yields[i] = i == 0 ? 20 : i == 1 ? 15 : 10;
            shocks[i] = i < 2 ? 1500 : 1000;
            limits[i] = 25 * scales[i];
        }
        oracle = new BscYieldScenarioOracle(address(usd), address(usd).codehash, assets, baselines, yields, shocks, 240);
        exchange = new BscYieldTestExchange(address(oracle), limits);
        usd.transfer(address(exchange), 1_000_000e6);
        usd.transfer(USER, 100_000e6);
        for (uint256 i; i < 4; ++i) {
            tokens[i].transfer(address(exchange), 1000 * scales[i]);
        }
        vm.prank(USER);
        usd.approve(address(exchange), type(uint256).max);
        address[] memory controllers = new address[](1);
        controllers[0] = address(this);
        timelock = new YSTimelockController(2 days, controllers, controllers, address(this));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));
        originalRouter = BasePoolRouter(payable(BaseModuleTestDeploy.pool(vm)));
        initializer =
            new BscYieldPoolInitializeModule(originalRouter.initializeModule(), address(usd), address(usd).codehash);
        router = new BasePoolRouter(
            originalRouter.adminModule(),
            originalRouter.depositsModule(),
            originalRouter.feesModule(),
            address(initializer),
            originalRouter.partialexitModule(),
            originalRouter.protectorModule(),
            originalRouter.shieldexitModule(),
            originalRouter.viewsModule()
        );
        factory = SplitRiskPoolFactory(
            payable(address(
                    new ERC1967Proxy(
                        BaseModuleTestDeploy.factory(vm),
                        abi.encodeCall(
                            SplitRiskPoolFactory.initialize, (address(this), address(timelock), address(router))
                        )
                    )
                ))
        );
        composite = new CompositeOracle();
        composite.transferOwnership(address(factory));
        factory.setCompositeOracle(address(composite));
        factory.setDefaultProtocolFeeRecipient(address(timelock));
        for (uint256 i; i < 4; ++i) {
            factory.addTokenInitial(
                address(tokens[i]), tokens[i].name(), tokens[i].symbol(), address(oracle), address(0), 10000, true
            );
        }
        factory.addTokenInitial(address(usd), usd.name(), usd.symbol(), address(oracle), address(0), 10000, true);
        factory.setTokenRequiresStrictProtectedPrice(address(usd), true);
        factory.finalizeBootstrap();
        factory.transferOwnership(address(timelock));
        for (uint256 i; i < 4; ++i) {
            usd.approve(address(factory), 1000e6);
            pools[i] = SplitRiskPool(
                payable(factory.createPool(
                        address(tokens[i]), tokens[i].symbol(), address(usd), usd.symbol(), 1000, 100, 15000, 1000e6
                    ))
            );
            usd.approve(address(pools[i]), 100_000e6);
            pools[i].depositBackingAsset(address(usd), 100_000e6, 100_000e6);
        }
    }

    function testFormulaYieldShockAndResetForAllAssets() public view {
        for (uint256 i; i < 4; ++i) {
            address token = address(tokens[i]);
            uint256 epoch = oracle.epoch();
            assertEq(oracle.priceAt(token, epoch), prices[i]);
            assertGt(oracle.priceAt(token, epoch + 60), prices[i]);
            assertLt(oracle.priceAt(token, epoch + 180), prices[i]);
            assertEq(oracle.priceAt(token, epoch + 240), prices[i]);
            assertEq(oracle.getEquivalentAmount(token, scales[i], address(usd)), prices[i] / 100);
            assertEq(oracle.getValue(token, scales[i]), prices[i]);
        }
        assertEq(oracle.priceAt(address(usd), oracle.epoch() + 180), 1e8);
    }

    function testAllFourBuyProtectLossExitAndSell() public {
        uint256[4] memory positions;
        for (uint256 i; i < 4; ++i) {
            address asset = address(tokens[i]);
            uint256 amount = scales[i];
            (uint256 cost,,) = exchange.quote(asset, true, amount * 2);
            vm.startPrank(USER);
            exchange.swap(asset, true, amount * 2, cost, block.timestamp + 60);
            tokens[i].approve(address(pools[i]), amount);
            uint256 positionId = pools[i].depositShieldedAsset(asset, amount, amount);
            positions[i] = positionId;
            assertEq(IShieldReceiptNFT(pools[i].shieldReceiptNFT()).getPosition(positionId).valueAtDeposit, prices[i]);
            tokens[i].approve(address(exchange), amount);
            (uint256 proceeds,,) = exchange.quote(asset, false, amount);
            exchange.swap(asset, false, amount, proceeds, block.timestamp + 60);
            vm.stopPrank();
        }
        vm.warp(uint256(oracle.epoch()) + 180);
        for (uint256 i; i < 4; ++i) {
            uint256 balanceBefore = usd.balanceOf(USER);
            vm.prank(USER);
            pools[i].shieldedWithdraw(positions[i], address(usd), prices[i] / 100);
            assertEq(usd.balanceOf(USER) - balanceBefore, prices[i] / 100);
            assertEq(tokens[i].balanceOf(USER), 0);
        }
    }

    function testExchangeBoundsRoundingDeadlinesAndSlippage() public {
        address asset = address(tokens[3]);
        vm.expectRevert(BscYieldTestExchange.InvalidTrade.selector);
        exchange.quote(address(usd), true, 1e6);
        vm.expectRevert(BscYieldTestExchange.InvalidTrade.selector);
        exchange.quote(asset, true, 0);
        vm.expectRevert(BscYieldTestExchange.InvalidTrade.selector);
        exchange.quote(asset, true, 26e8);
        vm.expectRevert(BscYieldTestExchange.InvalidTrade.selector);
        exchange.quote(asset, false, 1);
        (uint256 cost, uint256 fee,) = exchange.quote(asset, true, 1);
        assertEq(cost, 2);
        assertEq(fee, 1);
        vm.startPrank(USER);
        vm.expectRevert(BscYieldTestExchange.SlippageExceeded.selector);
        exchange.swap(asset, true, 1, cost - 1, block.timestamp + 60);
        vm.expectRevert(BscYieldTestExchange.QuoteExpired.selector);
        exchange.swap(asset, true, 1, cost, block.timestamp + 601);
        vm.expectRevert(BscYieldTestExchange.QuoteExpired.selector);
        exchange.swap(asset, true, 1, cost, block.timestamp - 1);
        vm.stopPrank();
        tokens[0].transfer(address(0xB0B), tokens[0].balanceOf(address(this)));
        vm.prank(address(exchange));
        tokens[0].transfer(address(0xB0B), 1000e18);
        vm.expectRevert(BscYieldTestExchange.InsufficientInventory.selector);
        exchange.quote(address(tokens[0]), true, 1e18);
    }

    function testAllFourSameAssetExitKeepsRemainingYieldAfterFees() public {
        uint256[4] memory positions;
        for (uint256 i; i < 4; ++i) {
            tokens[i].transfer(USER, scales[i]);
            vm.startPrank(USER);
            tokens[i].approve(address(pools[i]), scales[i]);
            positions[i] = pools[i].depositShieldedAsset(address(tokens[i]), scales[i], scales[i]);
            vm.stopPrank();
        }
        vm.warp(uint256(oracle.epoch()) + 60);
        for (uint256 i; i < 4; ++i) {
            vm.prank(USER);
            pools[i].shieldedWithdraw(positions[i], address(tokens[i]), scales[i] * 99 / 100);
            assertGe(tokens[i].balanceOf(USER), scales[i] * 99 / 100);
            assertLe(tokens[i].balanceOf(USER), scales[i]);
        }
    }

    function testFaucetAllTokensAndCooldown() public {
        ConfigurableTokenFaucet faucet = new ConfigurableTokenFaucet(address(this));
        address[] memory assets = new address[](5);
        uint256[] memory drips = new uint256[](5);
        assets[0] = address(usd);
        drips[0] = 1000e6;
        usd.transfer(address(faucet), 2000e6);
        for (uint256 i; i < 4; ++i) {
            assets[i + 1] = address(tokens[i]);
            drips[i + 1] = scales[i];
            tokens[i].transfer(address(faucet), scales[i] * 2);
        }
        faucet.setTokens(assets, drips);
        faucet.transferOwnership(address(timelock));
        faucet.dripAll(USER);
        for (uint256 i; i < 4; ++i) {
            assertEq(tokens[i].balanceOf(USER), scales[i]);
            (bool available, uint256 next) = faucet.canDrip(address(tokens[i]), USER);
            assertFalse(available);
            assertEq(next, block.timestamp + 1 days);
        }
        vm.expectRevert();
        faucet.setTokens(assets, drips);
    }

    function testInitializerRouterGovernanceAndDecimalSafety() public view {
        assertEq(factory.owner(), address(timelock));
        assertFalse(factory.bootstrapModeEnabled());
        assertEq(router.depositsModule(), originalRouter.depositsModule());
        assertEq(router.initializeModule(), address(initializer));
        assertEq(initializer.quoteToken(), address(usd));
        assertEq(initializer.quoteTokenCodeHash(), address(usd).codehash);
        for (uint256 i; i < 4; ++i) {
            assertEq(pools[i].shieldedTokenScale(), scales[i]);
            assertEq(uint256(vm.load(address(pools[i]), bytes32(uint256(55)))), 60);
            assertEq(uint256(vm.load(address(pools[i]), bytes32(uint256(56)))), 120);
            assertEq(pools[i].owner(), address(factory));
            assertTrue(pools[i].requiresStrictProtectedBackingPrice());
        }
        assertLe(address(oracle).code.length, 24576);
        assertLe(address(exchange).code.length, 24576);
        assertLe(address(initializer).code.length, 24576);
    }

    function testWrongChainReadTradeAndDeployFailClosed() public {
        vm.chainId(56);
        assertFalse(oracle.isProtectionOpeningAllowed(address(tokens[0])));
        vm.expectRevert(BscYieldScenarioOracle.DemoChainOnly.selector);
        oracle.getPrice(address(tokens[0]));
        vm.expectRevert(BscYieldTestExchange.DemoChainOnly.selector);
        exchange.quote(address(tokens[0]), true, 1e18);
        vm.expectRevert(BscYieldTestExchange.DemoChainOnly.selector);
        exchange.swap(address(tokens[0]), true, 1e18, 1e6, block.timestamp + 60);
        vm.expectRevert(BscYieldTestToken.DemoChainOnly.selector);
        new BscYieldTestToken("bad", "bad", 18, 1e18, USER);
        vm.expectRevert(BscYieldPoolInitializeModule.DemoChainOnly.selector);
        new BscYieldPoolInitializeModule(address(router), address(usd), address(usd).codehash);
    }

    function testInvalidOracleConfigAndQuoteIdentityRejected() public {
        address[] memory assets = new address[](1);
        assets[0] = address(tokens[0]);
        uint256[] memory values = new uint256[](1);
        values[0] = 600e8;
        uint256[] memory yieldBps = new uint256[](1);
        yieldBps[0] = 20;
        uint256[] memory shock = new uint256[](1);
        shock[0] = 1500;
        vm.expectRevert(BscYieldScenarioOracle.InvalidConfiguration.selector);
        new BscYieldScenarioOracle(address(usd), bytes32(uint256(1)), assets, values, yieldBps, shock, 240);
        yieldBps[0] = 101;
        vm.expectRevert(BscYieldScenarioOracle.InvalidConfiguration.selector);
        new BscYieldScenarioOracle(address(usd), address(usd).codehash, assets, values, yieldBps, shock, 240);
        address original = originalRouter.initializeModule();
        vm.expectRevert(BscYieldPoolInitializeModule.InvalidDemoToken.selector);
        new BscYieldPoolInitializeModule(original, address(usd), bytes32(uint256(1)));
        uint256 beforeEpoch = oracle.epoch() - 1;
        vm.expectRevert(BscYieldScenarioOracle.BeforeDemoEpoch.selector);
        oracle.priceAt(address(tokens[0]), beforeEpoch);
        vm.expectRevert(abi.encodeWithSelector(BscYieldScenarioOracle.UnsupportedToken.selector, USER));
        oracle.getPrice(USER);
    }

    function testFuzzFormulaBounds(uint64 elapsed, uint8 index) public view {
        uint256 i = uint256(index) % 4;
        uint256 price = oracle.priceAt(address(tokens[i]), uint256(oracle.epoch()) + elapsed);
        assertGe(price, prices[i] * (10000 - oracle.downsideBps(address(tokens[i]))) / 10000);
        assertLe(price, prices[i] * (10000 + oracle.demoYieldBpsPerCycle(address(tokens[i]))) / 10000);
    }
}
