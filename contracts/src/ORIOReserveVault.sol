// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IORIOReserveSwap {
    function swap(address previous, address replacement, uint256 units, bytes calldata data) external;
}

/// @notice Reserve cash and company fees are separately accounted. No administrative sweep.
contract ORIOReserveVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable controller;
    IERC20 public masterAsset;
    uint256 public reserveUnits;
    mapping(address => uint256) public companyFees;
    modifier onlyController() { require(msg.sender == controller, "Only monetary controller"); _; }
    constructor(IERC20 asset) {
        require(address(asset).code.length != 0, "Invalid master asset"); controller = msg.sender; masterAsset = asset;
    }
    function collect(address payer, uint256 gross, uint256 company) external onlyController nonReentrant {
        require(payer != address(this) && payer != address(0) && gross > company, "Invalid reserve collection");
        uint256 beforeBalance = masterAsset.balanceOf(address(this));
        masterAsset.safeTransferFrom(payer, address(this), gross);
        require(masterAsset.balanceOf(address(this)) == beforeBalance + gross, "Unsupported token transfer behavior");
        reserveUnits += gross - company; companyFees[address(masterAsset)] += company; _assertCustody(address(masterAsset));
    }
    function disburse(address[] calldata recipients, uint256[] calldata payouts, uint256 company)
        external onlyController nonReentrant
    {
        require(recipients.length == payouts.length, "Invalid payout batch");
        uint256 total = company; for (uint256 i; i < payouts.length; i++) total += payouts[i];
        require(total <= reserveUnits, "Insufficient reserve");
        reserveUnits -= total; companyFees[address(masterAsset)] += company;
        for (uint256 i; i < payouts.length; i++) _send(masterAsset, recipients[i], payouts[i]);
        _assertCustody(address(masterAsset));
    }
    function withdrawCompany(address asset, address recipient, uint256 units) external onlyController nonReentrant {
        require(units > 0 && units <= companyFees[asset], "Company funds only");
        companyFees[asset] -= units; _send(IERC20(asset), recipient, units); _assertCustody(asset);
    }
    function migrate(IERC20 replacement, address adapter, bytes calldata data, uint256 minimumReceived)
        external onlyController nonReentrant returns (uint256 previousUnits, uint256 received)
    {
        IERC20 previous = masterAsset;
        require(address(replacement) != address(previous) && address(replacement).code.length != 0 && adapter.code.length != 0,
            "Invalid reserve replacement");
        previousUnits = reserveUnits;
        uint256 oldBalance = previous.balanceOf(address(this)); uint256 newBalance = replacement.balanceOf(address(this));
        if (previousUnits > 0) previous.safeTransfer(adapter, previousUnits);
        IORIOReserveSwap(adapter).swap(address(previous), address(replacement), previousUnits, data);
        require(previous.balanceOf(address(this)) == oldBalance - previousUnits, "Unexpected outgoing reserve");
        received = replacement.balanceOf(address(this)) - newBalance;
        require(received >= minimumReceived, "Migration minimum not met");
        masterAsset = replacement; reserveUnits = received;
        _assertCustody(address(previous)); _assertCustody(address(replacement));
    }
    function _send(IERC20 asset, address recipient, uint256 units) private {
        require(recipient != address(0) && recipient != address(this) && units > 0, "Invalid payout");
        uint256 beforeVault = asset.balanceOf(address(this)); uint256 beforeRecipient = asset.balanceOf(recipient);
        asset.safeTransfer(recipient, units);
        require(asset.balanceOf(address(this)) == beforeVault - units && asset.balanceOf(recipient) == beforeRecipient + units,
            "Unsupported payout behavior");
    }
    function _assertCustody(address asset) private view {
        uint256 required = companyFees[asset] + (asset == address(masterAsset) ? reserveUnits : 0);
        require(IERC20(asset).balanceOf(address(this)) >= required, "Reserve custody mismatch");
    }
}
