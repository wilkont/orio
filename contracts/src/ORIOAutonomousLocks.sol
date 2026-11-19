// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {ORIOCurrency} from "./ORIOCurrency.sol";
/// @notice Immutable controller delegate; no owner or configurable authority.
contract ORIOAutonomousLocks {
    address public immutable controller;
    ORIOCurrency public immutable currency;
    constructor(ORIOCurrency token) { controller = msg.sender; currency = token; }
    function lock(address owner, uint256 atoms) external {
        require(msg.sender == controller, "Only immutable controller"); currency.lock(owner,atoms);
    }
    function unlock(address owner, uint256 atoms) external {
        require(msg.sender == controller, "Only immutable controller"); currency.unlock(owner,atoms);
    }
}
