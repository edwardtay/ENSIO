// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title IFeeStrategy
/// @notice Pluggable fee calculation interface for PayAgentHook.
/// Implement this with any logic: volatility-based, time-weighted, ML-driven, DAO vote, etc.
interface IFeeStrategy {
    /// @notice Calculate the swap fee for a given pool and swap.
    /// @param poolId The pool identifier
    /// @param key The pool key
    /// @param params The swap parameters
    /// @return fee Fee in hundredths of a bip (e.g., 100 = 0.01%, 3000 = 0.30%)
    function getFee(PoolId poolId, PoolKey calldata key, SwapParams calldata params)
        external
        view
        returns (uint24 fee);
}
