// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Governance delay floor. Production proposers must be independently qualified multisigs/DAOs.
contract ORIOGovernanceTimelock is TimelockController {
    uint256 public immutable minimumDelayFloor;

    error DelayBelowFloor();

    constructor(uint256 delay, address[] memory proposers, address[] memory executors)
        TimelockController(delay, proposers, executors, address(0))
    {
        if (delay == 0 || proposers.length == 0 || executors.length == 0) revert DelayBelowFloor();
        minimumDelayFloor = delay;
    }

    function updateDelay(uint256 newDelay) public override {
        if (newDelay < minimumDelayFloor) revert DelayBelowFloor();
        super.updateDelay(newDelay);
    }
}
