// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IEulerPriceOracle} from "../interfaces/euler/IEulerPriceOracle.sol";

contract MockEulerPriceOracle is IEulerPriceOracle {
    mapping(address => uint256) public prices;

    function setPrice(address token, uint256 price) external {
        prices[token] = price;
    }

    function getPrice(address token) external view returns (uint256) {
        return prices[token];
    }
}
