// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IGatewayView.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RouterView
/// @notice Exposes read only functions for protocol gateways without
/// cluttering the core router contract.
contract RouterView is Ownable {
    mapping(string => IGatewayView) public gateways;

    constructor(address owner) Ownable(owner) {}

    function addGateway(string calldata protocolName, address gateway) external onlyOwner {
        gateways[protocolName] = IGatewayView(gateway);
    }

    function getBalance(
        string calldata protocolName,
        address token,
        address user
    ) external view returns (uint256) {
        IGatewayView gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getBalance(token, user);
    }

    function getBorrowBalance(
        string calldata protocolName,
        address token,
        address user
    ) external view returns (uint256) {
        IGatewayView gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getBorrowBalance(token, user);
    }

    function getBorrowRate(string calldata protocolName, address token) external view returns (uint256, bool) {
        IGatewayView gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getBorrowRate(token);
    }

    function getSupplyRate(string calldata protocolName, address token) external view returns (uint256, bool) {
        IGatewayView gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getSupplyRate(token);
    }
}
