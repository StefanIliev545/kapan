// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IMorphoBlue, IMorphoFlashLoanCallback } from "../interfaces/morpho/IMorphoBlue.sol";

/**
 * @title KapanCowAdapter
 * @notice Adapter contract that integrates Kapan with CoW Protocol's FlashLoanRouter
 * @dev Implements IBorrower interface for CoW and handles flash loans from:
 *      - Morpho Blue (0% fee - RECOMMENDED)
 *      - Balancer V2 (0% fee - wide token support)
 *      - Aave V3 (0.05% fee - fallback)
 * 
 * Flow:
 * 1. FlashLoanRouter calls flashLoanAndCallBack()
 * 2. We request flash loan from Morpho, Balancer, or Aave
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

// Balancer V2 Vault interface
interface IBalancerV2Vault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

// Balancer V3 Vault interface
interface IBalancerV3Vault {
    function unlock(bytes calldata data) external returns (bytes memory result);
    function sendTo(address token, address to, uint256 amount) external;
    function settle(address token, uint256 amount) external returns (uint256 credit);
}

// Custom errors
error OnlyRouter();
error OnlySettlement();
error OnlyDuringSettlement();
error InvalidLender();
error FlashLoanInProgress();
error UnauthorizedCaller();
error NotInFlashLoan();

/// @notice Lender type for routing flash loan requests
enum LenderType {
    Unknown,
    Aave,
    Morpho,
    BalancerV2,
    BalancerV3
}

/**
 * @title KapanCowAdapter
 * @notice Bridges Kapan's OrderManager with CoW Protocol's flash loan system
 * @dev Supports Morpho Blue (0% fee), Balancer V2 (0% fee), and Aave V3 (0.05% fee)
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
    event OrderFunded(address indexed user, bytes32 indexed salt, address indexed token, address recipient, uint256 amount);
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

    /// @notice Add or remove an allowed Balancer V2 lender
    function setBalancerV2Lender(address lender, bool allowed) external onlyOwner {
        allowedLenders[lender] = allowed;
        lenderTypes[lender] = allowed ? LenderType.BalancerV2 : LenderType.Unknown;
        emit LenderUpdated(lender, allowed, LenderType.BalancerV2);
    }

    /// @notice Add or remove an allowed Balancer V3 lender
    function setBalancerV3Lender(address lender, bool allowed) external onlyOwner {
        allowedLenders[lender] = allowed;
        lenderTypes[lender] = allowed ? LenderType.BalancerV3 : LenderType.Unknown;
        emit LenderUpdated(lender, allowed, LenderType.BalancerV3);
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
        if (!allowedLenders[lender]) revert InvalidLender();
        if (_inFlashLoan) revert FlashLoanInProgress();

        _flashLoanToken = address(token);
        _currentLender = lender;

        LenderType lenderType = lenderTypes[lender];
        emit FlashLoanRequested(lender, address(token), amount, lenderType);

        if (lenderType == LenderType.Morpho) {
            // Request flash loan from Morpho Blue (0% fee!)
            IMorphoBlue(lender).flashLoan(
                address(token),
                amount,
                abi.encode(callbackData) // Pass router callback data
            );
        } else if (lenderType == LenderType.BalancerV2) {
            // Request flash loan from Balancer V2 (0% fee!)
            IERC20[] memory tokens = new IERC20[](1);
            tokens[0] = token;
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = amount;
            IBalancerV2Vault(lender).flashLoan(
                address(this),
                tokens,
                amounts,
                callbackData
            );
        } else if (lenderType == LenderType.BalancerV3) {
            // Request flash loan from Balancer V3 (0% fee!)
            // V3 uses unlock pattern - encode token, amount, and callbackData
            bytes memory userData = abi.encode(address(token), amount, callbackData);
            IBalancerV3Vault(lender).unlock(
                abi.encodeWithSelector(this.receiveFlashLoanV3.selector, userData)
            );
        } else {
            // Request flash loan from Aave (0.05% fee)
            IAaveV3Pool(lender).flashLoanSimple(
                address(this),
                address(token),
                amount,
                callbackData,
                0
            );
        }
    }

    // ============ Morpho Callback ============

    /// @notice Called by Morpho Blue after flash loan tokens are sent
    /// @param assets The borrowed amount
    /// @param data Encoded callbackData for router
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        // Validate caller is the expected Morpho lender
        if (msg.sender != _currentLender) revert UnauthorizedCaller();
        if (lenderTypes[msg.sender] != LenderType.Morpho) revert InvalidLender();

        // Decode the router callback data
        bytes memory callbackData = abi.decode(data, (bytes));

        // Mark that we're in flash loan context
        _inFlashLoan = true;

        // Pre-approve Morpho to pull repayment (0% fee, so repayment = assets)
        IERC20(_flashLoanToken).forceApprove(msg.sender, assets);

        // Call back to FlashLoanRouter to proceed with settlement
        router.borrowerCallBack(callbackData);

        // Settlement complete, clean up
        _inFlashLoan = false;
        _flashLoanToken = address(0);
        _currentLender = address(0);
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

    // ============ Balancer V2 Callback ============

    /// @notice Called by Balancer V2 Vault after flash loan tokens are sent
    /// @param tokens Array of tokens borrowed (we only use single token)
    /// @param amounts Array of amounts borrowed
    /// @param feeAmounts Array of fee amounts (0 for Balancer)
    /// @param userData Encoded callbackData for router
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external {
        // Validate caller is the expected Balancer lender
        if (msg.sender != _currentLender) revert UnauthorizedCaller();
        if (lenderTypes[msg.sender] != LenderType.BalancerV2) revert InvalidLender();

        // Mark that we're in flash loan context
        _inFlashLoan = true;

        // Call back to FlashLoanRouter to proceed with settlement
        router.borrowerCallBack(userData);

        // Repay flash loan (Balancer requires direct transfer back, no approval)
        uint256 repayment = amounts[0] + feeAmounts[0];
        IERC20(address(tokens[0])).safeTransfer(msg.sender, repayment);

        // Settlement complete, clean up
        _inFlashLoan = false;
        _flashLoanToken = address(0);
        _currentLender = address(0);
    }

    // ============ Balancer V3 Callback ============

    /// @notice Called by Balancer V3 Vault via unlock() pattern
    /// @dev V3 uses a different flow: unlock() -> sendTo() to receive -> settle() to repay
    /// @param userData Encoded (token, amount, callbackData)
    function receiveFlashLoanV3(bytes calldata userData) external {
        // Validate caller is the expected Balancer V3 lender
        if (msg.sender != _currentLender) revert UnauthorizedCaller();
        if (lenderTypes[msg.sender] != LenderType.BalancerV3) revert InvalidLender();

        // Decode userData
        (address token, uint256 amount, bytes memory callbackData) = 
            abi.decode(userData, (address, uint256, bytes));

        // Request tokens from V3 vault
        IBalancerV3Vault(msg.sender).sendTo(token, address(this), amount);

        // Mark that we're in flash loan context
        _inFlashLoan = true;

        // Call back to FlashLoanRouter to proceed with settlement
        router.borrowerCallBack(callbackData);

        // Repay flash loan (V3 requires transfer + settle)
        IERC20(token).safeTransfer(msg.sender, amount);
        IBalancerV3Vault(msg.sender).settle(token, amount);

        // Settlement complete, clean up
        _inFlashLoan = false;
        _flashLoanToken = address(0);
        _currentLender = address(0);
    }

    /// @notice Approve a target to spend tokens (standard IBorrower function)
    /// @dev Only callable by Settlement contract
    function approve(IERC20 token, address target, uint256 amount) external onlySettlement {
        token.forceApprove(target, amount);
    }

    // ============ Hook Functions (called via HooksTrampoline) ============

    /// @notice Transfer flash-loaned tokens to the order recipient (OrderManager)
    /// @dev Called in pre-hook to fund the order before swap execution.
    ///      Security note: HooksTrampoline is only callable by Settlement contract,
    ///      so this can only be called during a valid settlement transaction.
    /// @param user The order owner (for event logging)
    /// @param salt The order salt (for event logging)
    /// @param token The token to transfer
    /// @param recipient The recipient (typically OrderManager)
    /// @param amount The amount to transfer
    function fundOrderBySalt(
        address user,
        bytes32 salt,
        address token,
        address recipient,
        uint256 amount
    ) external {
        IERC20(token).safeTransfer(recipient, amount);
        emit OrderFunded(user, salt, token, recipient, amount);
    }

    /// @notice Transfer entire token balance to the order recipient (OrderManager)
    /// @dev For conditional orders where amounts are dynamic. Transfers whatever
    ///      flash loan amount was received, regardless of what was encoded in appData.
    /// @param user The order owner (for event logging)
    /// @param salt The order salt (for event logging)
    /// @param token The token to transfer
    /// @param recipient The recipient (typically OrderManager)
    function fundOrderWithBalance(
        address user,
        bytes32 salt,
        address token,
        address recipient
    ) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(recipient, balance);
            emit OrderFunded(user, salt, token, recipient, balance);
        }
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
