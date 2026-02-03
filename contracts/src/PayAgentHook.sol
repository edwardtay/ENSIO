// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseOverrideFee} from "@openzeppelin/uniswap-hooks/fee/BaseOverrideFee.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IFeeStrategy} from "./IFeeStrategy.sol";

/// @title PayAgentHook
/// @notice A general-purpose dynamic fee framework for Uniswap v4, built on OpenZeppelin's BaseOverrideFee.
///
/// Each pool gets a per-pool admin (the address that initializes the pool) who can:
/// - Attach a pluggable IFeeStrategy contract for dynamic fee calculation
/// - Set a manual fee override (subject to timelock)
/// - Transfer admin rights via 2-step process
///
/// Fee resolution chain: IFeeStrategy → manual override → DEFAULT_FEE
///
/// Security:
/// - Max fee capped at 1% (10_000) — applies even to strategy return values
/// - Fee changes subject to timelock delay (TIMELOCK_BLOCKS)
/// - 2-step admin transfer per pool prevents accidental loss
/// - Volume tracking uses actual BalanceDelta, not amountSpecified
contract PayAgentHook is BaseOverrideFee {
    using PoolIdLibrary for PoolKey;

    // --- Custom Errors ---
    error Unauthorized(address caller);
    error FeeTooHigh(uint24 fee);
    error FeeChangeTimelocked(PoolId poolId, uint256 readyBlock);
    error PoolAlreadyRegistered(PoolId poolId);
    error NoPendingAdmin(PoolId poolId);
    error NotPendingAdmin(address caller);
    error ZeroAddress();

    // --- Events ---
    event PoolRegistered(PoolId indexed poolId, address indexed admin);
    event PoolStrategyUpdated(PoolId indexed poolId, address indexed strategy);
    event PoolAdminTransferProposed(PoolId indexed poolId, address indexed currentAdmin, address indexed proposedAdmin);
    event PoolAdminTransferred(PoolId indexed poolId, address indexed previousAdmin, address indexed newAdmin);
    event SwapProcessed(PoolId indexed poolId, uint256 amountIn, uint256 newSwapCount);
    event VolumeUpdated(PoolId indexed poolId, uint256 amountIn, uint256 newTotalVolume);
    event PoolFeeUpdated(PoolId indexed poolId, uint24 fee);
    event PoolFeeQueued(PoolId indexed poolId, uint24 fee, uint256 readyBlock);

    // Maximum fee capped at 1% (10_000 hundredths of a bip) to prevent extraction
    uint24 public constant MAX_FEE = 10_000;

    // Default fee for pools without an explicit override: 30 bps (0.30%)
    uint24 public constant DEFAULT_FEE = 3000;

    // Timelock: fee changes take effect after this many blocks (~5 minutes on Base at 2s blocks)
    uint256 public constant TIMELOCK_BLOCKS = 150;

    // Per-pool admin (set on pool initialization)
    mapping(PoolId => address) public poolAdmin;

    // 2-step admin transfer per pool
    mapping(PoolId => address) public pendingPoolAdmin;

    // Pluggable fee strategy per pool
    mapping(PoolId => IFeeStrategy) public poolStrategy;

    // Swap analytics per pool
    mapping(PoolId => uint256) public swapCount;
    mapping(PoolId => uint256) public totalVolume;

    // Per-pool fee override (in hundredths of a bip); 0 means no override
    mapping(PoolId => uint24) public poolFeeOverride;

    // Timelock: queued fee changes
    mapping(PoolId => uint24) public pendingFee;
    mapping(PoolId => uint256) public feeReadyBlock;

    constructor(IPoolManager _poolManager) BaseOverrideFee(_poolManager) {}

    modifier onlyPoolAdmin(PoolId poolId) {
        if (msg.sender != poolAdmin[poolId]) revert Unauthorized(msg.sender);
        _;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── Pool lifecycle ───

    /// @dev Called by PoolManager after a pool is initialized. Records the sender as pool admin.
    function _afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, int24 tick)
        internal
        override
        returns (bytes4)
    {
        // Call parent to validate dynamic fee
        bytes4 selector = super._afterInitialize(sender, key, sqrtPriceX96, tick);

        PoolId poolId = key.toId();
        if (poolAdmin[poolId] != address(0)) revert PoolAlreadyRegistered(poolId);

        poolAdmin[poolId] = sender;
        emit PoolRegistered(poolId, sender);

        return selector;
    }

    // ─── Admin-controlled functions ───

    /// @notice Set or update the fee strategy for a pool
    /// @param poolId The pool to configure
    /// @param strategy The IFeeStrategy contract (address(0) to remove)
    function setPoolStrategy(PoolId poolId, IFeeStrategy strategy) external onlyPoolAdmin(poolId) {
        poolStrategy[poolId] = strategy;
        emit PoolStrategyUpdated(poolId, address(strategy));
    }

    /// @notice Queue a fee change for a pool (subject to timelock)
    /// @param poolId The pool to set the fee for
    /// @param fee Fee in hundredths of a bip (e.g., 100 = 0.01%, 3000 = 0.30%, 10000 = 1.00%)
    function setPoolFee(PoolId poolId, uint24 fee) external onlyPoolAdmin(poolId) {
        if (fee > MAX_FEE) revert FeeTooHigh(fee);

        uint256 readyBlock = block.number + TIMELOCK_BLOCKS;
        pendingFee[poolId] = fee;
        feeReadyBlock[poolId] = readyBlock;

        emit PoolFeeQueued(poolId, fee, readyBlock);
    }

    /// @notice Finalize a queued fee change after the timelock has passed
    /// @param poolId The pool to finalize the fee for
    function finalizePoolFee(PoolId poolId) external {
        uint256 ready = feeReadyBlock[poolId];
        if (ready == 0 || block.number < ready) {
            revert FeeChangeTimelocked(poolId, ready);
        }

        uint24 newFee = pendingFee[poolId];
        poolFeeOverride[poolId] = newFee;

        // Clear pending state
        pendingFee[poolId] = 0;
        feeReadyBlock[poolId] = 0;

        emit PoolFeeUpdated(poolId, newFee);
    }

    /// @notice Propose a new admin for a pool (step 1 of 2-step transfer)
    function transferPoolAdmin(PoolId poolId, address newAdmin) external onlyPoolAdmin(poolId) {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingPoolAdmin[poolId] = newAdmin;
        emit PoolAdminTransferProposed(poolId, msg.sender, newAdmin);
    }

    /// @notice Accept the admin role for a pool (step 2 of 2-step transfer)
    function acceptPoolAdmin(PoolId poolId) external {
        address pending = pendingPoolAdmin[poolId];
        if (pending == address(0)) revert NoPendingAdmin(poolId);
        if (msg.sender != pending) revert NotPendingAdmin(msg.sender);

        address previousAdmin = poolAdmin[poolId];
        poolAdmin[poolId] = pending;
        pendingPoolAdmin[poolId] = address(0);

        emit PoolAdminTransferred(poolId, previousAdmin, pending);
    }

    // ─── View helpers ───

    /// @notice Get the effective fee for a pool (resolves: strategy → override → default)
    function getEffectiveFee(PoolId poolId, PoolKey calldata key, SwapParams calldata params)
        external
        view
        returns (uint24)
    {
        return _resolveFee(poolId, key, params);
    }

    /// @notice Check if a pool has a pending fee change and when it's ready
    function getPendingFeeInfo(PoolId poolId)
        external
        view
        returns (uint24 fee, uint256 readyBlock, bool isReady)
    {
        fee = pendingFee[poolId];
        readyBlock = feeReadyBlock[poolId];
        isReady = readyBlock > 0 && block.number >= readyBlock;
    }

    // ─── BaseOverrideFee: dynamic fee calculation ───

    /// @inheritdoc BaseOverrideFee
    function _getFee(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        view
        override
        returns (uint24)
    {
        PoolId poolId = key.toId();
        return _resolveFee(poolId, key, params);
    }

    /// @dev Fee resolution chain: strategy → manual override → DEFAULT_FEE
    function _resolveFee(PoolId poolId, PoolKey calldata key, SwapParams calldata params)
        internal
        view
        returns (uint24)
    {
        // 1. If pool has a strategy, try it (capped at MAX_FEE).
        //    If the strategy reverts, fall through to manual override / default
        //    so a bad strategy cannot brick the pool.
        IFeeStrategy strategy = poolStrategy[poolId];
        if (address(strategy) != address(0)) {
            try strategy.getFee{ gas: 100_000 }(poolId, key, params) returns (uint24 strategyFee) {
                return strategyFee > MAX_FEE ? MAX_FEE : strategyFee;
            } catch {}
        }

        // 2. If pool has a manual override, use it
        uint24 overrideFee = poolFeeOverride[poolId];
        if (overrideFee != 0) {
            return overrideFee;
        }

        // 3. Default
        return DEFAULT_FEE;
    }

    // ─── Hook callbacks ───

    /// @dev Called before each swap. Tracks swap count.
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        (bytes4 selector, BeforeSwapDelta delta, uint24 feeOverride) =
            super._beforeSwap(sender, key, params, hookData);

        PoolId poolId = key.toId();

        uint256 amountIn = params.amountSpecified > 0
            ? uint256(params.amountSpecified)
            : uint256(-params.amountSpecified);

        // unchecked: analytics counters are informational; overflow revert would brick swaps
        unchecked { swapCount[poolId]++; }
        emit SwapProcessed(poolId, amountIn, swapCount[poolId]);

        return (selector, delta, feeOverride);
    }

    /// @dev Called after each swap. Tracks actual volume from BalanceDelta.
    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        BalanceDelta swapDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();

        int128 amount0 = swapDelta.amount0();
        int128 amount1 = swapDelta.amount1();

        // Volume = the amount entering the pool (the positive side)
        uint256 volumeIn;
        if (amount0 > 0) {
            volumeIn = uint256(uint128(amount0));
        } else if (amount1 > 0) {
            volumeIn = uint256(uint128(amount1));
        }

        // unchecked: analytics counter is informational; overflow revert would brick swaps
        unchecked { totalVolume[poolId] += volumeIn; }
        emit VolumeUpdated(poolId, volumeIn, totalVolume[poolId]);
        return (this.afterSwap.selector, 0);
    }
}
