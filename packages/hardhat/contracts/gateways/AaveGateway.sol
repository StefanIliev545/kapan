// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IGateway } from "../interfaces/IGateway.sol";

contract AaveGateway is IGateway {
    constructor() {}

    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement
    }

    function deposit(address token, address user, uint256 amount) external override {}

    function withdraw(address token, address user, uint256 amount) external override {}

    function borrow(address token, address user, uint256 amount) external override {}

    function repay(address token, address user, uint256 amount) external override {}

    function getBalance(address token, address user) external view override returns (uint256) {}

    function getBorrowRate(address token) external view override returns (uint256) {}

    function getSupplyRate(address token) external view override returns (uint256) {}
}