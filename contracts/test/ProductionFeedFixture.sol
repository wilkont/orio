// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ORIOPythCore} from "../src/ORIOPythCorePriceFeed.sol";

contract StreamsVerifierFixture {
    bytes32 private expectedEnvelope;
    bytes private report;

    function setReport(bytes calldata envelope, bytes calldata verifiedReport) external {
        expectedEnvelope = keccak256(envelope);
        report = verifiedReport;
    }

    function verify(bytes calldata envelope, bytes calldata parameters) external payable returns (bytes memory) {
        require(msg.value == 0 && parameters.length == 0 && keccak256(envelope) == expectedEnvelope, "Unverified envelope");
        return report;
    }
}

contract PythCoreFixture is ORIOPythCore {
    bytes32 private immutable id;
    Price private observation;

    constructor(bytes32 feedId) {
        id = feedId;
    }

    function setPrice(int64 value, uint64 conf, int32 expo, uint256 published) external {
        observation = Price(value, conf, expo, published);
    }

    function getPriceNoOlderThan(bytes32 requested, uint256 age) external view returns (Price memory) {
        require(requested == id && age == 300, "Unexpected Pyth query");
        return observation;
    }
}
