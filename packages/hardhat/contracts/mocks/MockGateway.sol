// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IGateway.sol";

contract MockGateway is IGateway {
    uint256 public mockBalance;
    uint256 public mockDebt;
    uint256 public lastAmount;

    function setMockBalance(uint256 bal) external { mockBalance = bal; }
    function setMockDebt(uint256 debt) external { mockDebt = debt; }

    function deposit(address, address, uint256 amount) external override { lastAmount = amount; }
    function borrow(address, address, uint256 amount) external override { lastAmount = amount; }
    function repay(address, address, uint256 amount) external override { lastAmount = amount; }
    function depositCollateral(address, address, uint256, address) external override {}
    function withdrawCollateral(address, address collateral, address, uint256 amount) external override returns (address, uint256) {
        lastAmount = amount; return (collateral, amount);
    }
    function getBalance(address, address) external view override returns (uint256) { return mockBalance; }
    function getBorrowBalance(address, address) external view override returns (uint256) { return mockDebt; }
    function getBorrowBalanceCurrent(address, address) external pure override returns (uint256) { return 0; }
    function getBorrowRate(address) external pure override returns (uint256, bool) { return (0, false); }
    function getSupplyRate(address) external pure override returns (uint256, bool) { return (0, false); }
    function getLtv(address, address) external pure override returns (uint256) { return 0; }
    function getPossibleCollaterals(address, address) external pure override returns (address[] memory, uint256[] memory, string[] memory, uint8[] memory) {
        return (new address[](0), new uint256[](0), new string[](0), new uint8[](0));
    }
    function isCollateralSupported(address, address) external pure override returns (bool) { return false; }
    function getSupportedCollaterals(address) external pure override returns (address[] memory) {
        return new address[](0);
    }
    function getEncodedCollateralApprovals(address, Collateral[] calldata) external pure override returns (address[] memory target, bytes[] memory data) {
        return (new address[](0), new bytes[](0));
    }
    function getEncodedDebtApproval(address, uint256, address) external pure override returns (address[] memory target, bytes[] memory data) {
        return (new address[](0), new bytes[](0));
    }
    function getInboundCollateralActions(address, Collateral[] calldata) external pure override returns (address[] memory target, bytes[] memory data) {
        return (new address[](0), new bytes[](0));
    }
}
