// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ORIOCurrency} from "./ORIOCurrency.sol";
interface RedemptionContext {
    struct Redemption {
        bytes32 requestId; uint256 sequence; address owner; address recipient; uint256 atoms;
        uint256 minimumPayout; uint256 nonce; uint48 deadline; bytes signature;
    }
    function redemptionHash(Redemption calldata request) external view returns (bytes32);
    function sealedEpoch() external view returns (bytes32, bytes32, uint256, uint256, uint256, uint48);
}
/// @notice Authorized token locks. Anyone may release an unconsumed lock after its epoch closes.
contract ORIORedemptionLocks is ReentrancyGuard {
    struct Lock { bytes32 epochId; bytes32 authorization; address owner; uint256 atoms; }
    address public immutable controller;
    ORIOCurrency public immutable currency;
    mapping(bytes32 => Lock) public locks;
    mapping(bytes32 => bool) public usedRequests;
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    error InvalidLock();
    event RedemptionLocked(bytes32 indexed requestId, bytes32 indexed epochId, address indexed owner, uint256 atoms);
    event RedemptionReleased(bytes32 indexed requestId);
    constructor(ORIOCurrency token) { controller = msg.sender; currency = token; }
    function lockRedemption(RedemptionContext.Redemption calldata r) external nonReentrant {
        (bytes32 id,,,,,uint48 deadline) = RedemptionContext(controller).sealedEpoch();
        bytes32 authorization = RedemptionContext(controller).redemptionHash(r);
        require(id != bytes32(0) && block.timestamp <= r.deadline && r.deadline <= deadline && r.owner != address(0)
            && r.recipient != address(0) && r.atoms > 0 && r.requestId != bytes32(0) && !usedRequests[r.requestId]
            && !usedNonces[r.owner][r.nonce] && SignatureChecker.isValidSignatureNow(r.owner, authorization, r.signature), InvalidLock());
        usedRequests[r.requestId] = true; usedNonces[r.owner][r.nonce] = true;
        locks[r.requestId] = Lock(id, authorization, r.owner, r.atoms); currency.lock(r.owner, r.atoms);
        emit RedemptionLocked(r.requestId, id, r.owner, r.atoms);
    }
    function consume(bytes32 requestId, bytes32 authorization) external nonReentrant {
        Lock memory item = locks[requestId];
        require(msg.sender == controller && item.owner != address(0) && item.authorization == authorization, InvalidLock());
        delete locks[requestId]; currency.unlock(item.owner, item.atoms);
    }
    function releaseRedemption(bytes32 requestId) external nonReentrant {
        Lock memory item = locks[requestId]; (bytes32 current,,,,,) = RedemptionContext(controller).sealedEpoch();
        require(item.owner != address(0) && item.epochId != current, InvalidLock());
        delete locks[requestId]; currency.unlock(item.owner, item.atoms); emit RedemptionReleased(requestId);
    }
}
