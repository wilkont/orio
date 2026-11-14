// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {ORIORecoverableGasAccount} from "./ORIORecoverableGasAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
/// @notice Guardian set, threshold and delay are bound to each deterministic address.
contract ORIORecoverableGasAccountFactory {
    IEntryPoint public immutable entryPoint;
    address public immutable paymaster;
    constructor(IEntryPoint entry,address approvedPaymaster){
        require((block.chainid==84532||block.chainid==31337)&&address(entry).code.length>0&&approvedPaymaster.code.length>0,"Qualification configuration only");
        entryPoint=entry;paymaster=approvedPaymaster;
    }
    function createAccount(address owner,address[] calldata guardians,uint256 threshold,uint48 delay,bytes32 salt)
        external returns(ORIORecoverableGasAccount account){
        address predicted=getAddress(owner,guardians,threshold,delay,salt);
        if(predicted.code.length>0)return ORIORecoverableGasAccount(payable(predicted));
        return new ORIORecoverableGasAccount{salt:salt}(entryPoint,paymaster,owner,guardians,threshold,delay);
    }
    function getAddress(address owner,address[] calldata guardians,uint256 threshold,uint48 delay,bytes32 salt) public view returns(address){
        bytes32 codeHash=keccak256(abi.encodePacked(type(ORIORecoverableGasAccount).creationCode,abi.encode(entryPoint,paymaster,owner,guardians,threshold,delay)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff),address(this),salt,codeHash)))));
    }
}
