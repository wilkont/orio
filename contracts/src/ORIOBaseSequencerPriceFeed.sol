// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ORIOPriceRound} from "./ORIORuleReserveOracle.sol";

/// @notice Gates a price feed on the Base sequencer's uptime and recovery period.
/// @dev The reserve oracle still enforces price age and cross-source agreement.
///      A pinned proxy address and code hash do not pin its implementation.
contract ORIOBaseSequencerPriceFeed is ORIOPriceRound {
    ORIOPriceRound public immutable priceFeed;
    ORIOPriceRound public immutable sequencerFeed;
    bytes32 public immutable priceCodeHash;
    bytes32 public immutable sequencerCodeHash;
    uint48 public immutable recoverySeconds;
    uint8 public immutable decimals;

    error InvalidConfiguration();
    error FeedCodeChanged();
    error SequencerUnavailable();
    error SequencerRecovering();
    error PricePrecisionChanged();

    constructor(ORIOPriceRound price, ORIOPriceRound sequencer, uint48 recovery) {
        if (address(price) == address(sequencer) || address(price).code.length == 0
            || address(sequencer).code.length == 0 || recovery == 0) revert InvalidConfiguration();
        uint8 precision = price.decimals();
        if (precision > 18) revert InvalidConfiguration();
        priceFeed = price;
        sequencerFeed = sequencer;
        priceCodeHash = address(price).codehash;
        sequencerCodeHash = address(sequencer).codehash;
        recoverySeconds = recovery;
        decimals = precision;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        if (address(priceFeed).codehash != priceCodeHash || address(sequencerFeed).codehash != sequencerCodeHash) {
            revert FeedCodeChanged();
        }
        (uint80 round, int256 status, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            sequencerFeed.latestRoundData();
        if (round == 0 || answeredInRound < round || status != 0 || startedAt == 0
            || updatedAt < startedAt || updatedAt > block.timestamp) revert SequencerUnavailable();
        if (block.timestamp - startedAt <= recoverySeconds) revert SequencerRecovering();
        if (priceFeed.decimals() != decimals) revert PricePrecisionChanged();
        return priceFeed.latestRoundData();
    }
}
