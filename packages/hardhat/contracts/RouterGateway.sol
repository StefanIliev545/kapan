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
        IGateway.Collateral[] memory collaterals,
        string calldata fromProtocol,
        string calldata toProtocol
    ) external {
        console.log("Received flash loan to move debt");
        // Get the gateway for the specified protocol
        IGateway fromGateway = gateways[fromProtocol];
        IGateway toGateway = gateways[toProtocol];
        require(address(fromGateway) != address(0), "From protocol not supported");
        require(address(toGateway) != address(0), "To protocol not supported");
        
        // Receive flash loan to repay the debt.
        console.log("Receiving flash loan to repay the debt");
        balancerVault.sendTo(debtToken, address(this), debtAmount);
        console.log("Flash loan received");
        IERC20(debtToken).approve(address(fromGateway), debtAmount);
        // Repay the debt
        console.log("Repaying the debt");
        fromGateway.repay(debtToken, user, debtAmount);

        for (uint i = 0; i < collaterals.length; i++) {
            console.log("Withdrawing collateral");
            fromGateway.withdrawCollateral(debtToken, collaterals[i].token, address(this), collaterals[i].amount);
            console.log("Approving collateral");
            IERC20(collaterals[i].token).approve(address(toGateway), collaterals[i].amount);
            console.log("Depositing collateral");
            toGateway.deposit(collaterals[i].token, user, collaterals[i].amount);
        }
        console.log("Borrowing the debt");
        toGateway.borrow(debtToken, user, debtAmount);
        console.log("Transferring the debt to the balancer vault");
        IERC20(debtToken).safeTransfer(address(balancerVault), debtAmount);
        console.log("Settingtling the debt");
        balancerVault.settle(debtToken, debtAmount);
    }

    function moveDebt(address user, address debtToken, uint256 debtAmount, IGateway.Collateral[] memory collaterals, string calldata fromProtocol, string calldata toProtocol) external {
        bytes memory data = abi.encodeWithSelector(this.receiveFlashLoanToMoveDebt.selector, user, debtToken, debtAmount, collaterals, fromProtocol, toProtocol);
        console.log("Requesting flash loan");
        balancerVault.unlock(data);
        console.log("Flash loan requested");
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

    function getFromProtocolApprovalsForMove(address debtToken, IGateway.Collateral[] calldata collaterals, string calldata fromProtocol) external view returns (address[] memory, bytes[] memory) {
        IGateway fromGateway = gateways[fromProtocol];
        require(address(fromGateway) != address(0), "From protocol not supported");
        (address[] memory fromTarget, bytes[] memory fromData) = fromGateway.getEncodedCollateralApprovals(debtToken, collaterals);
        return (fromTarget, fromData);
    }

    function getToProtocolApprovalsForMove(address debtToken, uint256 debtAmount, string calldata toProtocol) external view returns (address[] memory, bytes[] memory) {
        IGateway toGateway = gateways[toProtocol];
        require(address(toGateway) != address(0), "To protocol not supported");
        (address[] memory toTarget, bytes[] memory toData) = toGateway.getEncodedDebtApproval(debtToken, debtAmount);
        return (toTarget, toData);
    }
} 