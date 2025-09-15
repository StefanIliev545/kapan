// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGatewayView {
    function getBalance(address token, address user) external view returns (uint256);
    function getBorrowBalance(address token, address user) external view returns (uint256);
    function getBorrowRate(address token) external view returns (uint256, bool);
    function getSupplyRate(address token) external view returns (uint256, bool);
}
