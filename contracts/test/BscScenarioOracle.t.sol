// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { BscTestToken } from "../contracts/bsc/BscTestToken.sol";
import { BscScenarioOracle } from "../contracts/bsc/BscScenarioOracle.sol";

contract BscScenarioOracleTest is Test {
    BscTestToken private usd;
    BscTestToken private token;
    BscScenarioOracle private oracle;
    function setUp() public {
        vm.chainId(97);
        usd = new BscTestToken("Test USD", "TestUSDC", 6, 1_000_000e6, address(this));
        token = new BscTestToken("Test WBNB", "tWBNB", 18, 1_000_000e18, address(this));
        address[] memory tokens = new address[](1); tokens[0] = address(token);
        uint256[] memory prices = new uint256[](1); prices[0] = 600e8;
        oracle = new BscScenarioOracle(address(usd), tokens, prices, 240);
    }
    function testCycleAndDecimalConversions() public {
        uint256 epoch = oracle.epoch();
        assertEq(oracle.priceAt(address(token), epoch), 600e8);
        assertEq(oracle.priceAt(address(token), epoch + 60), 750e8);
        assertEq(oracle.priceAt(address(token), epoch + 120), 600e8);
        assertEq(oracle.priceAt(address(token), epoch + 180), 450e8);
        assertEq(oracle.priceAt(address(token), epoch + 240), 600e8);
        assertEq(oracle.getEquivalentAmount(address(token), 1e18, address(usd)), 600e6);
        assertEq(oracle.getEquivalentAmount(address(usd), 600e6, address(token)), 1e18);
        assertEq(oracle.getValue(address(token), 1e18), 600e8);
        vm.expectRevert(BscScenarioOracle.BeforeDemoEpoch.selector);
        oracle.priceAt(address(token), epoch - 1);
        vm.expectRevert(abi.encodeWithSelector(BscScenarioOracle.UnsupportedToken.selector, address(42)));
        oracle.getPrice(address(42));
    }
    function testFuzzPricesBoundedAndPeriodic(uint64 offset) public view {
        uint256 at = uint256(oracle.epoch()) + offset;
        uint256 price = oracle.priceAt(address(token), at);
        assertGe(price, 450e8); assertLe(price, 750e8);
        assertEq(price, oracle.priceAt(address(token), at + 240));
        assertEq(oracle.priceAt(address(usd), at), 1e8);
    }
    function testMainnetAndForeignAssetsRejected() public {
        vm.chainId(56);
        assertFalse(oracle.isProtectionOpeningAllowed(address(token)));
        vm.expectRevert(BscScenarioOracle.DemoChainOnly.selector); oracle.getPrice(address(token));
        vm.expectRevert(BscTestToken.DemoChainOnly.selector);
        new BscTestToken("Wrong chain", "BAD", 18, 1e18, address(this));
        vm.chainId(97);
        address[] memory tokens = new address[](1); tokens[0] = address(42);
        uint256[] memory prices = new uint256[](1); prices[0] = 600e8;
        vm.expectRevert(); new BscScenarioOracle(address(usd), tokens, prices, 240);
        tokens[0] = address(token);
        vm.expectRevert(BscScenarioOracle.InvalidConfiguration.selector);
        new BscScenarioOracle(address(token), tokens, prices, 240);
    }
    function testFixedSupplyNoPublicMintOrOwnership() public {
        uint256 supply = token.totalSupply();
        (bool minted,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", address(this), 1));
        (bool owned,) = address(token).call(abi.encodeWithSignature("owner()"));
        assertFalse(minted); assertFalse(owned); assertEq(token.totalSupply(), supply);
        vm.expectRevert(BscTestToken.InvalidDemoToken.selector);
        new BscTestToken("Bad scale", "BAD", 8, 1e8, address(this));
    }
}
