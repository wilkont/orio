// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ORIOGovernanceTimelock} from "./ORIOGovernanceTimelock.sol";

/// @notice Master designation and evidence registry. Reserve execution is a separate integration.
contract MasterAssetRegistry {
    enum State { CANDIDATE, APPROVED, ACTIVE_MASTER, MIGRATING, RETIRED, AUTHORIZED_SECONDARY, DEPOSIT_PAUSED }
    struct Asset {
        address token;
        uint8 decimals;
        State state;
        bytes32 policyDigest;
    }

    ORIOGovernanceTimelock public immutable governance;
    mapping(bytes32 => Asset) public assets;
    bytes32 public currentMaster;
    bytes32 public pendingMaster;
    uint256 public epoch;
    uint256 public revision;

    error Unauthorized();
    error InvalidAsset();
    error InvalidEvidence();
    error InvalidTransition();
    error StaleEpoch();
    error StaleRevision();

    event ControlRevisionAdvanced(uint256 epoch, uint256 revision);
    event AssetRegistered(bytes32 indexed assetId, address indexed token, uint8 decimals, bytes32 policyDigest);
    event AssetStateChanged(bytes32 indexed assetId, State state, bytes32 evidenceDigest);
    event MasterElected(bytes32 indexed previous, bytes32 indexed current, uint256 epoch, bytes32 evidenceDigest);
    event MigrationProposed(bytes32 indexed previous, bytes32 indexed replacement, uint256 epoch, bytes32 planDigest);
    event MigrationAborted(bytes32 indexed previous, bytes32 indexed replacement, uint256 epoch, bytes32 evidenceDigest);

    constructor(ORIOGovernanceTimelock authority) {
        if (address(authority).code.length == 0 || authority.minimumDelayFloor() == 0) revert Unauthorized();
        governance = authority;
    }

    modifier onlyGovernance() {
        if (msg.sender != address(governance)) revert Unauthorized();
        _;
    }

    function assetId(address token) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, token));
    }

    function registerCandidate(address token, uint8 decimalPrecision, bytes32 policyDigest) external onlyGovernance {
        requireEvidence(policyDigest);
        bytes32 id = assetId(token);
        if (token.code.length == 0 || assets[id].token != address(0) || decimalPrecision > 77 ||
            IERC20Metadata(token).decimals() != decimalPrecision) revert InvalidAsset();
        assets[id] = Asset(token, decimalPrecision, State.CANDIDATE, policyDigest);
        emit AssetRegistered(id, token, decimalPrecision, policyDigest);
    }

    function approveAsset(bytes32 id, bytes32 evidenceDigest) external onlyGovernance {
        requireEvidence(evidenceDigest);
        if (assets[id].token == address(0) || assets[id].state != State.CANDIDATE) revert InvalidTransition();
        assets[id].state = State.APPROVED;
        emit AssetStateChanged(id, State.APPROVED, evidenceDigest);
    }

    function authorizeSecondary(bytes32 id, bytes32 evidenceDigest) external onlyGovernance {
        requireEvidence(evidenceDigest);
        if (assets[id].token == address(0) || assets[id].state != State.APPROVED) revert InvalidTransition();
        assets[id].state = State.AUTHORIZED_SECONDARY;
        emit AssetStateChanged(id, State.AUTHORIZED_SECONDARY, evidenceDigest);
    }

    function electInitial(bytes32 id, bytes32 evidenceDigest) external onlyGovernance {
        requireEvidence(evidenceDigest);
        if (currentMaster != bytes32(0) || epoch != 0 || assets[id].token == address(0) ||
            assets[id].state != State.APPROVED) revert InvalidTransition();
        currentMaster = id;
        epoch = 1;
        assets[id].state = State.ACTIVE_MASTER;
        advanceRevision();
        emit MasterElected(bytes32(0), id, epoch, evidenceDigest);
    }

    function pauseMaster(uint256 expectedEpoch, uint256 expectedRevision, bytes32 evidenceDigest) external onlyGovernance {
        requireEpoch(expectedEpoch);
        if (revision != expectedRevision) revert StaleRevision();
        requireEvidence(evidenceDigest);
        if (currentMaster == bytes32(0) || pendingMaster != bytes32(0) ||
            assets[currentMaster].state != State.ACTIVE_MASTER) revert InvalidTransition();
        assets[currentMaster].state = State.DEPOSIT_PAUSED;
        advanceRevision();
        emit AssetStateChanged(currentMaster, State.DEPOSIT_PAUSED, evidenceDigest);
    }

    function resumeMaster(uint256 expectedEpoch, uint256 expectedRevision, bytes32 evidenceDigest) external onlyGovernance {
        requireEpoch(expectedEpoch);
        if (revision != expectedRevision) revert StaleRevision();
        requireEvidence(evidenceDigest);
        if (currentMaster == bytes32(0) || assets[currentMaster].state != State.DEPOSIT_PAUSED)
            revert InvalidTransition();
        assets[currentMaster].state = State.ACTIVE_MASTER;
        advanceRevision();
        emit AssetStateChanged(currentMaster, State.ACTIVE_MASTER, evidenceDigest);
    }

    function beginMigration(uint256 expectedEpoch, uint256 expectedRevision, bytes32 replacement, bytes32 planDigest) external onlyGovernance {
        requireEpoch(expectedEpoch);
        if (revision != expectedRevision) revert StaleRevision();
        requireEvidence(planDigest);
        State currentState = assets[currentMaster].state;
        State replacementState = assets[replacement].state;
        if (currentMaster == bytes32(0) || pendingMaster != bytes32(0) || replacement == currentMaster ||
            (currentState != State.ACTIVE_MASTER && currentState != State.DEPOSIT_PAUSED) ||
            assets[replacement].token == address(0) ||
            (replacementState != State.APPROVED && replacementState != State.AUTHORIZED_SECONDARY))
            revert InvalidTransition();
        pendingMaster = replacement;
        assets[currentMaster].state = State.MIGRATING;
        advanceRevision();
        emit MigrationProposed(currentMaster, replacement, epoch, planDigest);
    }

    /// @dev Evidence must independently establish settled custody, valuation and liabilities.
    function completeMigration(uint256 expectedEpoch, uint256 expectedRevision, bytes32 replacement, bytes32 settlementDigest) external onlyGovernance {
        requireEpoch(expectedEpoch);
        if (revision != expectedRevision) revert StaleRevision();
        requireEvidence(settlementDigest);
        if (pendingMaster == bytes32(0) || replacement != pendingMaster ||
            assets[currentMaster].state != State.MIGRATING) revert InvalidTransition();
        bytes32 previous = currentMaster;
        assets[previous].state = State.RETIRED;
        assets[replacement].state = State.ACTIVE_MASTER;
        currentMaster = replacement;
        pendingMaster = bytes32(0);
        epoch += 1;
        advanceRevision();
        emit MasterElected(previous, replacement, epoch, settlementDigest);
    }

    function abortMigration(uint256 expectedEpoch, uint256 expectedRevision, bytes32 evidenceDigest) external onlyGovernance {
        requireEpoch(expectedEpoch);
        if (revision != expectedRevision) revert StaleRevision();
        requireEvidence(evidenceDigest);
        if (pendingMaster == bytes32(0) || assets[currentMaster].state != State.MIGRATING)
            revert InvalidTransition();
        bytes32 abandoned = pendingMaster;
        pendingMaster = bytes32(0);
        assets[currentMaster].state = State.DEPOSIT_PAUSED;
        advanceRevision();
        emit MigrationAborted(currentMaster, abandoned, epoch, evidenceDigest);
    }

    function issuanceAllowed(uint256 expectedEpoch) external view returns (bool) {
        return currentMaster != bytes32(0) && epoch == expectedEpoch &&
            assets[currentMaster].state == State.ACTIVE_MASTER;
    }

    function advanceRevision() private {
        revision += 1;
        emit ControlRevisionAdvanced(epoch, revision);
    }

    function requireEpoch(uint256 expectedEpoch) private view {
        if (epoch != expectedEpoch) revert StaleEpoch();
    }

    function requireEvidence(bytes32 digest) private pure {
        if (digest == bytes32(0)) revert InvalidEvidence();
    }
}
