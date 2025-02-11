// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IGateway.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract RouterGateway {
    using SafeERC20 for IERC20;

    // Mapping from protocol name to gateway contract
    mapping(string => IGateway) public gateways;

    constructor(address aaveGateway, address compoundGateway) {
        gateways["aave"] = IGateway(aaveGateway);
        gateways["compound"] = IGateway(compoundGateway);
        gateways["compound v3"] = IGateway(compoundGateway);
    }

    function supplyWithPermit(
        string calldata protocolName,
        address token,
        address user,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");

        // Execute the permit
        IERC20Permit(token).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );

        // Transfer tokens from user to this contract (no need for approval now)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve gateway to spend tokens
        IERC20(token).approve(address(gateway), amount);

        // Forward deposit call to the appropriate gateway
        gateway.deposit(token, user, amount);
    }

    function supply(
        string calldata protocolName,
        address token,
        address user,
        uint256 amount
    ) external {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");

        // Transfer tokens from user to this contract
        console.log("Transferring tokens from user to this contract", amount);
        IERC20(token).safeTransferFrom(user, address(this), amount);

        // Approve gateway to spend tokens
        console.log("Approving gateway to spend tokens");
        IERC20(token).approve(address(gateway), amount);

        // Forward deposit call to the appropriate gateway
        console.log("Forwarding deposit call to the appropriate gateway");
        gateway.deposit(token, user, amount);
    }
} 