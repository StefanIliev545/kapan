// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IGateway.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/balancer/IVault.sol";

import "hardhat/console.sol";

// Interface for a v2–style flash loan provider (e.g. Balancer v2)
interface IFlashLoanProvider {
    function flashLoan(
        address receiver,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}

contract RouterGateway {
    using SafeERC20 for IERC20;

    // Mapping from protocol name to gateway contract
    mapping(string => IGateway) public gateways;
    IVault public balancerV3Vault;
    IFlashLoanProvider public balancerV2Vault;
    constructor(address aaveGateway, address compoundGateway, IVault v3vault, IFlashLoanProvider v2Vault) {
        gateways["aave"] = IGateway(aaveGateway);
        gateways["compound"] = IGateway(compoundGateway);
        gateways["compound v3"] = IGateway(compoundGateway);
        gateways["aave v3"] = IGateway(aaveGateway);
        balancerV3Vault = v3vault;
        balancerV2Vault = v2Vault;
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

    function getBorrowBalance(
        string calldata protocolName,
        address token,
        address user
    ) external view returns (uint256) {
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getBorrowBalance(token, user);
    }
    
    // -------------------------------------------------------------------------
    // Common Debt Moving Logic (Flash Loan–agnostic)
    // -------------------------------------------------------------------------
    //
    // This internal function is completely unaware of any flash loan details.
    // It simply moves debt from one protocol to another:
    // 1. Repays the debt on the "from" protocol.
    // 2. Withdraws collateral from the "from" protocol.
    // 3. Deposits collateral into the "to" protocol.
    // 4. Borrows the same amount on the "to" protocol.
    //
    function _moveDebtCommon(
        address user,
        address debtToken,
        uint256 debtAmount,
        IGateway.Collateral[] memory collaterals,
        string memory fromProtocol,
        string memory toProtocol
    ) internal {
        IGateway fromGateway = gateways[fromProtocol];
        IGateway toGateway = gateways[toProtocol];
        require(address(fromGateway) != address(0), "From protocol not supported");
        require(address(toGateway) != address(0), "To protocol not supported");

        // Debug logs for debt amounts
        uint256 actualBorrowBalance = fromGateway.getBorrowBalance(debtToken, user);
        console.log("Actual borrow balance:", actualBorrowBalance);
        console.log("Requested debt amount to move:", debtAmount);
        require(debtAmount <= actualBorrowBalance, "Debt amount exceeds borrow balance");

        // Repay the debt on the "from" protocol
        IERC20(debtToken).approve(address(fromGateway), debtAmount);
        console.log("Repaying debt on the from protocol");
        uint256 borrowBalanceBefore = fromGateway.getBorrowBalance(debtToken, user);
        console.log("Borrow balance before repayment:", borrowBalanceBefore);
        fromGateway.repay(debtToken, user, debtAmount);
        uint256 borrowBalanceAfter = fromGateway.getBorrowBalance(debtToken, user);
        console.log("Borrow balance after repayment:", borrowBalanceAfter);
        require(borrowBalanceAfter < borrowBalanceBefore, "Repayment did not reduce borrow balance");

        // For each collateral asset, withdraw then deposit into the target protocol.
        for (uint i = 0; i < collaterals.length; i++) {
            console.log("Withdrawing collateral from the from protocol");
            fromGateway.withdrawCollateral(debtToken, collaterals[i].token, user, collaterals[i].amount);
            console.log("Approving collateral to the to protocol");
            IERC20(collaterals[i].token).approve(address(toGateway), collaterals[i].amount);
            console.log("Depositing collateral into the to protocol");
            toGateway.deposit(collaterals[i].token, user, collaterals[i].amount);
        }

        // Borrow the debt on the "to" protocol.
        console.log("Borrowing debt on the to protocol");
        toGateway.borrow(debtToken, user, debtAmount);
    }

    // -------------------------------------------------------------------------
    // Flash Loan Wrapper for Balancer V2
    // -------------------------------------------------------------------------
    //
    // In a Balancer v2 flash loan the tokens are transferred (or "pulled") into this
    // contract as soon as they are approved. This function decodes the userData,
    // calls the common debt move function, then repays the principal plus fee.
    //
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external {
        require(msg.sender == address(balancerV2Vault), "Unauthorized flash loan provider");

        // Decode userData to extract move debt parameters.
        (
            address user,
            address debtToken,
            uint256 debtAmount,
            IGateway.Collateral[] memory collaterals,
            string memory fromProtocol,
            string memory toProtocol
        ) = abi.decode(userData, (address, address, uint256, IGateway.Collateral[], string, string));

        console.log("Balancer V2 flash loan callback received");
        require(feeAmounts.length == 1, "Balancer V2 flash loan fee amount length mismatch");
        require(feeAmounts[0] == 0, "Flash loans are free");

        // Execute the common debt move logic.
        _moveDebtCommon(user, debtToken, debtAmount, collaterals, fromProtocol, toProtocol);

        // Repay the flash loan provider (principal + fee).
        uint256 totalRepayment = debtAmount + feeAmounts[0];
        IERC20(debtToken).safeTransfer(address(balancerV2Vault), totalRepayment);
    }

    // -------------------------------------------------------------------------
    // Flash Loan Wrapper for Balancer V3
    // -------------------------------------------------------------------------
    //
    // For Balancer v3, tokens are delivered via a call to sendTo.
    // This wrapper assumes that the tokens have been sent before the call.
    // After calling the common move debt function, it repays the flash loan,
    // then calls settle if required.
    //
    function receiveFlashLoanV3(
        address user,
        address debtToken,
        uint256 debtAmount,
        IGateway.Collateral[] memory collaterals,
        string calldata fromProtocol,
        string calldata toProtocol
    ) external {
        require(msg.sender == address(balancerV3Vault), "Unauthorized flash loan provider");

        console.log("Balancer V3 flash loan callback received");

        // Execute the common debt move logic.
        _moveDebtCommon(user, debtToken, debtAmount, collaterals, fromProtocol, toProtocol);

        // Repay the flash loan provider (principal only, assuming no fee).
        IERC20(debtToken).safeTransfer(address(balancerV3Vault), debtAmount);

        // Optionally settle the flash loan if required by the provider.
        balancerV3Vault.settle(debtToken, debtAmount);
    }


   // -------------------------------------------------------------------------
    // moveDebt: Supports both flash loan providers
    // -------------------------------------------------------------------------
    //
    // The caller provides the flashLoanVersion ("v2" or "v3").
    // Based on this parameter, the function encodes the debt move parameters
    // appropriately and calls either the v2 flashLoan function or the v3 unlock function.
    //
    function moveDebt(
        address user,
        address debtToken,
        uint256 debtAmount,
        bool repayAll,
        IGateway.Collateral[] memory collaterals,
        string calldata fromProtocol,
        string calldata toProtocol,
        string calldata flashLoanVersion
    ) external {
        if (repayAll) {
            IGateway fromGateway = gateways[fromProtocol];
            require(address(fromGateway) != address(0), "From protocol not supported");
            debtAmount = fromGateway.getBorrowBalance(debtToken, user);
        }

        if (keccak256(bytes(flashLoanVersion)) == keccak256(bytes("v2"))) {
            // For Balancer v2, encode parameters without function selector.
            bytes memory data = abi.encode(user, debtToken, debtAmount, collaterals, fromProtocol, toProtocol);
            IERC20[] memory tokens = new IERC20[](1);
            tokens[0] = IERC20(debtToken);
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = debtAmount;
            console.log("Requesting Balancer V2 flash loan");
            balancerV2Vault.flashLoan(address(this), tokens, amounts, data);
        } else if (keccak256(bytes(flashLoanVersion)) == keccak256(bytes("v3"))) {
            // For Balancer v3, encode parameters with the function selector.
            bytes memory data = abi.encodeWithSelector(
                this.receiveFlashLoanV3.selector,
                user,
                debtToken,
                debtAmount,
                collaterals,
                fromProtocol,
                toProtocol
            );
            console.log("Requesting Balancer V3 flash loan");
            IVault(address(balancerV3Vault)).unlock(data);
        } else {
            revert("Unsupported flash loan version");
        }
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