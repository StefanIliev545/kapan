// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract UiHelper {
    function getDecimals(address[] calldata tokens) public view returns (uint256[] memory) {
        uint256[] memory decimals = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            decimals[i] = IERC20Metadata(tokens[i]).decimals();
        }
        return decimals;
    }
}
