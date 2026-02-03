// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayAgentHook} from "../src/PayAgentHook.sol";
import {IFeeStrategy} from "../src/IFeeStrategy.sol";
import {FixedFeeStrategy} from "../src/strategies/FixedFeeStrategy.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

/// @dev A malicious strategy that returns a fee above MAX_FEE
contract MaliciousFeeStrategy is IFeeStrategy {
    function getFee(PoolId, PoolKey calldata, SwapParams calldata) external pure returns (uint24) {
        return 999_999; // Way above 1%
    }
}

/// @dev A strategy that always reverts — should not brick the pool
contract RevertingFeeStrategy is IFeeStrategy {
    function getFee(PoolId, PoolKey calldata, SwapParams calldata) external pure returns (uint24) {
        revert("boom");
    }
}

contract PayAgentHookTest is Test {
    using PoolIdLibrary for PoolKey;

    PayAgentHook public hook;
    address public admin = address(0xBEEF);
    address public poolManager = address(0xCAFE);

    // Hook address must have the correct flag bits set in the least significant 14 bits:
    //   AFTER_INITIALIZE_FLAG = 1 << 12 = 0x1000 (required by BaseOverrideFee)
    //   BEFORE_SWAP_FLAG      = 1 << 7  = 0x0080
    //   AFTER_SWAP_FLAG       = 1 << 6  = 0x0040
    //   Combined = 0x10C0
    address constant HOOK_ADDRESS = address(uint160(0xA0b86991c6218B36C1D19D4a2E9eB0CE000010C0));

    function setUp() public {
        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager));
        deployCodeTo("PayAgentHook.sol:PayAgentHook", constructorArgs, HOOK_ADDRESS);
        hook = PayAgentHook(HOOK_ADDRESS);
    }

    // ──────────────────────────────────────────────
    // Hook Permissions
    // ──────────────────────────────────────────────

    function test_HookPermissions() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();

        assertTrue(permissions.afterInitialize, "afterInitialize should be true");
        assertTrue(permissions.beforeSwap, "beforeSwap should be true");
        assertTrue(permissions.afterSwap, "afterSwap should be true");

        assertFalse(permissions.beforeInitialize, "beforeInitialize should be false");
        assertFalse(permissions.beforeAddLiquidity, "beforeAddLiquidity should be false");
        assertFalse(permissions.afterAddLiquidity, "afterAddLiquidity should be false");
        assertFalse(permissions.beforeRemoveLiquidity, "beforeRemoveLiquidity should be false");
        assertFalse(permissions.afterRemoveLiquidity, "afterRemoveLiquidity should be false");
        assertFalse(permissions.beforeDonate, "beforeDonate should be false");
        assertFalse(permissions.afterDonate, "afterDonate should be false");
        assertFalse(permissions.beforeSwapReturnDelta, "beforeSwapReturnDelta should be false");
        assertFalse(permissions.afterSwapReturnDelta, "afterSwapReturnDelta should be false");
        assertFalse(permissions.afterAddLiquidityReturnDelta, "afterAddLiquidityReturnDelta should be false");
        assertFalse(permissions.afterRemoveLiquidityReturnDelta, "afterRemoveLiquidityReturnDelta should be false");
    }

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    function test_PoolManagerAddress() public view {
        assertEq(address(hook.poolManager()), poolManager, "Pool manager address should match");
    }

    // ──────────────────────────────────────────────
    // Per-Pool Admin (via afterInitialize)
    // ──────────────────────────────────────────────

    function test_AfterInitialize_SetsPoolAdmin() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        // Simulate PoolManager calling afterInitialize with admin as sender
        vm.prank(poolManager);
        hook.afterInitialize(admin, key, 79228162514264337593543950336, 0);

        assertEq(hook.poolAdmin(poolId), admin, "Pool admin should be set to sender");
    }

    function test_AfterInitialize_EmitsPoolRegistered() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        vm.prank(poolManager);
        vm.expectEmit(true, true, false, false);
        emit PayAgentHook.PoolRegistered(poolId, admin);
        hook.afterInitialize(admin, key, 79228162514264337593543950336, 0);
    }

    // ──────────────────────────────────────────────
    // 2-Step Per-Pool Admin Transfer
    // ──────────────────────────────────────────────

    function test_TransferAndAcceptPoolAdmin() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address newAdmin = address(0xFACE);

        _initializePool(key);

        // Step 1: Admin proposes
        vm.prank(admin);
        hook.transferPoolAdmin(poolId, newAdmin);
        assertEq(hook.pendingPoolAdmin(poolId), newAdmin, "Pending admin should be set");
        assertEq(hook.poolAdmin(poolId), admin, "Admin should not change yet");

        // Step 2: New admin accepts
        vm.prank(newAdmin);
        hook.acceptPoolAdmin(poolId);
        assertEq(hook.poolAdmin(poolId), newAdmin, "Admin should be updated");
        assertEq(hook.pendingPoolAdmin(poolId), address(0), "Pending admin should be cleared");
    }

    function test_TransferPoolAdmin_EmitsEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address newAdmin = address(0xFACE);

        _initializePool(key);

        vm.prank(admin);
        vm.expectEmit(true, true, true, false);
        emit PayAgentHook.PoolAdminTransferProposed(poolId, admin, newAdmin);
        hook.transferPoolAdmin(poolId, newAdmin);
    }

    function test_AcceptPoolAdmin_EmitsEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address newAdmin = address(0xFACE);

        _initializePool(key);

        vm.prank(admin);
        hook.transferPoolAdmin(poolId, newAdmin);

        vm.prank(newAdmin);
        vm.expectEmit(true, true, true, false);
        emit PayAgentHook.PoolAdminTransferred(poolId, admin, newAdmin);
        hook.acceptPoolAdmin(poolId);
    }

    function test_TransferPoolAdmin_OnlyAdmin() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address nonAdmin = address(0xDEAD);

        _initializePool(key);

        vm.prank(nonAdmin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, nonAdmin));
        hook.transferPoolAdmin(poolId, address(0xFACE));
    }

    function test_TransferPoolAdmin_RevertsOnZeroAddress() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        vm.expectRevert(PayAgentHook.ZeroAddress.selector);
        hook.transferPoolAdmin(poolId, address(0));
    }

    function test_AcceptPoolAdmin_RevertsIfNoPending() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(address(0xFACE));
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.NoPendingAdmin.selector, poolId));
        hook.acceptPoolAdmin(poolId);
    }

    function test_AcceptPoolAdmin_RevertsIfWrongCaller() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address newAdmin = address(0xFACE);
        address wrongCaller = address(0xDEAD);

        _initializePool(key);

        vm.prank(admin);
        hook.transferPoolAdmin(poolId, newAdmin);

        vm.prank(wrongCaller);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.NotPendingAdmin.selector, wrongCaller));
        hook.acceptPoolAdmin(poolId);
    }

    function test_NewAdminCanAct() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address newAdmin = address(0xFACE);

        _initializePool(key);

        // Transfer admin via 2-step
        vm.prank(admin);
        hook.transferPoolAdmin(poolId, newAdmin);
        vm.prank(newAdmin);
        hook.acceptPoolAdmin(poolId);

        // New admin can set pool fee
        vm.prank(newAdmin);
        hook.setPoolFee(poolId, 500);
        (uint24 fee,,) = hook.getPendingFeeInfo(poolId);
        assertEq(fee, 500);

        // Old admin cannot
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, admin));
        hook.setPoolFee(poolId, 100);
    }

    // ──────────────────────────────────────────────
    // IFeeStrategy Integration
    // ──────────────────────────────────────────────

    function test_SetPoolStrategy() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        FixedFeeStrategy strategy = new FixedFeeStrategy(500);

        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(strategy)));
        assertEq(address(hook.poolStrategy(poolId)), address(strategy));
    }

    function test_SetPoolStrategy_EmitsEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        FixedFeeStrategy strategy = new FixedFeeStrategy(500);

        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit PayAgentHook.PoolStrategyUpdated(poolId, address(strategy));
        hook.setPoolStrategy(poolId, IFeeStrategy(address(strategy)));
    }

    function test_SetPoolStrategy_OnlyAdmin() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address nonAdmin = address(0xDEAD);

        _initializePool(key);

        FixedFeeStrategy strategy = new FixedFeeStrategy(500);

        vm.prank(nonAdmin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, nonAdmin));
        hook.setPoolStrategy(poolId, IFeeStrategy(address(strategy)));
    }

    function test_SetPoolStrategy_RemoveBySettingZero() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        FixedFeeStrategy strategy = new FixedFeeStrategy(500);

        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(strategy)));
        assertEq(address(hook.poolStrategy(poolId)), address(strategy));

        // Remove strategy
        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(0)));
        assertEq(address(hook.poolStrategy(poolId)), address(0));
    }

    // ──────────────────────────────────────────────
    // FixedFeeStrategy
    // ──────────────────────────────────────────────

    function test_FixedFeeStrategy_ReturnsFee() public {
        FixedFeeStrategy strategy = new FixedFeeStrategy(250);
        assertEq(strategy.fee(), 250);

        PoolKey memory key = _createTestPoolKey();
        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = strategy.getFee(key.toId(), key, params);
        assertEq(fee, 250);
    }

    // ──────────────────────────────────────────────
    // Fee Resolution Chain
    // ──────────────────────────────────────────────

    function test_FeeResolution_DefaultFee() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        // No strategy, no override → DEFAULT_FEE
        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = hook.getEffectiveFee(poolId, key, params);
        assertEq(fee, 3000, "Should return DEFAULT_FEE");
    }

    function test_FeeResolution_ManualOverride() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        // Set manual override
        vm.prank(admin);
        hook.setPoolFee(poolId, 100);
        vm.roll(block.number + hook.TIMELOCK_BLOCKS());
        hook.finalizePoolFee(poolId);

        // No strategy, override set → override
        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = hook.getEffectiveFee(poolId, key, params);
        assertEq(fee, 100, "Should return manual override");
    }

    function test_FeeResolution_StrategyOverridesManual() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        // Set manual override
        vm.prank(admin);
        hook.setPoolFee(poolId, 100);
        vm.roll(block.number + hook.TIMELOCK_BLOCKS());
        hook.finalizePoolFee(poolId);

        // Set strategy (should take priority)
        FixedFeeStrategy strategy = new FixedFeeStrategy(500);
        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(strategy)));

        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = hook.getEffectiveFee(poolId, key, params);
        assertEq(fee, 500, "Strategy should take priority over manual override");
    }

    function test_FeeResolution_MaliciousStrategyCapped() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        // Deploy malicious strategy
        MaliciousFeeStrategy malicious = new MaliciousFeeStrategy();
        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(malicious)));

        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = hook.getEffectiveFee(poolId, key, params);
        assertEq(fee, hook.MAX_FEE(), "Malicious strategy should be capped at MAX_FEE");
    }

    function test_FeeResolution_RevertingStrategyFallsThrough() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        // Set a manual override first
        vm.prank(admin);
        hook.setPoolFee(poolId, 100);
        vm.roll(block.number + hook.TIMELOCK_BLOCKS());
        hook.finalizePoolFee(poolId);

        // Set reverting strategy — should NOT brick the pool
        RevertingFeeStrategy reverting = new RevertingFeeStrategy();
        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(reverting)));

        // Fee should fall through to manual override
        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = hook.getEffectiveFee(poolId, key, params);
        assertEq(fee, 100, "Reverting strategy should fall through to manual override");
    }

    function test_FeeResolution_RevertingStrategyFallsToDefault() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        // Set reverting strategy with no manual override
        RevertingFeeStrategy reverting = new RevertingFeeStrategy();
        vm.prank(admin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(reverting)));

        // Fee should fall through to DEFAULT_FEE
        SwapParams memory params = SwapParams({ zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: 0 });
        uint24 fee = hook.getEffectiveFee(poolId, key, params);
        assertEq(fee, 3000, "Reverting strategy should fall through to DEFAULT_FEE");
    }

    // ──────────────────────────────────────────────
    // Timelock Fee: setPoolFee + finalizePoolFee
    // ──────────────────────────────────────────────

    function test_SetPoolFee_QueuesChange() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        hook.setPoolFee(poolId, 100);

        // Fee should NOT be applied yet
        assertEq(hook.poolFeeOverride(poolId), 0, "Fee override should not be set immediately");

        // Pending fee should be queued
        (uint24 fee, uint256 readyBlock, bool isReady) = hook.getPendingFeeInfo(poolId);
        assertEq(fee, 100, "Pending fee should be 100");
        assertEq(readyBlock, block.number + hook.TIMELOCK_BLOCKS(), "Ready block should be current + TIMELOCK_BLOCKS");
        assertFalse(isReady, "Should not be ready yet");
    }

    function test_FinalizePoolFee_AfterTimelock() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        hook.setPoolFee(poolId, 100);

        vm.roll(block.number + hook.TIMELOCK_BLOCKS());

        hook.finalizePoolFee(poolId);
        assertEq(hook.poolFeeOverride(poolId), 100, "Fee should be applied after timelock");
    }

    function test_FinalizePoolFee_RevertsBeforeTimelock() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        hook.setPoolFee(poolId, 100);

        vm.roll(block.number + hook.TIMELOCK_BLOCKS() / 2);

        vm.expectRevert();
        hook.finalizePoolFee(poolId);
    }

    function test_FinalizePoolFee_ClearsPending() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        hook.setPoolFee(poolId, 100);
        vm.roll(block.number + hook.TIMELOCK_BLOCKS());
        hook.finalizePoolFee(poolId);

        (uint24 fee, uint256 readyBlock, bool isReady) = hook.getPendingFeeInfo(poolId);
        assertEq(fee, 0, "Pending fee should be cleared");
        assertEq(readyBlock, 0, "Ready block should be cleared");
        assertFalse(isReady, "Should not be ready");
    }

    function test_FinalizePoolFee_EmitsEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        hook.setPoolFee(poolId, 500);
        vm.roll(block.number + hook.TIMELOCK_BLOCKS());

        vm.expectEmit(true, false, false, true);
        emit PayAgentHook.PoolFeeUpdated(poolId, 500);
        hook.finalizePoolFee(poolId);
    }

    function test_SetPoolFee_EmitsQueuedEvent() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        uint256 timelockBlocks = hook.TIMELOCK_BLOCKS();

        _initializePool(key);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit PayAgentHook.PoolFeeQueued(poolId, 500, block.number + timelockBlocks);
        hook.setPoolFee(poolId, 500);
    }

    function test_SetPoolFee_OnlyAdmin() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        address nonAdmin = address(0xDEAD);
        vm.prank(nonAdmin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, nonAdmin));
        hook.setPoolFee(poolId, 100);
    }

    function test_SetPoolFee_RevertsOnFeeTooHigh() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.FeeTooHigh.selector, uint24(10_001)));
        hook.setPoolFee(poolId, 10_001);
    }

    function test_SetPoolFee_MaxFeeAllowed() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        _initializePool(key);

        vm.prank(admin);
        hook.setPoolFee(poolId, 10_000);

        (uint24 fee,,) = hook.getPendingFeeInfo(poolId);
        assertEq(fee, 10_000, "Max fee should be accepted");
    }

    function test_SetPoolFee_DifferentPools() public {
        PoolKey memory stableKey = _createTestPoolKey();
        PoolId stablePoolId = stableKey.toId();

        PoolKey memory volatileKey = PoolKey({
            currency0: Currency.wrap(address(0x3)),
            currency1: Currency.wrap(address(0x4)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(HOOK_ADDRESS)
        });
        PoolId volatilePoolId = volatileKey.toId();

        // Initialize both pools
        _initializePool(stableKey);
        address volatileAdmin = address(0xAAAA);
        vm.prank(poolManager);
        hook.afterInitialize(volatileAdmin, volatileKey, 79228162514264337593543950336, 0);

        // Queue different fees for different pools
        vm.prank(admin);
        hook.setPoolFee(stablePoolId, 100);

        vm.prank(volatileAdmin);
        hook.setPoolFee(volatilePoolId, 10000);

        // Finalize both
        vm.roll(block.number + hook.TIMELOCK_BLOCKS());
        hook.finalizePoolFee(stablePoolId);
        hook.finalizePoolFee(volatilePoolId);

        assertEq(hook.poolFeeOverride(stablePoolId), 100, "Stable pool fee should be 100");
        assertEq(hook.poolFeeOverride(volatilePoolId), 10000, "Volatile pool fee should be 10000");
    }

    // ──────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────

    function test_Constants() public view {
        assertEq(hook.MAX_FEE(), 10_000, "MAX_FEE should be 10_000 (1%)");
        assertEq(hook.DEFAULT_FEE(), 3000, "DEFAULT_FEE should be 3000 (0.30%)");
        assertEq(hook.TIMELOCK_BLOCKS(), 150, "TIMELOCK_BLOCKS should be 150");
    }

    // ──────────────────────────────────────────────
    // Initial State
    // ──────────────────────────────────────────────

    function test_InitialSwapCountIsZero() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();

        assertEq(hook.swapCount(poolId), 0, "Initial swap count should be 0");
        assertEq(hook.totalVolume(poolId), 0, "Initial total volume should be 0");
    }

    function test_InitialPoolFeeOverrideIsZero() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        assertEq(hook.poolFeeOverride(poolId), 0, "Initial pool fee override should be 0 (use default)");
    }

    function test_InitialPoolAdminIsZero() public view {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        assertEq(hook.poolAdmin(poolId), address(0), "Initial pool admin should be zero");
    }

    // ──────────────────────────────────────────────
    // Hook Address Flags
    // ──────────────────────────────────────────────

    function test_HookAddressFlagsMatch() public pure {
        uint160 addr = uint160(HOOK_ADDRESS);

        assertTrue(addr & Hooks.AFTER_INITIALIZE_FLAG != 0, "AFTER_INITIALIZE_FLAG set");
        assertTrue(addr & Hooks.BEFORE_SWAP_FLAG != 0, "BEFORE_SWAP_FLAG set");
        assertTrue(addr & Hooks.AFTER_SWAP_FLAG != 0, "AFTER_SWAP_FLAG set");

        assertFalse(addr & Hooks.BEFORE_INITIALIZE_FLAG != 0, "BEFORE_INITIALIZE_FLAG not set");
        assertFalse(addr & Hooks.BEFORE_ADD_LIQUIDITY_FLAG != 0, "BEFORE_ADD_LIQUIDITY_FLAG not set");
        assertFalse(addr & Hooks.AFTER_ADD_LIQUIDITY_FLAG != 0, "AFTER_ADD_LIQUIDITY_FLAG not set");
        assertFalse(addr & Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG != 0, "BEFORE_REMOVE_LIQUIDITY_FLAG not set");
        assertFalse(addr & Hooks.AFTER_REMOVE_LIQUIDITY_FLAG != 0, "AFTER_REMOVE_LIQUIDITY_FLAG not set");
        assertFalse(addr & Hooks.BEFORE_DONATE_FLAG != 0, "BEFORE_DONATE_FLAG not set");
        assertFalse(addr & Hooks.AFTER_DONATE_FLAG != 0, "AFTER_DONATE_FLAG not set");
        assertFalse(addr & Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG != 0, "BEFORE_SWAP_RETURNS_DELTA_FLAG not set");
        assertFalse(addr & Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG != 0, "AFTER_SWAP_RETURNS_DELTA_FLAG not set");
    }

    // ──────────────────────────────────────────────
    // Integration: New Admin + Fee + Strategy
    // ──────────────────────────────────────────────

    function test_NewAdminCanSetStrategy() public {
        PoolKey memory key = _createTestPoolKey();
        PoolId poolId = key.toId();
        address newAdmin = address(0xFACE);

        _initializePool(key);

        // Transfer admin via 2-step
        vm.prank(admin);
        hook.transferPoolAdmin(poolId, newAdmin);
        vm.prank(newAdmin);
        hook.acceptPoolAdmin(poolId);

        // New admin can set strategy
        FixedFeeStrategy strategy = new FixedFeeStrategy(200);
        vm.prank(newAdmin);
        hook.setPoolStrategy(poolId, IFeeStrategy(address(strategy)));
        assertEq(address(hook.poolStrategy(poolId)), address(strategy));

        // Old admin cannot
        FixedFeeStrategy otherStrategy = new FixedFeeStrategy(300);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, admin));
        hook.setPoolStrategy(poolId, IFeeStrategy(address(otherStrategy)));
    }

    function test_IndependentPoolAdmins() public {
        // Two different pools can have different admins
        PoolKey memory key1 = _createTestPoolKey();
        PoolId poolId1 = key1.toId();

        PoolKey memory key2 = PoolKey({
            currency0: Currency.wrap(address(0x3)),
            currency1: Currency.wrap(address(0x4)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(HOOK_ADDRESS)
        });
        PoolId poolId2 = key2.toId();

        address admin2 = address(0xAAAA);

        _initializePool(key1);
        vm.prank(poolManager);
        hook.afterInitialize(admin2, key2, 79228162514264337593543950336, 0);

        assertEq(hook.poolAdmin(poolId1), admin, "Pool 1 admin should be admin");
        assertEq(hook.poolAdmin(poolId2), admin2, "Pool 2 admin should be admin2");

        // admin1 cannot set fee on pool2
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, admin));
        hook.setPoolFee(poolId2, 100);

        // admin2 cannot set fee on pool1
        vm.prank(admin2);
        vm.expectRevert(abi.encodeWithSelector(PayAgentHook.Unauthorized.selector, admin2));
        hook.setPoolFee(poolId1, 100);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _createTestPoolKey() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(HOOK_ADDRESS)
        });
    }

    /// @dev Simulate PoolManager calling afterInitialize to register admin
    function _initializePool(PoolKey memory key) internal {
        vm.prank(poolManager);
        hook.afterInitialize(admin, key, 79228162514264337593543950336, 0);
    }
}
