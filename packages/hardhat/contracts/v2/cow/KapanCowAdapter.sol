// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IMorphoBlue, IMorphoFlashLoanCallback } from "../interfaces/morpho/IMorphoBlue.sol";

import "hardhat/console.sol";

/**
 * @title KapanCowAdapter
 * @notice Adapter contract that integrates Kapan with CoW Protocol's FlashLoanRouter
 * @dev Implements IBorrower interface for CoW and handles flash loans from:
 *      - Morpho Blue (0% fee - RECOMMENDED)
 *      - Aave V3 (0.05% fee - fallback)
 * 
 * Flow:
 * 1. FlashLoanRouter calls flashLoanAndCallBack()
 * 2. We request flash loan from Morpho or Aave
 * 3. Lender sends tokens here and calls our callback
 * 4. We call router.borrowerCallBack() to proceed with settlement
 * 5. Settlement executes:
 *    - Pre-hook: fundOrder() moves tokens to OrderManager
 *    - Trade: VaultRelayer pulls from OrderManager
 *    - Post-hook: OrderManager deposits/borrows, sends repayment here
 * 6. Settlement returns, flash loan repays from this contract
 */

// CoW Protocol interfaces
interface IFlashLoanRouter {
    function borrowerCallBack(bytes calldata callbackData) external;
    function settlementContract() external view returns (address);
}

// Aave V3 interface
interface IAaveV3Pool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

// Custom errors
error OnlyRouter();
error OnlySettlement();
error OnlyDuringSettlement();
error InvalidLender();
error FlashLoanInProgress();
error UnauthorizedCaller();

/// @notice Lender type for routing flash loan requests
enum LenderType {
    Unknown,
    Aave,
    Morpho
}

/**
 * @title KapanCowAdapter
 * @notice Bridges Kapan's OrderManager with CoW Protocol's flash loan system
 * @dev Supports both Morpho Blue (0% fee) and Aave V3 (0.05% fee)
 */
