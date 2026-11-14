// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {Exec} from "@account-abstraction/contracts/utils/Exec.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Separate qualification candidate: delayed threshold recovery, no privileged asset transfer.
/// @dev Guardian independence, passkey enrollment and relayer gas collection are operational qualification inputs.
contract ORIORecoverableGasAccount is BaseAccount, IERC1271, EIP712, ReentrancyGuard {
    struct Approval { address guardian; bytes signature; }
    struct Recovery { address nextOwner; uint48 readyAt; bytes32 authorization; }
    bytes32 private constant AUTHORIZATION = keccak256("AccountAuthorization(bytes32 digest,uint256 ownerRevision)");
    bytes32 private constant RECOVERY = keccak256("Recover(address nextOwner,uint256 ownerRevision,uint256 recoveryNonce,uint48 validUntil)");
    bytes32 private constant CANCELLATION = keccak256("CancelRecovery(bytes32 recoveryAuthorization,uint256 ownerRevision,uint48 validUntil)");
    IEntryPoint private immutable point;
    address public immutable paymaster;
    address public owner;
    uint256 public ownerRevision;
    uint256 public recoveryNonce;
    uint48 public immutable recoveryDelay;
    uint256 public immutable threshold;
    mapping(address => bool) public guardians;
    Recovery public pendingRecovery;
    error Unauthorized();
    error InvalidRecovery();
    error InvalidConfiguration();
    event RecoveryProposed(bytes32 indexed authorization, address indexed nextOwner, uint48 readyAt);
    event RecoveryCancelled(bytes32 indexed authorization);
    event OwnerRecovered(address indexed previousOwner, address indexed currentOwner, uint256 revision);

    constructor(IEntryPoint entry, address approvedPaymaster, address initialOwner, address[] memory recoveryGuardians,
        uint256 requiredApprovals, uint48 delay) EIP712("ORIO Recoverable Account", "1")
    {
        require((block.chainid == 84532 || block.chainid == 31337) && address(entry).code.length > 0
            && approvedPaymaster.code.length > 0 && initialOwner != address(0) && initialOwner != address(this)
            && recoveryGuardians.length >= 2 && recoveryGuardians.length <= 5 && requiredApprovals >= 2
            && requiredApprovals <= recoveryGuardians.length && delay >= 2 days && delay <= 30 days, InvalidConfiguration());
        for(uint256 i; i<recoveryGuardians.length; i++){
            address guardian = recoveryGuardians[i];
            require(guardian != address(0) && guardian != initialOwner && guardian != address(this) && !guardians[guardian], InvalidConfiguration());
            guardians[guardian] = true;
        }
        point=entry;paymaster=approvedPaymaster;owner=initialOwner;threshold=requiredApprovals;recoveryDelay=delay;
    }
    receive() external payable {}
    function entryPoint() public view override returns(IEntryPoint){return point;}
    function authorizationHash(bytes32 digest) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION,digest,ownerRevision)));
    }
    function isValidSignature(bytes32 digest,bytes memory signature) public view override returns(bytes4){
        return pendingRecovery.nextOwner == address(0) && SignatureChecker.isValidSignatureNow(owner,authorizationHash(digest),signature)
            ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
    function recoveryHash(address nextOwner,uint48 validUntil) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(RECOVERY,nextOwner,ownerRevision,recoveryNonce,validUntil)));
    }
    function proposeRecovery(address nextOwner,uint48 validUntil,Approval[] calldata approvals) external nonReentrant {
        require(pendingRecovery.nextOwner == address(0) && nextOwner != address(0) && nextOwner != owner && nextOwner != address(this)
            && !guardians[nextOwner] && validUntil >= block.timestamp && validUntil <= block.timestamp + 1 days
            && approvals.length >= threshold && approvals.length <= 5, InvalidRecovery());
        bytes32 digest=recoveryHash(nextOwner,validUntil);address previous;
        for(uint256 i;i<approvals.length;i++){
            Approval calldata approval=approvals[i];
            require(approval.guardian > previous && guardians[approval.guardian]
                && SignatureChecker.isValidSignatureNow(approval.guardian,digest,approval.signature), Unauthorized());
            previous=approval.guardian;
        }
        recoveryNonce++;
        pendingRecovery=Recovery(nextOwner,uint48(block.timestamp)+recoveryDelay,digest);
        emit RecoveryProposed(digest,nextOwner,pendingRecovery.readyAt);
    }
    function cancellationHash(uint48 validUntil) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(CANCELLATION,pendingRecovery.authorization,ownerRevision,validUntil)));
    }
    /// @dev A separately gas-authorized relayer may submit this while account execution is frozen.
    function cancelRecovery(uint48 validUntil,bytes calldata ownerSignature) external nonReentrant {
        require(pendingRecovery.nextOwner != address(0) && validUntil >= block.timestamp && validUntil <= block.timestamp+1 days
            && SignatureChecker.isValidSignatureNow(owner,cancellationHash(validUntil),ownerSignature), Unauthorized());
        bytes32 digest=pendingRecovery.authorization;delete pendingRecovery;emit RecoveryCancelled(digest);
    }
    function finalizeRecovery() external nonReentrant {
        Recovery memory recovery=pendingRecovery;
        require(recovery.nextOwner != address(0) && block.timestamp >= recovery.readyAt, InvalidRecovery());
        address previous=owner;owner=recovery.nextOwner;ownerRevision++;delete pendingRecovery;
        emit OwnerRecovered(previous,owner,ownerRevision);
    }
    function _requireForExecute() internal view override {
        _requireFromEntryPoint();require(pendingRecovery.nextOwner == address(0), InvalidRecovery());
    }
    function executeBatch(Call[] calldata calls) external override {
        _requireForExecute();
        for(uint256 i;i<calls.length;i++){
            _requireForExecute();
            if(!Exec.call(calls[i].target,calls[i].value,calls[i].data,gasleft())){
                if(calls.length==1)Exec.revertWithReturnData();
                revert ExecuteError(i,Exec.getReturnData(0));
            }
        }
    }
    function _validateSignature(PackedUserOperation calldata operation,bytes32 userOpHash) internal view override returns(uint256){
        if(operation.paymasterAndData.length < 52 || address(bytes20(operation.paymasterAndData[:20])) != paymaster) return 1;
        return isValidSignature(userOpHash,operation.signature) == IERC1271.isValidSignature.selector ? 0 : 1;
    }
    function _payPrefund(uint256 missingAccountFunds) internal pure override {require(missingAccountFunds==0,Unauthorized());}
}
