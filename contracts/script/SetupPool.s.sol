// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PayAgentHook} from "../src/PayAgentHook.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @title SetupPool — Initialize USDC/USDT pool, add liquidity, set 0.01% fee
/// @notice Run after deploying PayAgentHook to Base mainnet.
///
/// Usage:
///   forge script script/SetupPool.s.sol --rpc-url https://mainnet.base.org --broadcast
contract SetupPool is Script {
    using PoolIdLibrary for PoolKey;

    // Base mainnet addresses
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant POSITION_MANAGER = 0x7C5f5A4bBd8fD63184577525326123B519429bDc;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant HOOK = 0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0;

    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    // Dynamic fee flag (bit 23 set) — tells PoolManager to call hook for fee
    uint24 constant DYNAMIC_FEE_FLAG = 0x800000;
    int24 constant TICK_SPACING = 1;

    // sqrtPriceX96 for price = 1.0 (1 USDT per USDC) = sqrt(1) * 2^96
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        require(block.chainid == 8453, "Wrong chain: expected Base (8453)");

        // Build PoolKey — currency0 must be < currency1
        // USDC (0x833...) < USDT (0xfde...) ✓
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(USDT),
            fee: DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK)
        });

        PoolId poolId = key.toId();
        bytes32 poolIdBytes = PoolId.unwrap(poolId);

        console.log("------------------------------------");
        console.log("Deployer   :", deployer);
        console.log("PoolManager:", POOL_MANAGER);
        console.log("Hook       :", HOOK);
        console.log("Pool ID    :", vm.toString(poolIdBytes));
        console.log("------------------------------------");

        vm.startBroadcast(deployerPK);

        // ================================================================
        // Step 1: Initialize the pool (skip if already initialized)
        // ================================================================
        console.log("Step 1: Initializing pool...");
        // Use PositionManager.initializePool which returns type(int24).max
        // if pool already exists, instead of reverting
        int24 tick = IPositionManager(POSITION_MANAGER).initializePool(key, SQRT_PRICE_1_1);
        if (tick == type(int24).max) {
            console.log("Pool already initialized, skipping.");
        } else {
            console.log("Pool initialized at tick:", vm.toString(tick));
        }

        // ================================================================
        // Step 2: Add liquidity (if deployer has tokens)
        // ================================================================
        uint256 usdcBal = IERC20(USDC).balanceOf(deployer);
        uint256 usdtBal = IERC20(USDT).balanceOf(deployer);
        console.log("USDC balance:", usdcBal);
        console.log("USDT balance:", usdtBal);

        if (usdcBal > 0 && usdtBal > 0) {
            // Use the smaller balance for both sides (1:1 pool)
            uint256 amount = usdcBal < usdtBal ? usdcBal : usdtBal;
            console.log("Adding liquidity:", amount, "(of each token)");

            // Approve tokens to Permit2
            IERC20(USDC).approve(PERMIT2, type(uint256).max);
            IERC20(USDT).approve(PERMIT2, type(uint256).max);

            // Approve Permit2 allowance to PositionManager
            IPermit2(PERMIT2).approve(USDC, POSITION_MANAGER, type(uint160).max, type(uint48).max);
            IPermit2(PERMIT2).approve(USDT, POSITION_MANAGER, type(uint160).max, type(uint48).max);

            // Mint a position: range around tick 0 for stablecoin pair
            // tickSpacing = 1, so we can use any int24 values
            // Use -100 to +100 for a tight range around 1:1
            int24 tickLower = -100;
            int24 tickUpper = 100;

            // Encode actions: MINT_POSITION + SETTLE_PAIR
            bytes memory actions = abi.encodePacked(
                uint8(Actions.MINT_POSITION),
                uint8(Actions.SETTLE_PAIR)
            );

            // Params for MINT_POSITION:
            // (PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData)
            // For tick range [-100, 100] at tick 0, each unit of liquidity needs ~0.005 tokens.
            // So liquidity = amount / 0.005 = amount * 200
            uint256 liquidity = amount * 190; // Conservative to stay within amount limits

            bytes[] memory params = new bytes[](2);
            params[0] = abi.encode(
                key,
                tickLower,
                tickUpper,
                liquidity,
                uint128(amount),   // amount0Max (USDC)
                uint128(amount),   // amount1Max (USDT)
                deployer,          // recipient
                bytes("")          // hookData
            );
            params[1] = abi.encode(Currency.wrap(USDC), Currency.wrap(USDT));

            // Call modifyLiquidities
            bytes memory unlockData = abi.encode(actions, params);
            IPositionManager(POSITION_MANAGER).modifyLiquidities(unlockData, block.timestamp + 300);

            console.log("Liquidity added successfully!");
        } else {
            console.log("SKIPPED: No USDC/USDT to add liquidity. Fund deployer and re-run.");
        }

        // ================================================================
        // Step 3: Set pool fee to 0.01% (100 hundredths of a bip)
        // ================================================================
        console.log("Step 3: Setting pool fee to 0.01%...");
        PayAgentHook(HOOK).setPoolFee(poolId, 100);
        console.log("Pool fee set to 100 (0.01%)");

        vm.stopBroadcast();

        console.log("====================================");
        console.log("SETUP COMPLETE");
        console.log("Pool ID:", vm.toString(poolIdBytes));
        console.log("====================================");
    }
}
