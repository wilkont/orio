// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Non-upgradeable qualification account: no direct owner execution or native gas prefund.
/// @dev EOA-owner signing is an integration seam, not completed consumer passkey/recovery UX.
contract ORIOGasAccount is BaseAccount, IERC1271 {
    IEntryPoint private immutable point;
    address public immutable owner;
    address public immutable paymaster;

    constructor(IEntryPoint entry, address approvedPaymaster, address accountOwner) {
        require(block.chainid == 84532 || block.chainid == 31337, "Qualification networks only");
        require(address(entry).code.length != 0 && approvedPaymaster.code.length != 0
            && accountOwner != address(0), "Invalid account configuration");
        point = entry;
        paymaster = approvedPaymaster;
        owner = accountOwner;
    }
    receive() external payable {}
    function entryPoint() public view override returns (IEntryPoint) { return point; }

    function isValidSignature(bytes32 digest, bytes memory signature) public view override returns (bytes4) {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        return error == ECDSA.RecoverError.NoError && recovered == owner ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }

    function _validateSignature(PackedUserOperation calldata operation, bytes32 userOpHash)
        internal view override returns (uint256)
    {
        if (operation.paymasterAndData.length < 52 || address(bytes20(operation.paymasterAndData[:20])) != paymaster)
            return 1;
        return isValidSignature(userOpHash, operation.signature) == IERC1271.isValidSignature.selector ? 0 : 1;
    }
    function _payPrefund(uint256 missingAccountFunds) internal pure override {
        require(missingAccountFunds == 0, "User ETH prefunding disabled");
    }
}