contract KapanCowAdapter is Ownable, IMorphoFlashLoanCallback {
    using SafeERC20 for IERC20;

    // ============ Immutables ============
    
    /// @notice CoW Protocol's FlashLoanRouter
    IFlashLoanRouter public immutable router;
    
    /// @notice CoW Protocol's Settlement contract
    address public immutable settlementContract;

    // ============ State ============
    
    /// @notice Tracks if we're currently in a flash loan callback
    bool private _inFlashLoan;
    
    /// @notice The token being flash loaned
    address private _flashLoanToken;
    
    /// @notice The lender we're borrowing from (for callback validation)
    address private _currentLender;

    /// @notice Mapping of lender address => LenderType
    mapping(address => LenderType) public lenderTypes;
    
    /// @notice Mapping of allowed lenders
    mapping(address => bool) public allowedLenders;

    // ============ Events ============
    
    event FlashLoanRequested(address indexed lender, address indexed token, uint256 amount, LenderType lenderType);
    event OrderFunded(address indexed token, address indexed recipient, uint256 amount);
    event LenderUpdated(address indexed lender, bool allowed, LenderType lenderType);

    // ============ Modifiers ============

    modifier onlyRouter() {
        if (msg.sender != address(router)) revert OnlyRouter();
        _;
    }

    modifier onlySettlement() {
        if (msg.sender != settlementContract) revert OnlySettlement();
        _;
    }

    modifier duringSettlement() {
        if (!_inFlashLoan) revert OnlyDuringSettlement();
        _;
    }

    // ============ Constructor ============

    constructor(
        address _router,
        address _owner
    ) Ownable(_owner) {
        router = IFlashLoanRouter(_router);
        settlementContract = router.settlementContract();
    }

    // ============ Admin Functions ============

    /// @notice Add or remove an allowed Aave lender
    function setAaveLender(address lender, bool allowed) external onlyOwner {
        allowedLenders[lender] = allowed;
        lenderTypes[lender] = allowed ? LenderType.Aave : LenderType.Unknown;
        emit LenderUpdated(lender, allowed, LenderType.Aave);
    }

    /// @notice Add or remove an allowed Morpho lender
    function setMorphoLender(address lender, bool allowed) external onlyOwner {
        allowedLenders[lender] = allowed;
        lenderTypes[lender] = allowed ? LenderType.Morpho : LenderType.Unknown;
        emit LenderUpdated(lender, allowed, LenderType.Morpho);
    }

    /// @notice Legacy function for backwards compatibility (defaults to Aave)
    function setLender(address lender, bool allowed) external onlyOwner {
        allowedLenders[lender] = allowed;
        lenderTypes[lender] = allowed ? LenderType.Aave : LenderType.Unknown;
        emit LenderUpdated(lender, allowed, LenderType.Aave);
    }

    // ============ IBorrower Interface ============

    /// @notice Called by FlashLoanRouter to initiate flash loan
    /// @param lender The flash loan provider (Morpho or Aave pool)
    /// @param token The token to borrow
    /// @param amount The amount to borrow
    /// @param callbackData Data to pass back to router after receiving loan
    function flashLoanAndCallBack(
        address lender,
        IERC20 token,
        uint256 amount,
        bytes calldata callbackData
    ) external onlyRouter {
        console.log("flashLoanAndCallBack: START");
        console.log("flashLoanAndCallBack: lender =", lender);
        console.log("flashLoanAndCallBack: amount =", amount);
        
        if (!allowedLenders[lender]) revert InvalidLender();
        if (_inFlashLoan) revert FlashLoanInProgress();

        _flashLoanToken = address(token);
        _currentLender = lender;

        LenderType lenderType = lenderTypes[lender];
        emit FlashLoanRequested(lender, address(token), amount, lenderType);

        if (lenderType == LenderType.Morpho) {
            console.log("flashLoanAndCallBack: calling Morpho.flashLoan");
            // Request flash loan from Morpho Blue (0% fee!)
            IMorphoBlue(lender).flashLoan(
                address(token),
                amount,
                abi.encode(callbackData) // Pass router callback data
            );
            console.log("flashLoanAndCallBack: Morpho.flashLoan returned SUCCESS");
        } else {
            console.log("flashLoanAndCallBack: calling Aave.flashLoanSimple");
            // Request flash loan from Aave (0.05% fee)
            IAaveV3Pool(lender).flashLoanSimple(
                address(this),
                address(token),
                amount,
                callbackData,
                0
            );
            console.log("flashLoanAndCallBack: Aave.flashLoanSimple returned SUCCESS");
        }
    }

    // ============ Morpho Callback ============

    /// @notice Called by Morpho Blue after flash loan tokens are sent
    /// @param assets The borrowed amount
    /// @param data Encoded callbackData for router
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        console.log("onMorphoFlashLoan: START");
        console.log("onMorphoFlashLoan: assets =", assets);
        
        // Validate caller is the expected Morpho lender
        if (msg.sender != _currentLender) revert UnauthorizedCaller();
        if (lenderTypes[msg.sender] != LenderType.Morpho) revert InvalidLender();

        // Decode the router callback data
        bytes memory callbackData = abi.decode(data, (bytes));

        // Mark that we're in flash loan context
        _inFlashLoan = true;

        // Pre-approve Morpho to pull repayment (0% fee, so repayment = assets)
        IERC20(_flashLoanToken).forceApprove(msg.sender, assets);
        console.log("onMorphoFlashLoan: approved Morpho for repayment");

        // Call back to FlashLoanRouter to proceed with settlement
        console.log("onMorphoFlashLoan: calling router.borrowerCallBack");
        router.borrowerCallBack(callbackData);
        console.log("onMorphoFlashLoan: borrowerCallBack returned");

        // Check balance before cleanup
        uint256 balance = IERC20(_flashLoanToken).balanceOf(address(this));
        console.log("onMorphoFlashLoan: adapter balance after callback =", balance);

        // Settlement complete, clean up
        _inFlashLoan = false;
        _flashLoanToken = address(0);
        _currentLender = address(0);
        console.log("onMorphoFlashLoan: COMPLETE - Morpho will now pull repayment");
    }

    // ============ Aave Callback ============

    /// @notice Called by Aave after flash loan tokens are sent
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        // Validate caller is the expected Aave lender
        if (msg.sender != _currentLender) revert UnauthorizedCaller();
        if (lenderTypes[msg.sender] != LenderType.Aave) revert InvalidLender();
        if (initiator != address(this)) revert UnauthorizedCaller();

        // Mark that we're in flash loan context
        _inFlashLoan = true;

        // Pre-approve Aave to pull repayment
        uint256 repayment = amount + premium;
        IERC20(asset).forceApprove(msg.sender, repayment);

        // Call back to FlashLoanRouter to proceed with settlement
        router.borrowerCallBack(params);

        // Settlement complete, clean up
        _inFlashLoan = false;
        _flashLoanToken = address(0);
        _currentLender = address(0);

        return true;
    }

    /// @notice Approve a target to spend tokens (standard IBorrower function)
    /// @dev Only callable by Settlement contract
    function approve(IERC20 token, address target, uint256 amount) external onlySettlement {
        token.forceApprove(target, amount);
    }

    // ============ Hook Functions (called via HooksTrampoline) ============

    /// @notice Transfer flash-loaned tokens to the order recipient (OrderManager)
    /// @dev Called in pre-hook to fund the order. No access control to allow
    ///      balance simulation during order validation (adapter should be empty outside flash loans)
    function fundOrder(
        address token,
        address recipient,
        uint256 amount
    ) external {
        console.log("fundOrder: START");
        console.log("fundOrder: amount =", amount);
        console.log("fundOrder: recipient =", recipient);
        uint256 balance = IERC20(token).balanceOf(address(this));
        console.log("fundOrder: adapter balance =", balance);
        
        IERC20(token).safeTransfer(recipient, amount);
        emit OrderFunded(token, recipient, amount);
        console.log("fundOrder: COMPLETE");
    }

    // ============ View Functions ============

    function getRouter() external view returns (address) {
        return address(router);
    }

    function getSettlementContract() external view returns (address) {
        return settlementContract;
    }

    function isInFlashLoan() external view returns (bool) {
        return _inFlashLoan;
    }

    function getLenderType(address lender) external view returns (LenderType) {
        return lenderTypes[lender];
    }

    // ============ Emergency Functions ============

    /// @notice Rescue tokens accidentally sent to this contract
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (_inFlashLoan) revert FlashLoanInProgress();
        IERC20(token).safeTransfer(to, amount);
    }
}
