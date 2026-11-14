// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @dev Offline target, not a financial contract.
contract GasExecutionTarget {
    uint256 public value;
    function record(uint256 next) external { value = next; }
    function fail() external pure { revert("Synthetic operation failure"); }
}
