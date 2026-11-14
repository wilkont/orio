// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {_packValidationData} from "@account-abstraction/contracts/core/Helpers.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ORIOGovernanceTimelock} from "./ORIOGovernanceTimelock.sol";

/// @notice Testnet qualification candidate. It cannot deploy on Base mainnet.
/// @dev Fronts company ETH only after user consent and an operator's reservation attestation.
///      Does not collect tokens, determine economics, or finalize a customer gas bill.
contract ORIOTreasuryPaymaster is BasePaymaster, EIP712 {
    struct GasPermit {
        bytes32 reservationId;
        bytes32 quoteDigest;
        bytes32 paymentAsset;
        uint256 maximumPaymentUnits;
        uint256 maximumNetworkWei;
        uint48 validAfter;
        uint48 validUntil;
        uint64 revision;
    }
    bytes32 public constant GAS_PERMIT_TYPEHASH = keccak256(
        "GasPermit(bytes32 operationDigest,bytes32 reservationId,bytes32 quoteDigest,bytes32 paymentAsset,uint256 maximumPaymentUnits,uint256 maximumNetworkWei,uint48 validAfter,uint48 validUntil,uint64 revision)"
    );
    address public reservationSigner;
    bool public executionEnabled;
    uint64 public revision;
    mapping(bytes32 => bool) public usedReservations;

    event ConfigurationChanged(uint64 indexed revision, address signer, bool enabled);
    event GasReservationConsumed(bytes32 indexed reservationId, bytes32 indexed quoteDigest, bytes32 indexed userOpHash, address sender);
    // EntryPoint's final UserOperationEvent includes postOp cost. This observation does not.
    event GasExecutionObserved(bytes32 indexed reservationId, bytes32 indexed userOpHash, uint8 outcome, uint256 costBeforePostOp, uint256 userOpFeePerGas);

    constructor(IEntryPoint point, ORIOGovernanceTimelock governance)
        BasePaymaster(point) EIP712("ORIO Gas Permit", "1")
    {
        require(block.chainid == 84532 || block.chainid == 31337, "Qualification networks only");
        require(address(governance).code.length != 0 && governance.minimumDelayFloor() > 0, "Invalid governance");
        _transferOwnership(address(governance));
    }

    function configure(address signer, bool enabled, uint64 expectedRevision) external onlyOwner {
        require(revision == expectedRevision && signer != address(0), "Invalid configuration");
        reservationSigner = signer;
        executionEnabled = enabled;
        revision++;
        emit ConfigurationChanged(revision, signer, enabled);
    }

    function operationDigest(PackedUserOperation calldata operation) public view returns (bytes32) {
        require(operation.paymasterAndData.length >= PAYMASTER_DATA_OFFSET, "Missing paymaster header");
        return keccak256(abi.encode(address(entryPoint), operation.sender, operation.nonce,
            keccak256(operation.initCode), keccak256(operation.callData), operation.accountGasLimits,
            operation.preVerificationGas, operation.gasFees,
            keccak256(operation.paymasterAndData[:PAYMASTER_DATA_OFFSET])));
    }

    function permitHash(PackedUserOperation calldata operation, GasPermit memory permit) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(GAS_PERMIT_TYPEHASH, operationDigest(operation),
            permit.reservationId, permit.quoteDigest, permit.paymentAsset, permit.maximumPaymentUnits,
            permit.maximumNetworkWei, permit.validAfter, permit.validUntil, permit.revision)));
    }

    function _validatePaymasterUserOp(PackedUserOperation calldata operation, bytes32 userOpHash, uint256 maxCost)
        internal override returns (bytes memory context, uint256 validationData)
    {
        require(executionEnabled, "Gas execution paused");
        (GasPermit memory permit, bytes memory userConsent, bytes memory operatorConsent) =
            abi.decode(operation.paymasterAndData[PAYMASTER_DATA_OFFSET:], (GasPermit, bytes, bytes));
        require(permit.revision == revision && permit.reservationId != bytes32(0)
            && permit.quoteDigest != bytes32(0) && permit.paymentAsset != bytes32(0), "Invalid gas permit");
        require(!usedReservations[permit.reservationId], "Gas reservation already consumed");
        require(permit.validUntil > permit.validAfter && permit.validUntil - permit.validAfter <= 300,
            "Invalid validity window");
        require(permit.maximumPaymentUnits > 0 && permit.maximumNetworkWei > 0
            && maxCost <= permit.maximumNetworkWei, "Gas authorization cap exceeded");
        bytes32 signedDigest = permitHash(operation, permit);
        bool valid = SignatureChecker.isValidSignatureNow(reservationSigner, signedDigest, operatorConsent)
            && SignatureChecker.isValidSignatureNow(operation.sender, signedDigest, userConsent);
        if (!valid) return ("", _packValidationData(true, permit.validUntil, permit.validAfter));
        usedReservations[permit.reservationId] = true;
        emit GasReservationConsumed(permit.reservationId, permit.quoteDigest, userOpHash, operation.sender);
        return (abi.encode(permit.reservationId, userOpHash), _packValidationData(false, permit.validUntil, permit.validAfter));
    }

    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas)
        internal override
    {
        (bytes32 reservationId, bytes32 userOpHash) = abi.decode(context, (bytes32, bytes32));
        emit GasExecutionObserved(reservationId, userOpHash, uint8(mode), actualGasCost, actualUserOpFeePerGas);
    }
}
