// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Synthetic assets/router for disconnected tests. Never deploy or fund these publicly.
contract MockMasterToken is ERC20 {
    uint8 private immutable precision;
    bool public rejectTransfers;
    constructor(uint8 decimalPrecision) ERC20("Synthetic reserve", "TEST") { precision = decimalPrecision; }
    function decimals() public view override returns (uint8) { return precision; }
    function mintFixture(address recipient, uint256 units) external { _mint(recipient, units); }
    function setRejectTransfers(bool rejected) external { rejectTransfers = rejected; }
    function _update(address from, address to, uint256 units) internal override {
        require(!rejectTransfers || from == address(0), "Synthetic transfer failure"); super._update(from,to,units);
    }
}
contract MockReserveSwap {
    function swap(address, address replacement, uint256, bytes calldata data) external {
        IERC20(replacement).transfer(msg.sender, abi.decode(data,(uint256)));
    }
}
