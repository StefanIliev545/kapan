// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IGateway.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/balancer/IVault.sol";

import "hardhat/console.sol";

contract RouterGateway {
    using SafeERC20 for IERC20;

    // Mapping from protocol name to gateway contract
    mapping(string => IGateway) public gateways;
    IVault public balancerVault;
    constructor(address aaveGateway, address compoundGateway, IVault vault) {
        gateways["aave"] = IGateway(aaveGateway);
        gateways["compound"] = IGateway(compoundGateway);
        gateways["compound v3"] = IGateway(compoundGateway);
        gateways["aave v3"] = IGateway(aaveGateway);
        balancerVault = vault;
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

    function repay(
        string calldata protocolName,
        address token,
        address user,
        uint256 amount
    ) external {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");

        // Transfer tokens from user to this contract
        console.log("Transferring tokens from user to this contract for repayment", amount);
        IERC20(token).safeTransferFrom(user, address(this), amount);

        // Approve gateway to spend tokens
        console.log("Approving gateway to spend tokens for repayment");
        IERC20(token).approve(address(gateway), amount);

        // Forward repay call to the appropriate gateway
        console.log("Forwarding repay call to the appropriate gateway");
        gateway.repay(token, user, amount);
    }

    function getBalance(
        string calldata protocolName,
        address token,
        address user
    ) external view returns (uint256) {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");

        // Forward balance call to the appropriate gateway
        return gateway.getBalance(token, user);
    }

    function receiveFlashLoanToMoveDebt(
        address user,
        address debtToken,
        uint256 debtAmount,
        Collateral[] memory collaterals,
        string calldata fromProtocol,
        string calldata toProtocol
    ) external {
        // Get the gateway for the specified protocol
        IGateway fromGateway = gateways[fromProtocol];
        IGateway toGateway = gateways[toProtocol];
        require(address(fromGateway) != address(0), "From protocol not supported");
        require(address(toGateway) != address(0), "To protocol not supported");
        
        // Receive flash loan to repay the debt.
        balancerVault.sendTo(debtToken, address(this), debtAmount);
        IERC20(debtToken).approve(address(fromGateway), debtAmount);
        // Repay the debt
        fromGateway.repay(debtToken, user, debtAmount);

        for (uint i = 0; i < collaterals.length; i++) {
            fromGateway.withdrawCollateral(debtToken, collaterals[i].token, address(this), collaterals[i].amount);
            IERC20(collaterals[i].token).approve(address(toGateway), collaterals[i].amount);
            toGateway.deposit(collaterals[i].token, user, collaterals[i].amount);
        }

        toGateway.borrow(debtToken, user, debtAmount);
        IERC20(debtToken).safeTransfer(address(balancerVault), debtAmount);
        balancerVault.settle(debtToken, debtAmount);
    }

    struct Collateral {
        address token;
        uint256 amount;
    }    

    function moveDebt(address user, address debtToken, uint256 debtAmount, Collateral[] memory collaterals, string calldata fromProtocol, string calldata toProtocol) external {
        bytes memory data = abi.encodeWithSelector(this.receiveFlashLoanToMoveDebt.selector, user, debtToken, debtAmount, collaterals, fromProtocol, toProtocol);
        balancerVault.unlock(data);
    }

    function getPossibleCollaterals(
        address token, 
        string calldata protocolName, 
        address user
    ) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getPossibleCollaterals(token, user);
    }
} 