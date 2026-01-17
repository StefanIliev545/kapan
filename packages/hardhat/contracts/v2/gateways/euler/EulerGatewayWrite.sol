// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { IEVC } from "../../interfaces/euler/IEVC.sol";
import { IEulerVault } from "../../interfaces/euler/IEulerVault.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EulerGatewayWrite
 * @notice Gateway for Euler V2 lending protocol
 * @dev Euler V2 uses vault-based architecture with EVC (Ethereum Vault Connector)
 *
 * Context encoding for LendingInstruction:
 *   - bytes context = abi.encode(address borrowVault, address collateralVault, uint8 subAccountIndex)
 *   - borrowVault: The vault to borrow from (becomes controller)
 *   - collateralVault: The vault where collateral is deposited
 *   - subAccountIndex: Sub-account index (0-255)
 *
 * Sub-Account Model:
 *   - Each user has 256 possible sub-accounts (index 0-255)
 *   - Sub-account address = (userAddress & 0xFF...FF00) | subAccountIndex
 *   - Each sub-account can have at most 1 controller (debt) + N collaterals
 *   - User's "main" account has index = last byte of their wallet address
 *     (e.g., wallet 0x...a3 → main account is index 163)
 *
 * EVC Authorization Model:
 *   - Users must enable collateral vaults via EVC before they can back debt
 *   - Users must enable controller (borrow vault) before borrowing
 *   - Gateway uses operator authorization to act on behalf of users/sub-accounts
 */
