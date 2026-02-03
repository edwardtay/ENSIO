// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFeeStrategy} from "../IFeeStrategy.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title FixedFeeStrategy
/// @notice Returns a constant fee for every swap. Useful for pools that want
/// a simple, predictable fee without dynamic calculation.
contract FixedFeeStrategy is IFeeStrategy {
    uint24 public immutable fee;

    constructor(uint24 _fee) {
        fee = _fee;
    }

    function getFee(PoolId, PoolKey calldata, SwapParams calldata) external view override returns (uint24) {
        return fee;
    }
}
