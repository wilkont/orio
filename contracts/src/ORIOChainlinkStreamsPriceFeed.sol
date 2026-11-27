// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ORIOPriceRound} from "./ORIORuleReserveOracle.sol";

interface ORIOStreamsVerifier {
    function verify(bytes calldata signedReport, bytes calldata parameterPayload) external payable returns (bytes memory);
}

/// @notice Caches verified v3 price reports for one admitted feed.
/// @dev Anyone can relay a signed report. The subscription verifier is called
///      without payment or allowances. Deployment must admit its proxy and feed.
contract ORIOChainlinkStreamsPriceFeed is ORIOPriceRound {
    struct Report {
        bytes32 feedId;
        uint32 validFrom;
        uint32 observedAt;
        uint192 nativeFee;
        uint192 linkFee;
        uint32 expiresAt;
        int192 price;
        int192 bid;
        int192 ask;
    }

    uint256 public constant MAXIMUM_PRICE_AGE = 300;
    uint8 public immutable decimals;
    ORIOStreamsVerifier public immutable verifier;
    bytes32 public immutable verifierCodeHash;
    bytes32 public immutable feedId;
    uint32 private lastObservedAt;
    uint32 private lastExpiry;
    int192 private lastPrice;

    error InvalidConfiguration();
    error VerifierCodeChanged();
    error InvalidReport();
    error UnavailablePrice();

    event PriceAccepted(uint32 indexed observedAt, uint32 expiresAt, int192 price);

    constructor(ORIOStreamsVerifier proxy, bytes32 expectedFeedId, uint8 precision) {
        bytes2 version = bytes2(expectedFeedId);
        if (address(proxy).code.length == 0 || (version != 0x0003 && version != 0x1003)
            || (precision != 8 && precision != 18)) {
            revert InvalidConfiguration();
        }
        verifier = proxy;
        verifierCodeHash = address(proxy).codehash;
        feedId = expectedFeedId;
        decimals = precision;
    }

    function submit(bytes calldata signedReport) external {
        _checkVerifier();
        bytes memory verified = verifier.verify(signedReport, bytes(""));
        if (verified.length != 9 * 32) revert InvalidReport();
        Report memory report = abi.decode(verified, (Report));
        if (report.feedId != feedId || report.validFrom == 0 || report.validFrom > report.observedAt
            || report.observedAt <= lastObservedAt || report.observedAt > block.timestamp
            || block.timestamp - report.observedAt > MAXIMUM_PRICE_AGE || report.expiresAt <= block.timestamp
            || report.bid <= 0 || report.price < report.bid || report.price > report.ask) revert InvalidReport();
        lastObservedAt = report.observedAt;
        lastExpiry = report.expiresAt;
        lastPrice = report.price;
        emit PriceAccepted(report.observedAt, report.expiresAt, report.price);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        _checkVerifier();
        uint32 observedAt = lastObservedAt;
        if (observedAt == 0 || observedAt > block.timestamp || block.timestamp >= lastExpiry
            || block.timestamp - observedAt > MAXIMUM_PRICE_AGE) revert UnavailablePrice();
        return (observedAt, lastPrice, observedAt, observedAt, observedAt);
    }

    function _checkVerifier() private view {
        if (address(verifier).codehash != verifierCodeHash) revert VerifierCodeChanged();
    }
}
