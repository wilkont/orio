// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice The immutable controller is the sole issuance/burn authority. Transfers levy no fee.
contract ORIOCurrency is ERC20 {
    address public immutable controller;
    mapping(address => uint256) public locked;
    address public settlementLocker;
    function setSettlementLocker(address locker) external {
        require(msg.sender == controller && settlementLocker == address(0) && locker.code.length > 0, "Invalid locker");
        settlementLocker = locker;
    }
    constructor() ERC20("ORIO Stable Progressive Currency", "ORIO") { controller = msg.sender; }
    function mint(address account, uint256 atoms) external {
        require(msg.sender == controller, "Only monetary controller"); _mint(account, atoms);
    }
    function burn(address account, uint256 atoms) external {
        require(msg.sender == controller, "Only monetary controller"); _burn(account, atoms);
    }
    function lock(address account, uint256 atoms) external {
        require(msg.sender == settlementLocker && atoms <= balanceOf(account) - locked[account], "Invalid settlement lock");
        locked[account] += atoms;
    }
    function unlock(address account, uint256 atoms) external {
        require(msg.sender == settlementLocker, "Only settlement locker"); locked[account] -= atoms;
    }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) require(value <= balanceOf(from) - locked[from], "Settlement balance locked");
        super._update(from, to, value);
    }
}
