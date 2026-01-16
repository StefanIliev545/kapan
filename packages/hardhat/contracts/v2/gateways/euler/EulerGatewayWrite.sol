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
 *   - bytes context = abi.encode(address borrowVault, address collateralVault)
 *   - borrowVault: The vault to borrow from (becomes controller)
 *   - collateralVault: The vault where collateral is deposited
 *
 * EVC Authorization Model:
 *   - Users must enable collateral vaults via EVC before they can back debt
 *   - Users must enable controller (borrow vault) before borrowing
 *   - Gateway uses operator authorization to act on behalf of users
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
        (address borrowVault, address collateralVault) = _decodeContext(ins.context);

        // Resolve amount from input if referenced
        uint256 amount = ins.input.index < inputs.length ? inputs[ins.input.index].amount : ins.amount;

        return _dispatch(ins.op, borrowVault, collateralVault, amount, ins.user);
    }

    function _dispatch(
        ProtocolTypes.LendingOp op,
        address borrowVault,
        address collateralVault,
        uint256 amount,
        address user
    ) internal returns (ProtocolTypes.Output[] memory) {
        // Deposit operations - no output
        if (op == ProtocolTypes.LendingOp.DepositCollateral) {
            _depositCollateral(collateralVault, amount, user);
            return _noOutput();
        }

        // Collateral operations - output collateral token
        if (op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            address token = IEulerVault(collateralVault).asset();
            return _output(token, _withdrawCollateral(collateralVault, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            address token = IEulerVault(collateralVault).asset();
            return _output(token, _getSupplyBalance(collateralVault, user));
        }

        // Borrow operations - output loan token
        if (op == ProtocolTypes.LendingOp.Borrow) {
            address token = IEulerVault(borrowVault).asset();
            return _output(token, _borrow(borrowVault, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.Repay) {
            address token = IEulerVault(borrowVault).asset();
            return _output(token, _repay(borrowVault, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            address token = IEulerVault(borrowVault).asset();
            return _output(token, _getBorrowBalance(borrowVault, user));
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

        // Maximum possible targets: operator + collateral enable + controller enable per instruction
        targets = new address[](1 + instrs.length * 2);
        data = new bytes[](1 + instrs.length * 2);

        AuthState memory state;
        state.isOperator = evc.isAccountOperatorAuthorized(caller, address(this));

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
        (address borrowVault, address collateralVault) = _decodeContext(ins.context);
        uint256 amount = ins.input.index < inputs.length ? inputs[ins.input.index].amount : ins.amount;

        if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            _authDepositCollateral(caller, collateralVault, targets, data, state);
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            _authWithdrawCollateral(caller, collateralVault, ins.token, amount, targets, data, produced, state);
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            _authBorrow(caller, borrowVault, collateralVault, ins.token, amount, targets, data, produced, state);
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            // For auth, use placeholder - actual balance queried at execution time
            produced[state.pIdx++] = ProtocolTypes.Output({ token: ins.token, amount: ins.amount });
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            // For auth, use placeholder - actual balance queried at execution time
            produced[state.pIdx++] = ProtocolTypes.Output({ token: ins.token, amount: ins.amount });
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
        address collateralVault,
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
        // Enable collateral
        if (!evc.isCollateralEnabled(caller, collateralVault)) {
            targets[state.targetIdx] = address(evc);
            data[state.targetIdx] = abi.encodeWithSelector(IEVC.enableCollateral.selector, caller, collateralVault);
            state.targetIdx++;
        }
        // Enable controller
        if (!evc.isControllerEnabled(caller, borrowVault)) {
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
        // Check if any operation requires operator privileges
        bool needsDeauth = false;
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (op == ProtocolTypes.LendingOp.WithdrawCollateral || op == ProtocolTypes.LendingOp.Borrow) {
                needsDeauth = true;
                break;
            }
        }

        if (needsDeauth) {
            // Revoke operator authorization
            targets = new address[](1);
            data = new bytes[](1);
            targets[0] = address(evc);
            data[0] = abi.encodeWithSelector(
                IEVC.setAccountOperator.selector,
                caller,
                address(this),
                false
            );
        } else {
            targets = new address[](0);
            data = new bytes[](0);
        }
    }

    // ============ Helpers ============

    function _decodeContext(bytes memory ctx) internal pure returns (address borrowVault, address collateralVault) {
        if (ctx.length < 64) revert InvalidContext();
        (borrowVault, collateralVault) = abi.decode(ctx, (address, address));
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
