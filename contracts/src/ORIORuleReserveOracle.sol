// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
interface ORIOPriceRound {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
/// @notice Immutable two-source qualification oracle. No owner, signer or override.
/// @dev Feed authenticity, independence and proxy implementations require deployment
/// admission. Immutable addresses do not make third-party data censorship-proof.
contract ORIORuleReserveOracle {
    ORIOPriceRound public immutable first;
    ORIOPriceRound public immutable second;
    bytes32 public immutable firstCodeHash;
    bytes32 public immutable secondCodeHash;
    uint8 private immutable firstDecimals;
    uint8 private immutable secondDecimals;
    constructor(ORIOPriceRound a, ORIOPriceRound b) {
        require(address(a) != address(b) && address(a).code.length > 0 && address(b).code.length > 0, "Distinct price sources required");
        uint8 da = a.decimals(); uint8 db = b.decimals();
        require(da <= 18 && db <= 18, "Unsupported price precision");
        first = a; second = b; firstDecimals = da; secondDecimals = db;
        firstCodeHash = address(a).codehash; secondCodeHash = address(b).codehash;
    }
    function read() external view returns (uint256 usd36, bool issuanceAllowed) {
        require(address(first).codehash == firstCodeHash && address(second).codehash == secondCodeHash, "Price source code changed");
        uint256 a = _read(first, firstDecimals); uint256 b = _read(second, secondDecimals);
        usd36 = Math.min(a,b);
        require(Math.max(a,b) - usd36 <= Math.mulDiv(usd36, 20000, 1000000), "Price sources disagree");
        issuanceAllowed = usd36 >= 995e33 && usd36 <= 1005e33;
    }
    function _read(ORIOPriceRound feed, uint8 precision) private view returns (uint256) {
        (uint80 round, int256 price,, uint256 updated, uint80 answered) = feed.latestRoundData();
        require(round > 0 && answered >= round && price > 0 && updated > 0 && updated <= block.timestamp
            && block.timestamp - updated <= 300, "Unavailable or stale price");
        return uint256(price) * 10 ** (36 - precision);
    }
}
