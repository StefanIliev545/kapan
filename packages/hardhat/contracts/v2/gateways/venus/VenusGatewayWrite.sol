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
    ) external returns (ProtocolTypes.Output[] memory outputs) {
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

    function deposit(address token, address user, uint256 amount) public onlyRouter nonReentrant {
        address vToken = _getVTokenForUnderlying(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(vToken, 0);
        IERC20(token).approve(vToken, amount);
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
    ) public onlyRouterOrSelf(user) nonReentrant returns (address, uint256) {
        address vToken = _getVTokenForUnderlying(collateral);

        uint256 borrowBalance = VTokenInterface(vToken).borrowBalanceCurrent(user);
        if (underlyingAmount >= borrowBalance) {
            underlyingAmount = borrowBalance;
            uint256 balance = VTokenInterface(vToken).balanceOf(user);
            VTokenInterface(vToken).transferFrom(user, address(this), balance);
            uint256 pre = IERC20(collateral).balanceOf(address(this));
            uint err = VTokenInterface(vToken).redeem(balance);
            require(err == 0, "Venus: redeem failed");
            uint256 balanceAfter = IERC20(collateral).balanceOf(address(this));
            uint256 redeemed = balanceAfter - pre;
            IERC20(collateral).safeTransfer(msg.sender, redeemed);
            return (collateral, redeemed);
        }

        uint exchangeRate = VTokenInterface(vToken).exchangeRateCurrent();
        uint requiredV = (underlyingAmount * 1e18 + exchangeRate - 1) / exchangeRate;
        VTokenInterface(vToken).transferFrom(user, address(this), requiredV);

        uint256 balanceBefore = IERC20(collateral).balanceOf(address(this));
        uint err = VTokenInterface(vToken).redeem(requiredV);
        require(err == 0, "Venus: redeem failed");
        uint256 actualRedeemed = IERC20(collateral).balanceOf(address(this)) - balanceBefore;
        IERC20(collateral).safeTransfer(msg.sender, actualRedeemed);
        return (collateral, actualRedeemed);
    }

    function borrow(address token, address user, uint256 amount) public onlyRouterOrSelf(user) nonReentrant {
        address vToken = _getVTokenForUnderlying(token);
        uint err = VTokenInterface(vToken).borrowBehalf(user, amount);
        require(err == 0, "Venus: borrow failed");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(
        address token,
        address user,
        uint256 amount
    ) public onlyRouter nonReentrant returns (uint256 refund) {
        address vToken = _getVTokenForUnderlying(token);
        uint256 pre = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(vToken, 0);
        IERC20(token).approve(vToken, amount);
        uint err = VTokenInterface(vToken).repayBorrowBehalf(user, amount);
        require(err == 0, "Venus: repay failed");
        uint256 post = IERC20(token).balanceOf(address(this));
        refund = post > pre ? post - pre : 0;
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        // PASS 1: Count needed outputs and needed auth targets
        // We MUST do this because 1 Venus instruction can generate 2 auth steps (Approve + EnterMarkets)
        uint256 outCount = 0;
        uint256 authCount = 0;

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];

            // Output counting
            if (
                ins.op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                ins.op == ProtocolTypes.LendingOp.Borrow ||
                ins.op == ProtocolTypes.LendingOp.Repay ||
                ins.op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                ins.op == ProtocolTypes.LendingOp.GetSupplyBalance
            ) {
                outCount++;
            }

            // Auth counting logic
            address token = ins.token;
            uint256 amount = ins.amount;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
                amount = inputs[ins.input.index].amount;
            }

            if (
                ins.op == ProtocolTypes.LendingOp.Deposit ||
                ins.op == ProtocolTypes.LendingOp.DepositCollateral ||
                ins.op == ProtocolTypes.LendingOp.Repay
            ) {
                uint256 amountWithBuffer = amount == 0 ? 0 : (amount * 1001) / 1000;
                uint256 cur = IERC20(token).allowance(caller, address(this));
                // 1. Approval
                if (amount == 0 || cur < amountWithBuffer) {
                    authCount++;
                }

                // 2. Enter Markets (Only for Deposit/DepositCollateral)
                if (ins.op != ProtocolTypes.LendingOp.Repay) {
                    address vToken = _getVTokenForUnderlying(token);
                    bool member = false;
                    try comptroller.checkMembership(caller, vToken) returns (bool m) {
                        member = m;
                    } catch {}
                    if (!member) {
                        authCount++;
                    }
                }
            } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address vToken = _getVTokenForUnderlying(token);
                uint rate = VTokenInterface(vToken).exchangeRateStored();
                uint requiredV = amount == 0 ? type(uint256).max : (amount * 1e18 + rate - 1) / rate;
                uint256 curV = IERC20(vToken).allowance(caller, address(this));
                if (amount == 0 || curV < requiredV) {
                    authCount++;
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                bool approved = false;
                try comptroller.approvedDelegates(caller, address(this)) returns (bool a) {
                    approved = a;
                } catch {}
                if (!approved) {
                    authCount++;
                }
            }
            // Get* ops require 0 auth
        }

        // Allocate exact sizes
        targets = new address[](authCount);
        data = new bytes[](authCount);
        produced = new ProtocolTypes.Output[](outCount);

        uint256 k = 0; // auth index
        uint256 p = 0; // output index

        // PASS 2: Fill Arrays
        for (uint256 i; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];

            address token = ins.token;
            uint256 amount = ins.amount;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
                amount = inputs[ins.input.index].amount;
            }

            if (
                ins.op == ProtocolTypes.LendingOp.Deposit ||
                ins.op == ProtocolTypes.LendingOp.DepositCollateral ||
                ins.op == ProtocolTypes.LendingOp.Repay
            ) {
                uint256 amountWithBuffer = amount == 0 ? 0 : (amount * 1001) / 1000;
                uint256 cur = IERC20(token).allowance(caller, address(this));

                // 1. Approval
                if (amount == 0 || cur < amountWithBuffer) {
                    targets[k] = token;
                    data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), amountWithBuffer);
                    k++;
                }

                // 2. Enter Markets (Deposit only)
                if (ins.op != ProtocolTypes.LendingOp.Repay) {
                    address vToken = _getVTokenForUnderlying(token);
                    bool member = false;
                    try comptroller.checkMembership(caller, vToken) returns (bool m) {
                        member = m;
                    } catch {}
                    if (!member) {
                        address[] memory markets = new address[](1);
                        markets[0] = vToken;
                        targets[k] = address(comptroller);
                        data[k] = abi.encodeWithSelector(ComptrollerInterface.enterMarkets.selector, markets);
                        k++;
                    }
                }

                if (ins.op == ProtocolTypes.LendingOp.Repay) {
                    produced[p] = ProtocolTypes.Output({ token: token, amount: 0 });
                    p++;
                }
            } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address vToken = _getVTokenForUnderlying(token);
                uint rate = VTokenInterface(vToken).exchangeRateStored();
                uint requiredV = amount == 0 ? type(uint256).max : (amount * 1e18 + rate - 1) / rate;
                uint256 curV = IERC20(vToken).allowance(caller, address(this));

                if (amount == 0 || curV < requiredV) {
                    targets[k] = vToken;
                    data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), requiredV);
                    k++;
                }

                produced[p] = ProtocolTypes.Output({ token: token, amount: amount });
                p++;
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                bool approved = false;
                try comptroller.approvedDelegates(caller, address(this)) returns (bool a) {
                    approved = a;
                } catch {}
                if (!approved) {
                    targets[k] = address(comptroller);
                    data[k] = abi.encodeWithSelector(ComptrollerInterface.updateDelegate.selector, address(this), true);
                    k++;
                }
                produced[p] = ProtocolTypes.Output({ token: token, amount: amount });
                p++;
            } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
                address vToken = _getVTokenForUnderlying(token);
                uint256 bal = VTokenInterface(vToken).borrowBalanceStored(ins.user);
                bal = (bal * 1001) / 1000;
                produced[p] = ProtocolTypes.Output({ token: token, amount: bal });
                p++;
            } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
                address vToken = _getVTokenForUnderlying(token);
                uint256 vBal = VTokenInterface(vToken).balanceOf(ins.user);
                uint256 rate = VTokenInterface(vToken).exchangeRateStored();
                uint256 bal = (vBal * rate) / 1e18;
                bal = (bal * 1001) / 1000;
                produced[p] = ProtocolTypes.Output({ token: token, amount: bal });
                p++;
            }
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
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
}
