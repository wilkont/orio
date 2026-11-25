// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ORIOPythCore} from "../src/ORIOPythCorePriceFeed.sol";

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
