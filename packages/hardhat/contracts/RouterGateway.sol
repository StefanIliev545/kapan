// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IGateway.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/balancer/IVault.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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

contract RouterGateway is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Mapping from protocol name to gateway contract
    mapping(string => IGateway) public gateways;

    IVault public balancerV3Vault;
    IFlashLoanProvider public balancerV2Vault;

    // State variable to track if flash loan is enabled
    bool private flashLoanEnabled;

    constructor(IVault v3vault, IFlashLoanProvider v2Vault, address owner) Ownable(owner) {
        balancerV3Vault = v3vault;
        balancerV2Vault = v2Vault;
    }

    function addGateway(string calldata protocolName, address gateway) external onlyOwner {
        gateways[protocolName] = IGateway(gateway);
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
    ) external nonReentrant {
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
    ) external nonReentrant {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");

        // Transfer tokens from user to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve gateway to spend tokens
        IERC20(token).approve(address(gateway), amount);

        // Forward deposit call to the appropriate gateway
        gateway.deposit(token, user, amount);
    }

    function repay(
        string calldata protocolName,
        address token,
        address user,
        uint256 amount
    ) external nonReentrant {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");

        // Transfer tokens from user to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve gateway to spend tokens
        IERC20(token).approve(address(gateway), amount);

        // Forward repay call to the appropriate gateway
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

        // Repay the debt on the "from" protocol
        {
            console.log("Repaying debt on from protocol");
            IERC20(debtToken).approve(address(fromGateway), debtAmount);
            uint256 borrowBalanceBefore = fromGateway.getBorrowBalanceCurrent(debtToken, user);
            fromGateway.repay(debtToken, user, debtAmount);
            uint256 borrowBalanceAfter = fromGateway.getBorrowBalanceCurrent(debtToken, user);
            require(borrowBalanceAfter < borrowBalanceBefore, "Repayment did not reduce borrow balance");
        }
        // For each collateral asset, withdraw then deposit into the target protocol.
        for (uint i = 0; i < collaterals.length; i++) {
            console.log("Withdrawing collateral from from protocol");
            (address underlyingReceived, uint256 amountReceived) = fromGateway.withdrawCollateral(debtToken, collaterals[i].token, user, collaterals[i].amount);
            console.log("Depositing collateral into to protocol");
            IERC20(underlyingReceived).approve(address(toGateway), amountReceived);
            toGateway.depositCollateral(debtToken, underlyingReceived, amountReceived, user);
        }

        // Borrow the debt on the "to" protocol.
        console.log("Borrowing debt on to protocol");
        toGateway.borrow(debtToken, user, debtAmount);
    }

    /**
     * @notice Modifier to ensure flash loan callbacks can only be triggered internally
     */
    modifier enableFlashLoan() {
        flashLoanEnabled = true;
        _;
        flashLoanEnabled = false;
    }

    /**
     * @notice Modifier to verify flash loan was triggered internally
     */
    modifier flashLoanOnly() {
        require(flashLoanEnabled, "Flash loan not enabled");
        _;
    }

    /**
     * @notice Check if a collateral token is supported in the target protocol
     * @param protocolName The name of the protocol to check
     * @param market The address of the market token
     * @param collateral The address of the collateral token to check
     * @return isSupported Whether the collateral is supported in the protocol
     */
    function isCollateralSupported(
        string calldata protocolName,
        address market,
        address collateral
    ) external view returns (bool isSupported) {
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        
        return gateway.isCollateralSupported(market, collateral);
    }
    
    /**
     * @notice Get all supported collaterals for a specific market in a protocol
     * @param protocolName The name of the protocol to check
     * @param market The address of the market token
     * @return collateralAddresses Array of supported collateral token addresses
     */
    function getSupportedCollaterals(
        string calldata protocolName,
        address market
    ) external view returns (address[] memory collateralAddresses) {
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        
        return gateway.getSupportedCollaterals(market);
    }
    
    /**
     * @notice Check if a collateral can be moved from one protocol to another
     * @param fromProtocol The name of the source protocol
     * @param toProtocol The name of the target protocol
     * @param market The address of the market token
     * @param collateral The address of the collateral token to check
     * @return canMove Whether the collateral can be moved between protocols
     */
    function canMoveCollateral(
        string calldata fromProtocol,
        string calldata toProtocol,
        address market,
        address collateral
    ) external view returns (bool canMove) {
        IGateway fromGateway = gateways[fromProtocol];
        IGateway toGateway = gateways[toProtocol];
        
        require(address(fromGateway) != address(0), "From protocol not supported");
        require(address(toGateway) != address(0), "To protocol not supported");
        
        // Collateral must be supported in both protocols
        return fromGateway.isCollateralSupported(market, collateral) && 
               toGateway.isCollateralSupported(market, collateral);
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
    ) external flashLoanOnly {
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
    ) external flashLoanOnly {
        require(msg.sender == address(balancerV3Vault), "Unauthorized flash loan provider");

        // Send the debt token to this contract.
        balancerV3Vault.sendTo(debtToken, address(this), debtAmount);

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
    ) external nonReentrant enableFlashLoan {
        require(debtAmount > 0, "Debt amount must be greater than zero");
        require(user == msg.sender, "User must be the caller");

        if (repayAll) {
            IGateway fromGateway = gateways[fromProtocol];
            require(address(fromGateway) != address(0), "From protocol not supported");
            debtAmount = fromGateway.getBorrowBalanceCurrent(debtToken, user);
        }

        if (keccak256(bytes(flashLoanVersion)) == keccak256(bytes("v2"))) {
            bytes memory data = abi.encode(user, debtToken, debtAmount, collaterals, fromProtocol, toProtocol);
            IERC20[] memory tokens = new IERC20[](1);
            tokens[0] = IERC20(debtToken);
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = debtAmount;
            balancerV2Vault.flashLoan(address(this), tokens, amounts, data);
        } else if (keccak256(bytes(flashLoanVersion)) == keccak256(bytes("v3"))) {
            bytes memory data = abi.encodeWithSelector(
                this.receiveFlashLoanV3.selector,
                user,
                debtToken,
                debtAmount,
                collaterals,
                fromProtocol,
                toProtocol
            );
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
        console.log("getPossibleCollaterals", protocolName);
        return gateway.getPossibleCollaterals(token, user);
    }

    function getEncodedDebtApproval(string calldata protocolName, address debtToken, uint256 debtAmount, address user) external view returns (address[] memory, bytes[] memory) {
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        return gateway.getEncodedDebtApproval(debtToken, debtAmount, user);
    }

    /**
     * @notice Get approvals for collateral movement from source protocol
     * @param debtToken The token being borrowed
     * @param collaterals The collaterals being moved
     * @param fromProtocol The protocol moving from 
     * @return Array of target addresses and encoded function call data
     */
    function getFromProtocolApprovalsForMove(
        address debtToken, 
        IGateway.Collateral[] calldata collaterals, 
        string calldata fromProtocol
    ) external view returns (address[] memory, bytes[] memory) {
        IGateway fromGateway = gateways[fromProtocol];
        require(address(fromGateway) != address(0), "From protocol not supported");
        return fromGateway.getEncodedCollateralApprovals(debtToken, collaterals);
    }
    
    /**
     * @notice Get inbound collateral actions from destination protocol
     * @param debtToken The token being borrowed
     * @param collaterals The collaterals being moved
     * @param toProtocol The protocol moving to
     * @return Array of target addresses and encoded function call data
     */
    function getToProtocolInboundActions(
        address debtToken, 
        IGateway.Collateral[] calldata collaterals, 
        string calldata toProtocol
    ) external view returns (address[] memory, bytes[] memory) {
        IGateway toGateway = gateways[toProtocol];
        require(address(toGateway) != address(0), "To protocol not supported");
        return toGateway.getInboundCollateralActions(debtToken, collaterals);
    }

    function getToProtocolApprovalsForMove(
        address debtToken,
        uint256 debtAmount,
        string calldata toProtocol,
        address user
    ) external view returns (address[] memory, bytes[] memory) {
        // For the destination protocol, we need to get debt approval
        IGateway toGateway = gateways[toProtocol];
        require(address(toGateway) != address(0), "Protocol not supported");
        
        return toGateway.getEncodedDebtApproval(debtToken, debtAmount, user);
    }

    /**
     * @notice Get the balance of a token in a flash loan provider
     * @param token The token address to check balance for
     * @param flashLoanVersion The flash loan provider version ("v2" or "v3")
     * @return The token balance in the flash loan provider
     */
    function getFlashLoanProviderBalance(address token, string calldata flashLoanVersion) external view returns (uint256) {
        if (keccak256(bytes(flashLoanVersion)) == keccak256(bytes("v2"))) {
            return IERC20(token).balanceOf(address(balancerV2Vault));
        } else if (keccak256(bytes(flashLoanVersion)) == keccak256(bytes("v3"))) {
            return IERC20(token).balanceOf(address(balancerV3Vault));
        } else {
            revert("Unsupported flash loan version");
        }
    }

    /**
     * @notice Borrow tokens from a protocol
     * @param protocolName The name of the protocol to borrow from
     * @param token The token to borrow
     * @param user The user to borrow for
     * @param amount The amount to borrow
     */
    function borrow(
        string calldata protocolName,
        address token,
        address user,
        uint256 amount
    ) external nonReentrant {
        // Get the gateway for the specified protocol
        IGateway gateway = gateways[protocolName];
        require(address(gateway) != address(0), "Protocol not supported");
        require(user == msg.sender, "Can only borrow for yourself");

        // Forward borrow call to the appropriate gateway
        gateway.borrow(token, user, amount);

        // Transfer borrowed tokens to the user
        IERC20(token).safeTransfer(user, amount);
    }
} 