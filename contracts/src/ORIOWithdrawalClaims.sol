// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/// @notice Funded payouts: anyone can deliver a claim to its fixed recipient.
/// No owner, pause, sweep, recipient override or company signing permission.
contract ORIOWithdrawalClaims is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable asset;
    address public immutable controller;
    mapping(address => uint256) public claimable;
    uint256 public totalOwed;
    event PayoutCredited(address indexed recipient, uint256 units);
    event PayoutClaimed(address indexed recipient, uint256 units);
    constructor(IERC20 token) { asset = token; controller = msg.sender; }
    function credit(address recipient, uint256 units) external {
        require(msg.sender == controller && recipient != address(0) && recipient != address(this) && units > 0, "Invalid payout credit");
        totalOwed += units; claimable[recipient] += units;
        require(asset.balanceOf(address(this)) >= totalOwed, "Unfunded payout");
        emit PayoutCredited(recipient, units);
    }
    function claimFor(address recipient) external nonReentrant {
        uint256 units = claimable[recipient]; require(units > 0, "No payout claim");
        uint256 beforeVault = asset.balanceOf(address(this)); uint256 beforeRecipient = asset.balanceOf(recipient);
        claimable[recipient] = 0; totalOwed -= units;
        asset.safeTransfer(recipient, units);
        require(asset.balanceOf(address(this)) == beforeVault - units && asset.balanceOf(recipient) == beforeRecipient + units,
            "Unsupported payout behavior");
        emit PayoutClaimed(recipient, units);
    }
}
