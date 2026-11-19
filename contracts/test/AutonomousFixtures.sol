// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev Disconnected VM fixtures only; no operational price/source admission.
contract AutonomousTestFeed {
    uint8 public constant decimals = 8;
    int256 public answer = 1e8;
    uint256 public updatedAt;
    constructor() { updatedAt = block.timestamp; }
    function set(int256 value, uint256 timestamp) external { answer=value; updatedAt=timestamp; }
    function latestRoundData() external view returns (uint80,int256,uint256,uint256,uint80) { return (1,answer,updatedAt,updatedAt,1); }
}
contract AutonomousTestAsset is ERC20 {
    mapping(address=>bool) public blocked;
    constructor() ERC20("Synthetic autonomous reserve","TEST") {}
    function decimals() public pure override returns(uint8) { return 6; }
    function mintFixture(address owner,uint256 units) external { _mint(owner,units); }
    function setBlocked(address recipient,bool value) external { blocked[recipient]=value; }
    function _update(address from,address to,uint256 units) internal override {
        require(!blocked[to],"Synthetic recipient restriction"); super._update(from,to,units);
    }
}