contract EulerGatewayWrite is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The Ethereum Vault Connector (EVC) singleton
    IEVC public immutable evc;

    error ZeroAddress();
    error InvalidContext();
    error UnsupportedOperation();

    constructor(
        address router,
        address owner_,
        address evc_
    ) ProtocolGateway(router) Ownable(owner_) {
        if (evc_ == address(0)) revert ZeroAddress();
        evc = IEVC(evc_);
    }

    // ============ IGateway Implementation ============

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        (address borrowVault, address[] memory collateralVaults, uint8 subAccountIndex) = _decodeContext(ins.context);

        // Derive sub-account address from user + index
        address subAccount = _getSubAccount(ins.user, subAccountIndex);

        // Resolve amount from input if referenced
        uint256 amount = ins.input.index < inputs.length ? inputs[ins.input.index].amount : ins.amount;

        // For single-vault operations, use the first collateral vault
        address collateralVault = collateralVaults.length > 0 ? collateralVaults[0] : address(0);
        return _dispatch(ins.op, borrowVault, collateralVault, amount, subAccount);
    }

    function _dispatch(
        ProtocolTypes.LendingOp op,
        address borrowVault,
        address collateralVault,
        uint256 amount,
        address subAccount
    ) internal returns (ProtocolTypes.Output[] memory) {
        // Deposit operations - no output
        if (op == ProtocolTypes.LendingOp.DepositCollateral) {
            _depositCollateral(collateralVault, amount, subAccount);
            return _noOutput();
        }

        // Collateral operations - output collateral token
        if (op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            address token = IEulerVault(collateralVault).asset();
            return _output(token, _withdrawCollateral(collateralVault, amount, subAccount));
        }
        if (op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            address token = IEulerVault(collateralVault).asset();
            return _output(token, _getSupplyBalance(collateralVault, subAccount));
        }

        // Borrow operations - output loan token
        if (op == ProtocolTypes.LendingOp.Borrow) {
            address token = IEulerVault(borrowVault).asset();
            return _output(token, _borrow(borrowVault, amount, subAccount));
        }
        if (op == ProtocolTypes.LendingOp.Repay) {
            address token = IEulerVault(borrowVault).asset();
            return _output(token, _repay(borrowVault, amount, subAccount));
        }
        if (op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            address token = IEulerVault(borrowVault).asset();
            return _output(token, _getBorrowBalance(borrowVault, subAccount));
        }

        revert UnsupportedOperation();
    }

    // ============ Internal Write Functions ============

    function _depositCollateral(
        address vault,
        uint256 amount,
        address onBehalfOf
    ) internal nonReentrant {
        address token = IEulerVault(vault).asset();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(vault, amount);

        // Deposit to vault, shares credited to onBehalfOf
        IEulerVault(vault).deposit(amount, onBehalfOf);
    }

    function _withdrawCollateral(
        address vault,
        uint256 amount,
        address user
    ) internal nonReentrant returns (uint256) {
        // Get user's actual balance (shares converted to assets)
        // Note: We don't use maxWithdraw() here because it considers health factor,
        // but EVC batch uses deferred liquidity checks - the health check happens
        // at the END of the batch, not during the withdrawal operation.
        uint256 shares = IEulerVault(vault).balanceOf(user);
        uint256 userBalance = IEulerVault(vault).convertToAssets(shares);

        // Clamp to user's actual balance (can't withdraw more than they have)
        if (amount > userBalance) {
            amount = userBalance;
        }

        if (amount == 0) return 0;

        address token = IEulerVault(vault).asset();
        uint256 preBal = IERC20(token).balanceOf(address(this));

        // Use EVC batch to withdraw on behalf of user
        // Gateway must be authorized as operator via EVC
        // The EVC batch uses deferred liquidity checks - health is validated
        // at the end of the batch, allowing withdrawals that would fail
        // if checked immediately (e.g., partial withdrawals with active debt)
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
        items[0] = IEVC.BatchItem({
            targetContract: vault,
            onBehalfOfAccount: user,
            value: 0,
            data: abi.encodeCall(IEulerVault.withdraw, (amount, address(this), user))
        });

        evc.batch(items);

        uint256 postBal = IERC20(token).balanceOf(address(this));
        uint256 withdrawn = postBal - preBal;

        // Forward to router
        IERC20(token).safeTransfer(msg.sender, withdrawn);

        return withdrawn;
    }

    function _borrow(
        address vault,
        uint256 amount,
        address user
    ) internal nonReentrant returns (uint256) {
        // In Euler V2, debt is attributed to the caller (msg.sender) or onBehalfOfAccount via EVC
        // Since gateway is the caller, we must use EVC batch to borrow on behalf of user
        // The borrowed assets are sent to this contract, then forwarded to router

        address token = IEulerVault(vault).asset();
        uint256 preBal = IERC20(token).balanceOf(address(this));

        // Build EVC batch item to borrow on behalf of user
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
        items[0] = IEVC.BatchItem({
            targetContract: vault,
            onBehalfOfAccount: user,
            value: 0,
            data: abi.encodeCall(IEulerVault.borrow, (amount, address(this)))
        });

        evc.batch(items);

        uint256 postBal = IERC20(token).balanceOf(address(this));
        uint256 borrowed = postBal - preBal;

        IERC20(token).safeTransfer(msg.sender, borrowed);

        return borrowed;
    }

    function _repay(
        address vault,
        uint256 amount,
        address user
    ) internal nonReentrant returns (uint256 refund) {
        address token = IEulerVault(vault).asset();
        uint256 pre = IERC20(token).balanceOf(address(this));

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(vault, amount);

        // Get actual debt to determine repay amount
        uint256 debt = IEulerVault(vault).debtOf(user);

        if (debt > 0) {
            uint256 toRepay = amount > debt ? debt : amount;
            IEulerVault(vault).repay(toRepay, user);
        }

        uint256 post = IERC20(token).balanceOf(address(this));
        refund = post > pre ? post - pre : 0;

        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
    }

    // ============ View Functions ============

    function _getBorrowBalance(address vault, address user) internal view returns (uint256) {
        return IEulerVault(vault).debtOf(user);
    }

    function _getSupplyBalance(address vault, address user) internal view returns (uint256) {
        // Convert shares to assets for accurate balance
        uint256 shares = IEulerVault(vault).balanceOf(user);
        return IEulerVault(vault).convertToAssets(shares);
    }

    // ============ Authorization ============

    /// @dev Helper struct to reduce stack depth in authorize()
    struct AuthState {
        uint256 targetIdx;
        uint256 pIdx;
        address subAccount;
        bool isOperator;
        bool operatorEmitted;
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        // Count outputs
        uint256 outCount = _countOutputs(instrs);
        produced = new ProtocolTypes.Output[](outCount);

        // Maximum possible targets: operator + multiple collateral enables + controller disable + controller enable per instruction
        // Assuming max 10 collaterals per instruction to be safe
        targets = new address[](1 + instrs.length * 12);
        data = new bytes[](1 + instrs.length * 12);

        AuthState memory state;
        // Note: isOperator is checked per sub-account in _processAuthInstruction

        for (uint256 i = 0; i < instrs.length; i++) {
            _processAuthInstruction(instrs[i], caller, inputs, targets, data, produced, state);
        }

        // Compact arrays to actual size
        assembly {
            mstore(targets, mload(state))
            mstore(data, mload(state))
        }
    }

    function _countOutputs(ProtocolTypes.LendingInstruction[] calldata instrs) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (
                op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                op == ProtocolTypes.LendingOp.Borrow ||
                op == ProtocolTypes.LendingOp.Repay ||
                op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                op == ProtocolTypes.LendingOp.GetSupplyBalance
            ) {
                count++;
            }
        }
    }

    function _processAuthInstruction(
        ProtocolTypes.LendingInstruction calldata ins,
        address caller,
        ProtocolTypes.Output[] calldata inputs,
        address[] memory targets,
        bytes[] memory data,
        ProtocolTypes.Output[] memory produced,
        AuthState memory state
    ) internal view {
        (address borrowVault, address[] memory collateralVaults, uint8 subAccountIndex) = _decodeContext(ins.context);
        address subAccount = _getSubAccount(caller, subAccountIndex);
        uint256 amount = ins.input.index < inputs.length ? inputs[ins.input.index].amount : ins.amount;

        // For single-vault operations, use the first collateral vault
        address collateralVault = collateralVaults.length > 0 ? collateralVaults[0] : address(0);

        // Update state with current sub-account and check operator status
        if (state.subAccount != subAccount) {
            state.subAccount = subAccount;
            state.isOperator = evc.isAccountOperatorAuthorized(subAccount, address(this));
            state.operatorEmitted = false;
        }

        if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            _authDepositCollateral(subAccount, collateralVault, targets, data, state);
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            _authWithdrawCollateral(subAccount, collateralVault, ins.token, amount, targets, data, produced, state);
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            // For borrow, enable ALL collateral vaults for sufficient LTV
            _authBorrow(subAccount, borrowVault, collateralVaults, ins.token, amount, targets, data, produced, state);
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            // Query actual balance from vault and apply 0.1% buffer to handle interest accrual
            uint256 bal = IEulerVault(borrowVault).debtOf(subAccount);
            bal = (bal * 1001) / 1000; // 0.1% buffer
            produced[state.pIdx++] = ProtocolTypes.Output({ token: ins.token, amount: bal });
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            // Query actual balance from vault and apply 0.1% buffer
            uint256 shares = IEulerVault(collateralVault).balanceOf(subAccount);
            uint256 bal = IEulerVault(collateralVault).convertToAssets(shares);
            bal = (bal * 1001) / 1000; // 0.1% buffer
            produced[state.pIdx++] = ProtocolTypes.Output({ token: ins.token, amount: bal });
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            produced[state.pIdx++] = ProtocolTypes.Output({ token: ins.token, amount: 0 });
        }
    }

    function _authDepositCollateral(
        address caller,
        address collateralVault,
        address[] memory targets,
        bytes[] memory data,
        AuthState memory state
    ) internal view {
        if (!evc.isCollateralEnabled(caller, collateralVault)) {
            targets[state.targetIdx] = address(evc);
            data[state.targetIdx] = abi.encodeWithSelector(IEVC.enableCollateral.selector, caller, collateralVault);
            state.targetIdx++;
        }
    }

    function _authWithdrawCollateral(
        address caller,
        address /* collateralVault */,
        address token,
        uint256 amount,
        address[] memory targets,
        bytes[] memory data,
        ProtocolTypes.Output[] memory produced,
        AuthState memory state
    ) internal view {
        if (!state.isOperator && !state.operatorEmitted) {
            targets[state.targetIdx] = address(evc);
            data[state.targetIdx] = abi.encodeWithSelector(IEVC.setAccountOperator.selector, caller, address(this), true);
            state.targetIdx++;
            state.operatorEmitted = true;
        }
        produced[state.pIdx++] = ProtocolTypes.Output({ token: token, amount: amount });
    }

    function _authBorrow(
        address caller,
        address borrowVault,
        address[] memory collateralVaults,
        address token,
        uint256 amount,
        address[] memory targets,
        bytes[] memory data,
        ProtocolTypes.Output[] memory produced,
        AuthState memory state
    ) internal view {
        // Operator authorization
        if (!state.isOperator && !state.operatorEmitted) {
            targets[state.targetIdx] = address(evc);
            data[state.targetIdx] = abi.encodeWithSelector(IEVC.setAccountOperator.selector, caller, address(this), true);
            state.targetIdx++;
            state.operatorEmitted = true;
        }
        // Enable ALL collateral vaults for sufficient LTV
        for (uint256 i = 0; i < collateralVaults.length; i++) {
            address collateralVault = collateralVaults[i];
            if (collateralVault != address(0) && !evc.isCollateralEnabled(caller, collateralVault)) {
                targets[state.targetIdx] = address(evc);
                data[state.targetIdx] = abi.encodeWithSelector(IEVC.enableCollateral.selector, caller, collateralVault);
                state.targetIdx++;
            }
        }
        // Enable controller - but first check if we need to disable an old one
        // In Euler V2, a sub-account can only have ONE controller at a time
        if (!evc.isControllerEnabled(caller, borrowVault)) {
            // Check for existing controllers that need to be disabled
            address[] memory existingControllers = evc.getControllers(caller);
            for (uint256 i = 0; i < existingControllers.length; i++) {
                address existingController = existingControllers[i];
                if (existingController != borrowVault) {
                    // Check if debt is 0 - only then can we disable the old controller
                    uint256 debt = IEulerVault(existingController).debtOf(caller);
                    if (debt == 0) {
                        // Use evc.call() to invoke vault.disableController() in sub-account context
                        // This is the correct Euler V2 pattern per docs
                        targets[state.targetIdx] = address(evc);
                        data[state.targetIdx] = abi.encodeWithSelector(
                            IEVC.call.selector,
                            existingController,  // target = the old borrow vault
                            caller,              // onBehalfOfAccount = sub-account
                            uint256(0),          // value = 0
                            abi.encodeWithSelector(IEulerVault.disableController.selector)
                        );
                        state.targetIdx++;
                    }
                    // Note: if debt > 0, the enableController will fail, which is correct behavior
                    // User must repay existing debt before switching to a new borrow vault
                }
            }
            // Now enable the new controller
            targets[state.targetIdx] = address(evc);
            data[state.targetIdx] = abi.encodeWithSelector(IEVC.enableController.selector, caller, borrowVault);
            state.targetIdx++;
        }
        produced[state.pIdx++] = ProtocolTypes.Output({ token: token, amount: amount });
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata /*inputs*/
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        // Collect unique sub-accounts that need deauthorization
        // Max is instrs.length different sub-accounts
        address[] memory subAccountsToDeauth = new address[](instrs.length);
        uint256 deauthCount = 0;

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (op == ProtocolTypes.LendingOp.WithdrawCollateral || op == ProtocolTypes.LendingOp.Borrow) {
                (,, uint8 subAccountIndex) = _decodeContext(instrs[i].context);
                address subAccount = _getSubAccount(caller, subAccountIndex);

                // Check if already in list
                bool found = false;
                for (uint256 j = 0; j < deauthCount; j++) {
                    if (subAccountsToDeauth[j] == subAccount) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    subAccountsToDeauth[deauthCount++] = subAccount;
                }
            }
        }

        if (deauthCount > 0) {
            // Revoke operator authorization for each sub-account
            targets = new address[](deauthCount);
            data = new bytes[](deauthCount);
            for (uint256 i = 0; i < deauthCount; i++) {
                targets[i] = address(evc);
                data[i] = abi.encodeWithSelector(
                    IEVC.setAccountOperator.selector,
                    subAccountsToDeauth[i],
                    address(this),
                    false
                );
            }
        } else {
            targets = new address[](0);
            data = new bytes[](0);
        }
    }

    // ============ Helpers ============

    /**
     * @notice Decode context bytes into vault addresses and sub-account index
     * @dev Context format: abi.encode(address borrowVault, address collateralVault, uint8 subAccountIndex)
     */
    function _decodeContext(bytes memory ctx) internal pure returns (address borrowVault, address[] memory collateralVaults, uint8 subAccountIndex) {
        (borrowVault, collateralVaults, subAccountIndex) = abi.decode(ctx, (address, address[], uint8));
    }

    /**
     * @notice Derive sub-account address from user address and index
     * @param user The main user address
     * @param subAccountIndex Index 0-255
     * @return The sub-account address
     * @dev Sub-account = (user & 0xFF...FF00) | subAccountIndex
     *      The user's "main" account has index = last byte of their address.
     *      For example, user 0x...a3 has main account at index 163 (0xa3).
     *      Index 0 is a sub-account at address 0x...00 (NOT the same as user address
     *      unless user address happens to end with 0x00).
     */
    function _getSubAccount(address user, uint8 subAccountIndex) internal pure returns (address) {
        // Always apply the formula - don't special-case index 0
        return address(uint160(uint160(user) & ~uint160(0xFF)) | uint160(subAccountIndex));
    }

    function _noOutput() internal pure returns (ProtocolTypes.Output[] memory) {
        return new ProtocolTypes.Output[](0);
    }

    function _output(address token, uint256 amount) internal pure returns (ProtocolTypes.Output[] memory outputs) {
        outputs = new ProtocolTypes.Output[](1);
        outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
    }

    // ============ Emergency Recovery ============

    /// @notice Recover stuck tokens (owner only)
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toRecover = amount == type(uint256).max ? balance : amount;
        if (toRecover > balance) toRecover = balance;
        if (toRecover > 0) {
            IERC20(token).safeTransfer(to, toRecover);
        }
    }
}
