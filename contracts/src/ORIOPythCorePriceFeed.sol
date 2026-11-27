// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ORIOPriceRound} from "./ORIORuleReserveOracle.sol";

interface ORIOPythCore {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getPriceNoOlderThan(bytes32 priceId, uint256 age) external view returns (Price memory);
}

/// @notice Presents a Pyth Core price as a reserve oracle round.
/// @dev A separate authorized updater supplies fresh prices. This contract has
///      no update, payment or administrator entry point.
contract ORIOPythCorePriceFeed is ORIOPriceRound {
    uint256 public constant MAXIMUM_PRICE_AGE = 300;
    uint256 private constant PPM = 1_000_000;

    ORIOPythCore public immutable source;
    bytes32 public immutable sourceCodeHash;
    bytes32 public immutable priceId;
    uint32 public immutable confidenceLimitPpm;
    uint8 public immutable decimals;

    error InvalidConfiguration();
    error SourceCodeChanged();
    error InvalidPrice();
    error UncertainPrice();

    constructor(ORIOPythCore pyth, bytes32 feedId, uint8 precision, uint32 confidencePpm) {
        if (address(pyth).code.length == 0 || feedId == bytes32(0) || precision > 18
            || confidencePpm == 0 || confidencePpm > PPM) revert InvalidConfiguration();
        source = pyth;
        sourceCodeHash = address(pyth).codehash;
        priceId = feedId;
        confidenceLimitPpm = confidencePpm;
        decimals = precision;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        if (address(source).codehash != sourceCodeHash) revert SourceCodeChanged();
        ORIOPythCore.Price memory observed = source.getPriceNoOlderThan(priceId, MAXIMUM_PRICE_AGE);
        uint256 time = observed.publishTime;
        if (observed.price <= 0 || observed.expo != -int32(uint32(decimals)) || time == 0
            || time > type(uint80).max || time > block.timestamp || block.timestamp - time > MAXIMUM_PRICE_AGE) {
            revert InvalidPrice();
        }
        if (uint256(observed.conf) * PPM > uint256(uint64(observed.price)) * confidenceLimitPpm) {
            revert UncertainPrice();
        }
        return (uint80(time), int256(observed.price), time, time, uint80(time));
    }
}
