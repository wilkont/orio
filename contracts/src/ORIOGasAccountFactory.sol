// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ORIOGasAccount} from "./ORIOGasAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/// @notice Deterministic qualification factory. Anyone may fund deployment of the same owned account.
contract ORIOGasAccountFactory {
    IEntryPoint public immutable entryPoint;
    address public immutable paymaster;
    constructor(IEntryPoint point, address approvedPaymaster) {
        require(block.chainid == 84532 || block.chainid == 31337, "Qualification networks only");
        require(address(point).code.length != 0 && approvedPaymaster.code.length != 0, "Invalid factory configuration");
        entryPoint = point;
        paymaster = approvedPaymaster;
    }
    function createAccount(address owner, bytes32 salt) external returns (ORIOGasAccount account) {
        address predicted = getAddress(owner, salt);
        if (predicted.code.length != 0) return ORIOGasAccount(payable(predicted));
        return new ORIOGasAccount{salt: keccak256(abi.encode(owner, salt))}(entryPoint, paymaster, owner);
    }
    function getAddress(address owner, bytes32 salt) public view returns (address) {
        bytes32 codeHash = keccak256(abi.encodePacked(type(ORIOGasAccount).creationCode, abi.encode(entryPoint, paymaster, owner)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), keccak256(abi.encode(owner, salt)), codeHash)))));
    }
}
