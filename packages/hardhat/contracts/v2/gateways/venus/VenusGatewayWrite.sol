// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";

import { ComptrollerInterface } from "../../../interfaces/venus/ComptrollerInterface.sol";
import { VTokenInterface } from "../../../interfaces/venus/VTokenInterface.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VenusGatewayWrite is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ComptrollerInterface public immutable comptroller;

    constructor(address router, address _comptroller) ProtocolGateway(router) {
        comptroller = ComptrollerInterface(_comptroller);
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter returns (ProtocolTypes.Output[] memory outputs) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        address token = ins.token;
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }

        if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            deposit(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](0);
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            (address u, uint256 amt) = withdrawCollateral(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: u, amount: amt });
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            borrow(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            uint256 refund = repay(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: refund });
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            address vToken = _getVTokenForUnderlying(token);
            uint256 bal = VTokenInterface(vToken).borrowBalanceCurrent(ins.user);
            // NO BUFFER in execution
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            address vToken = _getVTokenForUnderlying(token);
            uint256 vBal = VTokenInterface(vToken).balanceOf(ins.user);
            uint256 rate = VTokenInterface(vToken).exchangeRateStored();
            uint256 bal = (vBal * rate) / 1e18;
            // NO BUFFER in execution
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else {
            revert("Venus: unknown op");
        }
    }

    function deposit(address token, address user, uint256 amount) internal nonReentrant {
        address vToken = _getVTokenForUnderlying(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(vToken, amount);
        uint err = VTokenInterface(vToken).mint(amount);
        require(err == 0, "Venus: mint failed");
        uint vBal = VTokenInterface(vToken).balanceOf(address(this));
        require(vBal > 0, "Venus: zero vTokens");
        VTokenInterface(vToken).transfer(user, vBal);
    }

    function withdrawCollateral(
        address collateral,
        address user,
        uint256 underlyingAmount
    ) internal nonReentrant returns (address, uint256) {
        address vToken = _getVTokenForUnderlying(collateral);

        // Get user's supply balance in vTokens and convert to underlying
        uint256 vBalance = VTokenInterface(vToken).balanceOf(user);
        uint256 exchangeRate = VTokenInterface(vToken).exchangeRateCurrent();
        uint256 supplyBalance = (vBalance * exchangeRate) / 1e18;

        // Clamp to supply balance if requesting more than available
        if (underlyingAmount >= supplyBalance || underlyingAmount == 0) {
            // Withdraw all - transfer all vTokens and redeem
            VTokenInterface(vToken).transferFrom(user, address(this), vBalance);
            uint256 pre = IERC20(collateral).balanceOf(address(this));
            uint err = VTokenInterface(vToken).redeem(vBalance);
            require(err == 0, "Venus: redeem failed");
            uint256 balanceAfter = IERC20(collateral).balanceOf(address(this));
            uint256 redeemed = balanceAfter - pre;
            IERC20(collateral).safeTransfer(msg.sender, redeemed);
            return (collateral, redeemed);
        }

        // Partial withdraw - calculate required vTokens for desired underlying
        uint requiredV = (underlyingAmount * 1e18 + exchangeRate - 1) / exchangeRate;
        VTokenInterface(vToken).transferFrom(user, address(this), requiredV);

        uint256 balanceBefore = IERC20(collateral).balanceOf(address(this));
        uint256 err2 = VTokenInterface(vToken).redeem(requiredV);
        require(err2 == 0, "Venus: redeem failed");
        uint256 actualRedeemed = IERC20(collateral).balanceOf(address(this)) - balanceBefore;
        IERC20(collateral).safeTransfer(msg.sender, actualRedeemed);
        return (collateral, actualRedeemed);
    }

    function borrow(address token, address user, uint256 amount) internal nonReentrant {
        address vToken = _getVTokenForUnderlying(token);
        uint err = VTokenInterface(vToken).borrowBehalf(user, amount);
        require(err == 0, "Venus: borrow failed");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(
        address token,
        address user,
        uint256 amount
    ) internal nonReentrant returns (uint256 refund) {
        address vToken = _getVTokenForUnderlying(token);
        uint256 pre = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(vToken, amount);
        uint err = VTokenInterface(vToken).repayBorrowBehalf(user, amount);
        require(err == 0, "Venus: repay failed");
        uint256 post = IERC20(token).balanceOf(address(this));
        refund = post > pre ? post - pre : 0;
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
    }

    /// @dev Helper struct to reduce stack depth in authorize
    struct AuthCounts {
        uint256 outCount;
        uint256 authCount;
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        // PASS 1: Count needed outputs and auth targets
        AuthCounts memory counts = _countAuthRequirements(instrs, caller, inputs);

        // Allocate exact sizes
        targets = new address[](counts.authCount);
        data = new bytes[](counts.authCount);
        produced = new ProtocolTypes.Output[](counts.outCount);

        // PASS 2: Fill Arrays
        _fillAuthArrays(instrs, caller, inputs, targets, data, produced);
    }

    function _countAuthRequirements(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) private view returns (AuthCounts memory counts) {
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];

            // Output counting
            if (_producesOutput(ins.op)) {
                counts.outCount++;
            }

            // Auth counting
            counts.authCount += _countAuthForInstruction(ins, caller, inputs);
        }
    }

    function _producesOutput(ProtocolTypes.LendingOp op) private pure returns (bool) {
        return op == ProtocolTypes.LendingOp.WithdrawCollateral ||
               op == ProtocolTypes.LendingOp.Borrow ||
               op == ProtocolTypes.LendingOp.Repay ||
               op == ProtocolTypes.LendingOp.GetBorrowBalance ||
               op == ProtocolTypes.LendingOp.GetSupplyBalance;
    }

    function _countAuthForInstruction(
        ProtocolTypes.LendingInstruction calldata ins,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) private view returns (uint256) {
        (address token, uint256 amount) = _resolveTokenAmount(ins, inputs);

        if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            return _needsEnterMarkets(token, caller) ? 1 : 0;
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            return _needsWithdrawApproval(token, amount, caller) ? 1 : 0;
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            return _needsBorrowDelegation(caller) ? 1 : 0;
        }
        return 0;
    }

    function _resolveTokenAmount(
        ProtocolTypes.LendingInstruction calldata ins,
        ProtocolTypes.Output[] calldata inputs
    ) private pure returns (address token, uint256 amount) {
        token = ins.token;
        amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }
    }

    function _needsEnterMarkets(address token, address caller) private view returns (bool) {
        address vToken = _getVTokenForUnderlying(token);
        try comptroller.checkMembership(caller, vToken) returns (bool m) {
            return !m;
        } catch {
            return true;
        }
    }

    function _needsWithdrawApproval(address token, uint256 amount, address caller) private view returns (bool) {
        address vToken = _getVTokenForUnderlying(token);
        uint256 rate = VTokenInterface(vToken).exchangeRateStored();
        uint256 requiredV = amount == 0 ? type(uint256).max : (amount * 1e18 + rate - 1) / rate;
        uint256 curV = IERC20(vToken).allowance(caller, address(this));
        return amount == 0 || curV < requiredV;
    }

    function _needsBorrowDelegation(address caller) private view returns (bool) {
        try comptroller.approvedDelegates(caller, address(this)) returns (bool a) {
            return !a;
        } catch {
            return true;
        }
    }

    function _fillAuthArrays(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs,
        address[] memory targets,
        bytes[] memory data,
        ProtocolTypes.Output[] memory produced
    ) private view {
        uint256 k = 0; // auth index
        uint256 p = 0; // output index

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            (address token, uint256 amount) = _resolveTokenAmount(ins, inputs);

            if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
                if (_needsEnterMarkets(token, caller)) {
                    address vToken = _getVTokenForUnderlying(token);
                    address[] memory markets = new address[](1);
                    markets[0] = vToken;
                    targets[k] = address(comptroller);
                    data[k] = abi.encodeWithSelector(ComptrollerInterface.enterMarkets.selector, markets);
                    k++;
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
                produced[p++] = ProtocolTypes.Output({ token: token, amount: 0 });
            } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                if (_needsWithdrawApproval(token, amount, caller)) {
                    address vToken = _getVTokenForUnderlying(token);
                    uint256 rate = VTokenInterface(vToken).exchangeRateStored();
                    uint256 requiredV = amount == 0 ? type(uint256).max : (amount * 1e18 + rate - 1) / rate;
                    targets[k] = vToken;
                    data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), requiredV);
                    k++;
                }
                produced[p++] = ProtocolTypes.Output({ token: token, amount: amount });
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                if (_needsBorrowDelegation(caller)) {
                    targets[k] = address(comptroller);
                    data[k] = abi.encodeWithSelector(ComptrollerInterface.updateDelegate.selector, address(this), true);
                    k++;
                }
                produced[p++] = ProtocolTypes.Output({ token: token, amount: amount });
            } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
                address vToken = _getVTokenForUnderlying(token);
                uint256 bal = VTokenInterface(vToken).borrowBalanceStored(ins.user);
                produced[p++] = ProtocolTypes.Output({ token: token, amount: (bal * 1001) / 1000 });
            } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
                address vToken = _getVTokenForUnderlying(token);
                uint256 vBal = VTokenInterface(vToken).balanceOf(ins.user);
                uint256 rate = VTokenInterface(vToken).exchangeRateStored();
                uint256 bal = (vBal * rate) / 1e18;
                produced[p++] = ProtocolTypes.Output({ token: token, amount: (bal * 1001) / 1000 });
            }
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/,
        ProtocolTypes.Output[] calldata inputs
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        // Venus can generate multiple revokes per instruction, but standard revokes are 1-to-1
        // We intentionally do NOT exit markets (too disruptive).
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            address token = ins.token;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
            }

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address vToken = _getVTokenForUnderlying(token);
                targets[i] = vToken;
                data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), 0);
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                // Revoke delegate
                targets[i] = address(comptroller);
                data[i] = abi.encodeWithSelector(ComptrollerInterface.updateDelegate.selector, address(this), false);
            } else {
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
    }

    function _getVTokenForUnderlying(address underlying) internal view returns (address) {
        VTokenInterface[] memory vTokens = comptroller.getAllMarkets();
        for (uint i = 0; i < vTokens.length; i++) {
            try vTokens[i].underlying() returns (address u) {
                if (u == underlying) return address(vTokens[i]);
            } catch {}
        }
        revert("Venus: vToken not found");
    }

    // ============ Emergency Recovery ============

    /// @notice Recover stuck tokens (only callable by router's owner)
    function recoverTokens(address token, address to, uint256 amount) external onlyRouterOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toRecover = amount == type(uint256).max ? balance : amount;
        if (toRecover > balance) toRecover = balance;
        if (toRecover > 0) {
            IERC20(token).safeTransfer(to, toRecover);
        }
    }
}
