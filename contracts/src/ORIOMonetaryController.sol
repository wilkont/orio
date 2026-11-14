// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ORIORedemptionLocks} from "./ORIORedemptionLocks.sol";
import {ORIOCurrency} from "./ORIOCurrency.sol";
import {ORIOReserveVault} from "./ORIOReserveVault.sol";
import {MasterAssetRegistry} from "./MasterAssetRegistry.sol";
import {ORIOGovernanceTimelock} from "./ORIOGovernanceTimelock.sol";

/// @notice Testnet qualification controller implementing the founder-approved monetary rules.
/// @dev USD36 reference price; exact residuals use USD54. No mint/sweep/admin price override.
contract ORIOMonetaryController is ReentrancyGuard {
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    function _hashTypedDataV4(bytes32 structHash) private view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("ORIO Monetary Controller"),
            keccak256("1"), block.chainid, address(this)));
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }
    error InvalidRedemptionEpoch();
    error MonetaryExecutionPaused();
    error ReserveImpairment();
    error OnlyGovernance();
    error OnlySettlementOperator();
    error QualificationNetworksOnly();
    error InvalidMonetaryConfiguration();
    error InvalidConfiguration();
    error InvalidAdapterConfiguration();
    error RedemptionEpochIsSealed();
    error InvalidOrStalePurchase();
    error IssuanceRestricted();
    error PurchaseBelowMonetaryMinimum();
    error MintAmountBelowAuthorization();
    error EpochHasNotExpired();
    error InvalidSealedSettlement();
    error InvalidRedemptionAuthorization();
    error RedemptionExceedsSupply();
    error RedemptionBelowPayoutMinimum();
    error PayoutBelowAuthorization();
    error InvalidZeroCheckpoint();
    error ReopeningRestricted();
    error InvalidReserveMigration();
    error RegistryIsNotMigrating();
    error OriginalGenesisCannotAcquireUnassignedBacking();
    error InvalidReserveValuation();
    error UnsupportedMasterPrecision();
    error HolderAppreciationBelowPrecision();
    uint256 public constant USD36 = 1e36;
    bytes32 public constant POLICY_ID = keccak256("orio-final-monetary-2026-11-13-v1");
    bytes32 private constant VALUATION_TYPEHASH = keccak256("Valuation(address asset,uint256 usd36PerToken,uint256 registryEpoch,uint256 registryRevision,uint64 controllerRevision,uint48 validAfter,uint48 validUntil,bool issuanceAllowed,bytes32 evidenceDigest)");
    bytes32 private constant REDEMPTION_TYPEHASH = keccak256("Redemption(bytes32 epochId,uint256 snapshotVersion,uint256 snapshotPrice,bytes32 requestId,uint256 sequence,address owner,address recipient,uint256 atoms,uint256 minimumPayout,uint256 nonce,uint48 deadline,uint64 controllerRevision)");
    enum Phase { GENESIS, ACTIVE, ZERO_SUPPLY_PENDING, ZERO_SUPPLY_RECONCILED }
    struct Valuation {
        address asset; uint256 usd36PerToken; uint256 registryEpoch; uint256 registryRevision;
        uint64 controllerRevision; uint48 validAfter; uint48 validUntil; bool issuanceAllowed; bytes32 evidenceDigest;
    }
    struct Redemption {
        bytes32 requestId; uint256 sequence; address owner; address recipient; uint256 atoms;
        uint256 minimumPayout; uint256 nonce; uint48 deadline; bytes signature;
    }
    struct Epoch {
        bytes32 id; bytes32 commitment; uint256 version; uint256 price; uint256 supply; uint48 deadline;
    }
    ORIORedemptionLocks public immutable redemptionLocks;
    ORIOGovernanceTimelock public immutable governance;
    MasterAssetRegistry public immutable registry;
    ORIOCurrency public immutable currency;
    ORIOReserveVault public immutable vault;
    address public valuationSigner;
    address public settlementOperator;
    bool public executionEnabled;
    uint64 public revision;
    uint256 public stateVersion;
    uint256 public referencePriceUsd36 = USD36;
    uint256 public roundingUsd54;
    uint256 public cycle;
    Phase public phase;
    Epoch public sealedEpoch;
    mapping(bytes32 => bool) public usedOperations;
    mapping(bytes32 => bool) public usedEpochs;


    mapping(address => bool) public migrationAdapters;
    event ConfigurationChanged(uint64 revision, address valuer, address operator, bool enabled);
    event RedemptionEpochSealed(bytes32 indexed epochId, bytes32 commitment, uint256 version, uint256 price, uint256 supply, uint48 deadline);
    event RedemptionEpochExpired(bytes32 indexed epochId);
    event MonetaryCheckpoint(bytes32 indexed operationId, uint8 indexed kind, uint256 indexed version, bytes stateData);
    event SettlementStarted(bytes32 indexed operationId, uint8 indexed kind, uint256 previousVersion);
    event PurchaseSettled(bytes32 indexed operationId, address indexed owner, uint256 gross, uint256 fee, uint256 company, uint256 minted);
    event RedemptionSettled(bytes32 indexed epochId, bytes32 indexed requestId, address indexed owner, address recipient, uint256 nonce, uint256 burned, uint256 payout, uint256 fee, uint256 company);
    event ReserveMasterReplaced(address indexed previous, address indexed current, uint256 previousUnits, uint256 receivedUnits, uint256 previousValueUsd54, uint256 currentValueUsd54);
    event CompanyFeesWithdrawn(address indexed asset, address indexed recipient, uint256 units);
    modifier onlyGovernance() { require(msg.sender == address(governance), OnlyGovernance()); _; }
    modifier onlyOperator() { require(msg.sender == settlementOperator, OnlySettlementOperator()); _; }

    constructor(ORIOGovernanceTimelock authority, MasterAssetRegistry masterRegistry, IERC20Metadata master)
    {
        require(block.chainid == 84532 || block.chainid == 31337, QualificationNetworksOnly());
        require(address(authority).code.length != 0 && authority.minimumDelayFloor() > 0
            && address(masterRegistry.governance()) == address(authority) && address(master).code.length != 0
            && master.decimals() <= 18, InvalidMonetaryConfiguration());
        governance = authority; registry = masterRegistry;
        currency = new ORIOCurrency(); vault = new ORIOReserveVault(IERC20(address(master)));
        redemptionLocks = new ORIORedemptionLocks(currency); currency.setSettlementLocker(address(redemptionLocks));
    }
    function configure(address valuer, address operator, bool enabled, uint64 expectedRevision) external onlyGovernance {
        require(revision == expectedRevision && valuer != address(0) && operator != address(0)
            && (!enabled || (registry.monetaryController() == address(this) && registry.monetaryVault() == address(vault))), InvalidConfiguration());
        valuationSigner = valuer; settlementOperator = operator; executionEnabled = enabled; revision++;
        emit ConfigurationChanged(revision, valuer, operator, enabled);
    }
    function setMigrationAdapter(address adapter, bool allowed, uint64 expectedRevision) external onlyGovernance {
        require(revision == expectedRevision && adapter.code.length != 0, InvalidAdapterConfiguration());
        migrationAdapters[adapter] = allowed; revision++;
    }
    function valuationHash(Valuation memory value) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VALUATION_TYPEHASH, value)));
    }
    function purchase(bytes32 operationId, uint256 expectedVersion, uint256 gross, uint256 minimumMinted,
        Valuation calldata value, bytes calldata signature) external nonReentrant
    {
        _operational(true); require(sealedEpoch.id == bytes32(0), RedemptionEpochIsSealed());
        require(phase != Phase.ZERO_SUPPLY_PENDING && stateVersion == expectedVersion && !usedOperations[operationId]
            && operationId != bytes32(0), InvalidOrStalePurchase());
        uint256 unitValue = _valuation(value, signature, address(vault.masterAsset()));
        require(value.issuanceAllowed, IssuanceRestricted()); _solvent(unitValue);
        emit SettlementStarted(operationId, 0, stateVersion);
        uint256 supply = currency.totalSupply(); uint256 fee = Math.ceilDiv(gross, 100);
        require(gross > fee, PurchaseBelowMonetaryMinimum());
        uint256 company = supply == 0 ? fee : fee / 5;
        if (supply > 0) _appreciate(fee - company, unitValue, supply);
        uint256 netValue = (gross - fee) * unitValue;
        uint256 minted = netValue / referencePriceUsd36;
        require(minted > 0 && minted >= minimumMinted, MintAmountBelowAuthorization());
        roundingUsd54 += netValue - minted * referencePriceUsd36;
        usedOperations[operationId] = true;
        vault.collect(msg.sender, gross, company); currency.mint(msg.sender, minted); phase = Phase.ACTIVE;
        stateVersion++; _solvent(unitValue);
        emit PurchaseSettled(operationId, msg.sender, gross, fee, company, minted);
        _checkpoint(operationId, 0, value.evidenceDigest, value.usd36PerToken);
    }
    function redemptionCommitment(Redemption[] calldata requests) public pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](requests.length);
        for (uint256 i; i < requests.length; i++) {
            Redemption calldata r = requests[i];
            hashes[i] = keccak256(abi.encode(r.requestId, r.sequence, r.owner, r.recipient, r.atoms, r.minimumPayout, r.nonce, r.deadline));
        }
        return keccak256(abi.encode(hashes));
    }
    function sealRedemptionEpoch(bytes32 id, uint256 expectedVersion, bytes32 commitment, uint48 deadline) external onlyOperator {
        _operational(false); require(sealedEpoch.id == bytes32(0) && !usedEpochs[id] && id != bytes32(0) && commitment != bytes32(0)
            && phase == Phase.ACTIVE && expectedVersion == stateVersion && deadline > block.timestamp && deadline <= block.timestamp + 300,
            InvalidRedemptionEpoch());
        sealedEpoch = Epoch(id, commitment, stateVersion, referencePriceUsd36, currency.totalSupply(), deadline);
        usedEpochs[id] = true;
        emit RedemptionEpochSealed(id, commitment, stateVersion, referencePriceUsd36, currency.totalSupply(), deadline);
    }
    function expireRedemptionEpoch() external {
        require(sealedEpoch.id != bytes32(0) && block.timestamp > sealedEpoch.deadline, EpochHasNotExpired());
        emit RedemptionEpochExpired(sealedEpoch.id); delete sealedEpoch;
    }
    function redemptionHash(Redemption calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REDEMPTION_TYPEHASH, sealedEpoch.id, sealedEpoch.version, sealedEpoch.price,
            request.requestId, request.sequence, request.owner, request.recipient, request.atoms, request.minimumPayout, request.nonce, request.deadline, revision)));
    }
    function redeemBatch(Redemption[] calldata requests, Valuation calldata value, bytes calldata signature) external onlyOperator nonReentrant {
        _operational(false); Epoch memory epoch = sealedEpoch;
        require(epoch.id != bytes32(0) && stateVersion == epoch.version && referencePriceUsd36 == epoch.price
            && currency.totalSupply() == epoch.supply && block.timestamp <= epoch.deadline && requests.length > 0 && requests.length <= 256
            && redemptionCommitment(requests) == epoch.commitment, InvalidSealedSettlement());
        uint256 unitValue = _valuation(value, signature, address(vault.masterAsset())); _solvent(unitValue);
        emit SettlementStarted(epoch.id, 1, stateVersion);
        uint256 burned;
        for (uint256 i; i < requests.length; i++) {
            Redemption calldata r = requests[i];
            require((i == 0 || requests[i-1].sequence < r.sequence)
                && r.deadline >= block.timestamp && r.deadline <= epoch.deadline
                , InvalidRedemptionAuthorization());
            burned += r.atoms;
        }
        require(burned <= epoch.supply, RedemptionExceedsSupply());
        uint256 remaining = epoch.supply - burned; uint256 companyTotal; uint256 holderTotal;
        address[] memory recipients = new address[](requests.length); uint256[] memory payouts = new uint256[](requests.length);
        for (uint256 i; i < requests.length; i++) {
            Redemption calldata r = requests[i]; uint256 grossValue = r.atoms * epoch.price;
            uint256 fee = Math.ceilDiv(grossValue, 100 * unitValue);
            uint256 grossNative = grossValue / unitValue;
            require(grossNative > fee, RedemptionBelowPayoutMinimum());
            uint256 payout = grossNative - fee; uint256 company = remaining == 0 ? fee : fee / 5;
            require(payout >= r.minimumPayout, PayoutBelowAuthorization());
            roundingUsd54 += grossValue - (payout + fee) * unitValue;
            companyTotal += company; holderTotal += fee - company; recipients[i] = r.recipient; payouts[i] = payout;
            redemptionLocks.consume(r.requestId, redemptionHash(r)); currency.burn(r.owner, r.atoms);
            emit RedemptionSettled(epoch.id, r.requestId, r.owner, r.recipient, r.nonce, r.atoms, payout, fee, company);
        }
        if (remaining > 0) _appreciate(holderTotal, unitValue, remaining); else phase = Phase.ZERO_SUPPLY_PENDING;
        vault.disburse(recipients, payouts, companyTotal); delete sealedEpoch; stateVersion++; _solvent(unitValue);
        _checkpoint(epoch.id, 1, value.evidenceDigest, value.usd36PerToken);
    }
    function reconcileZeroSupply(bytes32 operationId, uint256 expectedVersion, bytes32 checkpointDigest,
        Valuation calldata value, bytes calldata signature) external onlyGovernance nonReentrant
    {
        _operational(true); require(phase == Phase.ZERO_SUPPLY_PENDING && currency.totalSupply() == 0 && stateVersion == expectedVersion
            && checkpointDigest != bytes32(0) && operationId != bytes32(0) && !usedOperations[operationId], InvalidZeroCheckpoint());
        uint256 unitValue = _valuation(value, signature, address(vault.masterAsset()));
        require(value.issuanceAllowed, ReopeningRestricted()); _solvent(unitValue);
        emit SettlementStarted(operationId, 2, stateVersion);
        usedOperations[operationId] = true; phase = Phase.ZERO_SUPPLY_RECONCILED; cycle++; stateVersion++;
        _checkpoint(operationId, 2, checkpointDigest, value.usd36PerToken);
    }
    function withdrawCompany(address asset, address recipient, uint256 amount) external onlyGovernance nonReentrant {
        vault.withdrawCompany(asset, recipient, amount); emit CompanyFeesWithdrawn(asset, recipient, amount);
    }
    function migrateMaster(bytes32 operationId, address adapter, bytes calldata data, uint256 minimumReceived,
        Valuation calldata oldValue, bytes calldata oldSignature, Valuation calldata newValue, bytes calldata newSignature)
        external onlyGovernance nonReentrant
    {
        require(executionEnabled && sealedEpoch.id == bytes32(0) && migrationAdapters[adapter] && !usedOperations[operationId]
            && operationId != bytes32(0) && registry.currentMaster() == registry.assetId(address(vault.masterAsset()))
            && registry.pendingMaster() == registry.assetId(newValue.asset), InvalidReserveMigration());
        (,,MasterAssetRegistry.State status,) = registry.assets(registry.currentMaster());
        require(status == MasterAssetRegistry.State.MIGRATING, RegistryIsNotMigrating());
        uint256 oldUnitValue = _valuation(oldValue, oldSignature, address(vault.masterAsset()));
        uint256 newUnitValue = _valuation(newValue, newSignature, newValue.asset);
        emit SettlementStarted(operationId, 3, stateVersion);
        address previous = address(vault.masterAsset());
        (uint256 oldUnits,uint256 received) = vault.migrate(IERC20(newValue.asset), adapter, data, minimumReceived);
        require(phase != Phase.GENESIS || received == 0, OriginalGenesisCannotAcquireUnassignedBacking());
        _solvent(newUnitValue); usedOperations[operationId] = true; stateVersion++;
        emit ReserveMasterReplaced(previous, newValue.asset, oldUnits, received, oldUnits * oldUnitValue, received * newUnitValue);
        registry.completeMigration(registry.epoch(), registry.revision(), registry.assetId(newValue.asset), newValue.evidenceDigest);
        _checkpoint(operationId, 3, newValue.evidenceDigest, newValue.usd36PerToken);
    }
    function _valuation(Valuation calldata value, bytes calldata signature, address asset) private view returns (uint256) {
        require(value.asset == asset && value.usd36PerToken > 0 && value.controllerRevision == revision
            && value.registryEpoch == registry.epoch() && value.registryRevision == registry.revision()
            && value.validAfter <= block.timestamp && value.validUntil >= block.timestamp && value.validUntil > value.validAfter
            && value.validUntil - value.validAfter <= 300 && value.evidenceDigest != bytes32(0)
            && SignatureChecker.isValidSignatureNow(valuationSigner, valuationHash(value), signature), InvalidReserveValuation());
        uint8 decimals = IERC20Metadata(asset).decimals(); require(decimals <= 18, UnsupportedMasterPrecision());
        return value.usd36PerToken * (10 ** (18 - decimals));
    }
    function _operational(bool issuance) private view {
        (,,MasterAssetRegistry.State status,) = registry.assets(registry.currentMaster());
        require(executionEnabled && registry.currentMaster() == registry.assetId(address(vault.masterAsset()))
            && (status == MasterAssetRegistry.State.ACTIVE_MASTER || (!issuance && status == MasterAssetRegistry.State.DEPOSIT_PAUSED)),
            MonetaryExecutionPaused());
    }
    function _appreciate(uint256 holderUnits, uint256 unitValue, uint256 eligible) private {
        if (holderUnits == 0) return;
        uint256 value = holderUnits * unitValue; uint256 increment = value / eligible;
        require(increment > 0, HolderAppreciationBelowPrecision());
        referencePriceUsd36 += increment; roundingUsd54 += value - increment * eligible;
    }
    function _solvent(uint256 unitValue) private view {
        require(vault.reserveUnits() * unitValue >= currency.totalSupply() * referencePriceUsd36 + roundingUsd54,
            ReserveImpairment());
    }
    function _checkpoint(bytes32 operationId, uint8 kind, bytes32 evidence, uint256 masterUsd36) private {
        emit MonetaryCheckpoint(operationId, kind, stateVersion, abi.encode(stateVersion-1, address(vault.masterAsset()),
            currency.totalSupply(), referencePriceUsd36, vault.reserveUnits(), roundingUsd54,
            vault.companyFees(address(vault.masterAsset())), cycle, uint8(phase), evidence,
            masterUsd36, registry.epoch(), registry.revision(), revision, registry.assetId(address(vault.masterAsset()))));
    }
}
