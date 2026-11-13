// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @dev Local fixture only, with no spendable token state or production issuer claims.
contract MockTokenMetadata {
    uint8 public immutable decimals;
    constructor(uint8 value) { decimals = value; }
}
