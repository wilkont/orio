// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ORIOCurrency} from "./ORIOCurrency.sol";
import {ORIOReserveVault} from "./ORIOReserveVault.sol";
import {ORIORuleReserveOracle, ORIOPriceRound} from "./ORIORuleReserveOracle.sol";
import {ORIOWithdrawalClaims} from "./ORIOWithdrawalClaims.sol";
import {ORIOAutonomousLocks} from "./ORIOAutonomousLocks.sol";

/// @notice Separate qualification controller for protocol-only redemption access.
/// No operator/valuation-signing key, governance pause, upgrade or reserve sweep.
/// @dev Fixed master and immutable feeds. Mainnet/migration/provider admission and
/// production gas abstraction remain separate qualification work; no live switch.
contract ORIOAutonomousController is ReentrancyGuard {
    uint256 public constant USD36 = 1e36;
    uint256 public constant MAX_REQUESTS = 64;
    bytes32 public constant POLICY_ID = keccak256("orio-final-monetary-2026-11-13-v1");
    bytes32 private constant REQUEST_TYPEHASH = keccak256("Withdrawal(bytes32 requestId,uint256 epochId,address owner,address recipient,uint256 atoms,uint256 minimumPayout,uint256 nonce,uint48 deadline)");
    bytes32 private immutable domain;
    ORIOCurrency public immutable currency;
    ORIOAutonomousLocks public immutable locks;
    ORIOReserveVault public immutable vault;
    ORIOWithdrawalClaims public immutable payouts;
    ORIORuleReserveOracle public immutable oracle;
    IERC20Metadata public immutable master;
    address public immutable companyRecipient;
    uint256 public immutable unitScale;
    uint48 public immutable origin;
    uint48 public immutable admissionSeconds;
    uint256 public referencePriceUsd36 = USD36;
    uint256 public roundingUsd54;
    uint256 public stateVersion;
    uint256 public cycle;
    enum Phase { GENESIS, ACTIVE, ZERO_SUPPLY_PENDING, ZERO_SUPPLY_RECONCILED }
    Phase public phase;
    struct Epoch { uint256 id; uint48 closesAt; uint256 price; uint256 supply; }
    struct Withdrawal {
        bytes32 requestId; uint256 epochId; address owner; address recipient; uint256 atoms;
        uint256 minimumPayout; uint256 nonce; uint48 deadline;
    }
    struct Queued { Withdrawal request; bool released; }
    Epoch public activeEpoch;
    Queued[] private queue;
    mapping(bytes32 => bool) public usedRequests;
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    mapping(bytes32 => uint256) private positions;
    event PurchaseSettled(bytes32 indexed operationId, address indexed owner, uint256 gross, uint256 fee, uint256 company, uint256 minted);
    event WithdrawalQueued(bytes32 indexed requestId, uint256 indexed epochId, address indexed owner, address recipient, uint256 atoms);
    event WithdrawalReleased(bytes32 indexed requestId);
    event WithdrawalSettled(bytes32 indexed requestId, uint256 indexed epochId, uint256 burned, uint256 payout, uint256 fee, uint256 company);
    event EpochSettled(uint256 indexed epochId, uint256 snapshotPrice, uint256 masterUsd36, uint256 burned, uint256 remaining, uint256 version);
    event ZeroSupplyReconciled(uint256 indexed cycle, uint256 referencePrice);
    event AutonomousStart(uint256 indexed previousVersion);
    event AutonomousCheckpoint(uint256 indexed version, uint8 indexed kind, bytes32 indexed operationId, bytes state);
    event WithdrawalAllocation(bytes32 indexed requestId, address indexed owner, address indexed recipient,
        uint256 atoms, uint256 payout, uint256 fee, uint256 company);
    mapping(bytes32 => bool) public usedPurchases;

    constructor(IERC20Metadata asset, ORIOPriceRound sourceA, ORIOPriceRound sourceB, address company, uint48 period) {
        require(block.chainid == 84532 || block.chainid == 31337, "Qualification networks only");
        require(address(asset).code.length > 0 && asset.decimals() <= 18 && company != address(0)
            && company != address(this) && period > 0 && period <= 300, "Invalid autonomous configuration");
        master = asset; companyRecipient = company; unitScale = 10 ** (18 - asset.decimals());
        origin = uint48(block.timestamp); admissionSeconds = period;
        domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ORIO Autonomous Withdrawal"), keccak256("1"), block.chainid, address(this)));
        oracle = new ORIORuleReserveOracle(sourceA, sourceB);
        currency = new ORIOCurrency(); locks = new ORIOAutonomousLocks(currency); currency.setSettlementLocker(address(locks));
        vault = new ORIOReserveVault(IERC20(address(asset)));
        payouts = new ORIOWithdrawalClaims(IERC20(address(asset)));
    }
    function currentEpochId() public view returns (uint256) {
        return (block.timestamp - origin) / admissionSeconds + 1;
    }
    function queueLength() external view returns (uint256) { return queue.length; }
    function withdrawalHash(Withdrawal calldata r) public view returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", domain, keccak256(abi.encode(REQUEST_TYPEHASH,
            r.requestId, r.epochId, r.owner, r.recipient, r.atoms, r.minimumPayout, r.nonce, r.deadline))));
    }
    function purchase(bytes32 operationId, uint256 expectedVersion, uint256 gross, uint256 minimumMinted) external nonReentrant {
        require(activeEpoch.id == 0 && phase != Phase.ZERO_SUPPLY_PENDING && expectedVersion == stateVersion
            && operationId != bytes32(0) && !usedPurchases[operationId], "Stale or unavailable purchase");
        emit AutonomousStart(stateVersion);
        (uint256 usd, bool allowed) = oracle.read(); require(allowed, "Issuance restricted");
        uint256 unitValue = usd * unitScale; _solvent(unitValue);
        uint256 fee = Math.ceilDiv(gross,100); require(gross > fee, "Purchase below minimum");
        uint256 supply = currency.totalSupply(); uint256 company = supply == 0 ? fee : fee / 5;
        if (supply > 0) _appreciate(fee - company,unitValue,supply);
        uint256 netValue = (gross - fee) * unitValue; uint256 minted = netValue / referencePriceUsd36;
        require(minted > 0 && minted >= minimumMinted, "Mint below authorization");
        roundingUsd54 += netValue - minted * referencePriceUsd36; usedPurchases[operationId] = true;
        vault.collect(msg.sender,gross,company); currency.mint(msg.sender,minted); phase = Phase.ACTIVE;
        stateVersion++; _solvent(unitValue);
        emit PurchaseSettled(operationId,msg.sender,gross,fee,company,minted);
        _checkpoint(0,operationId,usd);
    }
    function enqueue(Withdrawal calldata r, bytes calldata signature) external nonReentrant {
        uint256 id = currentEpochId(); uint48 close = origin + uint48(id * admissionSeconds);
        require(phase == Phase.ACTIVE && r.epochId == id && (activeEpoch.id == 0 || activeEpoch.id == id)
            && block.timestamp < close && queue.length < MAX_REQUESTS, "Admission closed");
        require(r.requestId != bytes32(0) && !usedRequests[r.requestId] && !usedNonces[r.owner][r.nonce]
            && r.owner != address(0) && r.recipient != address(0) && r.recipient != address(payouts)
            && r.recipient != address(vault) && r.atoms > 0 && r.minimumPayout > 0
            && r.deadline == uint256(close) + 120
            && SignatureChecker.isValidSignatureNow(r.owner,withdrawalHash(r),signature), "Invalid withdrawal authorization");
        (uint256 usd,) = oracle.read();
        uint256 grossValue = r.atoms * referencePriceUsd36; uint256 unitValue = usd * unitScale;
        uint256 grossNative = grossValue / unitValue; uint256 fee = Math.ceilDiv(grossValue,100 * unitValue);
        require(grossNative > fee && grossNative - fee >= r.minimumPayout, "Nonpaying admission");
        if (activeEpoch.id == 0) activeEpoch = Epoch(id,close,referencePriceUsd36,currency.totalSupply());
        usedRequests[r.requestId] = true; usedNonces[r.owner][r.nonce] = true;
        queue.push(Queued(r,false)); positions[r.requestId] = queue.length;
        locks.lock(r.owner,r.atoms);
        emit WithdrawalQueued(r.requestId,id,r.owner,r.recipient,r.atoms);
    }
    function cancel(bytes32 requestId) external nonReentrant {
        Queued storage q = _queued(requestId);
        require(msg.sender == q.request.owner && block.timestamp < activeEpoch.closesAt, "Cancellation closed");
        _release(q);
        bool live;
        for (uint256 i; i < queue.length; i++) if (!queue[i].released) live = true;
        if (!live) _closeEmpty();
    }
    function releaseExpired(bytes32 requestId) external nonReentrant {
        Queued storage q = _queued(requestId); require(block.timestamp > q.request.deadline, "Request has not expired");
        _release(q);
    }
    function settleEpoch() external nonReentrant {
        Epoch memory e = activeEpoch;
        require(e.id != 0 && block.timestamp >= e.closesAt && currency.totalSupply() == e.supply
            && referencePriceUsd36 == e.price, "Epoch not ready");
        bool hasLive;
        for (uint256 i; i < queue.length; i++) if (!queue[i].released && queue[i].request.deadline >= block.timestamp) hasLive = true;
        if (!hasLive) { _closeEmpty(); return; }
        emit AutonomousStart(stateVersion);
        (uint256 usd,) = oracle.read(); uint256 unitValue = usd * unitScale; _solvent(unitValue);
        uint256[] memory amounts = new uint256[](queue.length); uint256[] memory fees = new uint256[](queue.length);
        uint256 burned; uint256 totalPayout;
        for (uint256 i; i < queue.length; i++) {
            Queued storage q = queue[i]; Withdrawal memory r = q.request;
            if (q.released || r.deadline < block.timestamp) continue;
            uint256 grossValue = r.atoms * e.price; uint256 grossNative = grossValue / unitValue;
            uint256 fee = Math.ceilDiv(grossValue,100 * unitValue);
            if (grossNative <= fee || grossNative - fee < r.minimumPayout) continue;
            amounts[i] = grossNative - fee; fees[i] = fee; burned += r.atoms; totalPayout += amounts[i];
        }
        require(burned <= e.supply, "Redemption exceeds supply");
        uint256 remaining = e.supply - burned; uint256 companyTotal; uint256 holderTotal;
        for (uint256 i; i < queue.length; i++) {
            Queued storage q = queue[i];
            if (q.released) continue;
            if (amounts[i] == 0) { _release(q); continue; }
            uint256 company = _burnAllocation(q,e.id,amounts[i],fees[i],remaining,e.price,unitValue);
            companyTotal += company; holderTotal += fees[i] - company;
        }
        if (burned > 0) {
            if (remaining > 0) _appreciate(holderTotal,unitValue,remaining); else phase = Phase.ZERO_SUPPLY_PENDING;
            address[] memory recipients = new address[](1); recipients[0] = address(payouts);
            uint256[] memory totals = new uint256[](1); totals[0] = totalPayout;
            vault.disburse(recipients,totals,companyTotal);
            for (uint256 i; i < queue.length; i++) if (amounts[i] > 0) payouts.credit(queue[i].request.recipient,amounts[i]);
        }
        _clear(); stateVersion++; _solvent(unitValue);
        emit EpochSettled(e.id,e.price,usd,burned,remaining,stateVersion);
        _checkpoint(1,bytes32(e.id),usd);
    }
    function reconcileZeroSupply() external nonReentrant {
        require(phase == Phase.ZERO_SUPPLY_PENDING && activeEpoch.id == 0 && currency.totalSupply() == 0, "Invalid zero checkpoint");
        emit AutonomousStart(stateVersion);
        (uint256 usd, bool allowed) = oracle.read(); require(allowed, "Reopening restricted"); _solvent(usd * unitScale);
        require(master.balanceOf(address(payouts)) >= payouts.totalOwed(), "Payout obligations unfunded");
        phase = Phase.ZERO_SUPPLY_RECONCILED; cycle++; stateVersion++;
        emit ZeroSupplyReconciled(cycle,referencePriceUsd36);
        _checkpoint(2,bytes32(cycle),usd);
    }
    function deliverCompanyFees(uint256 units) external nonReentrant {
        emit AutonomousStart(stateVersion);
        vault.withdrawCompany(address(master),companyRecipient,units);
        stateVersion++; _checkpoint(4,bytes32(stateVersion),0);
    }
    function _queued(bytes32 id) private view returns (Queued storage q) {
        uint256 position = positions[id]; require(position > 0 && position <= queue.length && queue[position-1].request.requestId == id, "Unknown request");
        return queue[position-1];
    }
    function _burnAllocation(Queued storage q, uint256 epoch, uint256 amount, uint256 fee,
        uint256 remaining, uint256 price, uint256 unitValue) private returns (uint256 company) {
        Withdrawal memory r = q.request; q.released = true;
        company = remaining == 0 ? fee : fee / 5;
        roundingUsd54 += r.atoms * price - (amount + fee) * unitValue;
        locks.unlock(r.owner,r.atoms); currency.burn(r.owner,r.atoms);
        emit WithdrawalSettled(r.requestId,epoch,r.atoms,amount,fee,company);
        emit WithdrawalAllocation(r.requestId,r.owner,r.recipient,r.atoms,amount,fee,company);
    }
    function _release(Queued storage q) private {
        require(!q.released, "Request already released"); q.released = true;
        locks.unlock(q.request.owner,q.request.atoms); emit WithdrawalReleased(q.request.requestId);
    }
    function _closeEmpty() private {
        emit AutonomousStart(stateVersion);
        for (uint256 i; i < queue.length; i++) if (!queue[i].released) _release(queue[i]);
        uint256 id = activeEpoch.id; uint256 price = activeEpoch.price; _clear(); stateVersion++;
        emit EpochSettled(id,price,0,0,currency.totalSupply(),stateVersion);
        _checkpoint(3,bytes32(id),0);
    }
    function _checkpoint(uint8 kind, bytes32 operationId, uint256 usd) private {
        emit AutonomousCheckpoint(stateVersion,kind,operationId,abi.encode(currency.totalSupply(),referencePriceUsd36,
            vault.reserveUnits(),roundingUsd54,vault.companyFees(address(master)),cycle,uint256(phase),usd,payouts.totalOwed()));
    }
    function _clear() private {
        for (uint256 i; i < queue.length; i++) delete positions[queue[i].request.requestId];
        delete queue; delete activeEpoch;
    }
    function _appreciate(uint256 units, uint256 unitValue, uint256 eligible) private {
        if (units == 0) return;
        uint256 value = units * unitValue; uint256 increment = value / eligible;
        require(increment > 0, "Appreciation below precision");
        referencePriceUsd36 += increment; roundingUsd54 += value - increment * eligible;
    }
    function _solvent(uint256 unitValue) private view {
        require(vault.reserveUnits() * unitValue >= currency.totalSupply() * referencePriceUsd36 + roundingUsd54, "Reserve impairment");
        require(master.balanceOf(address(vault)) >= vault.reserveUnits() + vault.companyFees(address(master)), "Reserve custody mismatch");
    }
}
