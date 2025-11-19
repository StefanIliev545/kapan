// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolGateway} from "../../../gateways/ProtocolGateway.sol";
import {IGateway} from "../../interfaces/IGateway.sol";
import {ProtocolTypes} from "../../interfaces/ProtocolTypes.sol";

import {ComptrollerInterface} from "../../../interfaces/venus/ComptrollerInterface.sol";
import {VTokenInterface} from "../../../interfaces/venus/VTokenInterface.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VenusGatewayWrite is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ComptrollerInterface immutable public comptroller;

    constructor(address router, address _comptroller) ProtocolGateway(router) {
        comptroller = ComptrollerInterface(_comptroller);
    }

    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        address token = ins.token; uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) { token = inputs[ins.input.index].token; amount = inputs[ins.input.index].amount; }
        if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            deposit(token, ins.user, amount); outputs = new ProtocolTypes.Output[](0);
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            (address u, uint256 amt) = withdrawCollateral(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1); outputs[0] = ProtocolTypes.Output({token: u, amount: amt});
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            borrow(token, ins.user, amount); outputs = new ProtocolTypes.Output[](1); outputs[0] = ProtocolTypes.Output({token: token, amount: amount});
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            uint256 refund = repay(token, ins.user, amount); outputs = new ProtocolTypes.Output[](1); outputs[0] = ProtocolTypes.Output({token: token, amount: refund});
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            address vToken = _getVTokenForUnderlying(token); uint256 bal = VTokenInterface(vToken).borrowBalanceCurrent(ins.user);
            // Add 0.1% buffer
            bal = (bal * 1001) / 1000;
            outputs = new ProtocolTypes.Output[](1); outputs[0] = ProtocolTypes.Output({token: token, amount: bal});
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            address vToken = _getVTokenForUnderlying(token); uint256 vBal = VTokenInterface(vToken).balanceOf(ins.user); uint256 rate = VTokenInterface(vToken).exchangeRateStored();
            uint256 bal = (vBal * rate) / 1e18; 
            // Add 0.1% buffer
            bal = (bal * 1001) / 1000;
            outputs = new ProtocolTypes.Output[](1); outputs[0] = ProtocolTypes.Output({token: token, amount: bal});
        } else { revert("Venus: unknown op"); }
    }

    function deposit(address token, address user, uint256 amount) public onlyRouter nonReentrant {
        address vToken = _getVTokenForUnderlying(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(vToken, 0);
        IERC20(token).approve(vToken, amount);
        uint err = VTokenInterface(vToken).mint(amount); require(err == 0, "Venus: mint failed");
        uint vBal = VTokenInterface(vToken).balanceOf(address(this)); require(vBal > 0, "Venus: zero vTokens");
        VTokenInterface(vToken).transfer(user, vBal);
    }

    function withdrawCollateral(address collateral, address user, uint256 underlyingAmount)
        public onlyRouterOrSelf(user) nonReentrant returns (address, uint256)
    {
        address vToken = _getVTokenForUnderlying(collateral);

        uint256 borrowBalance = VTokenInterface(vToken).borrowBalanceCurrent(user);
        if (underlyingAmount >= borrowBalance) {
            underlyingAmount = borrowBalance;
            uint256 balance = VTokenInterface(vToken).balanceOf(user);
            VTokenInterface(vToken).transferFrom(user, address(this), balance);
            uint256 pre = IERC20(collateral).balanceOf(address(this));
            uint err = VTokenInterface(vToken).redeem(balance); require(err == 0, "Venus: redeem failed");
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
        uint err = VTokenInterface(vToken).redeem(requiredV); require(err == 0, "Venus: redeem failed");
        // Transfer the full redeemed amount to avoid dust accumulation
        // The round-up may result in slightly more underlying than requested, which we transfer out
        uint256 actualRedeemed = IERC20(collateral).balanceOf(address(this)) - balanceBefore;
        IERC20(collateral).safeTransfer(msg.sender, actualRedeemed);
        return (collateral, actualRedeemed);
    }

    function borrow(address token, address user, uint256 amount) public onlyRouterOrSelf(user) nonReentrant {
        address vToken = _getVTokenForUnderlying(token);
        uint err = VTokenInterface(vToken).borrowBehalf(user, amount); require(err == 0, "Venus: borrow failed");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(address token, address user, uint256 amount) public onlyRouter nonReentrant returns (uint256 refund) {
        address vToken = _getVTokenForUnderlying(token);
        uint256 pre = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(vToken, 0);
        IERC20(token).approve(vToken, amount);
        uint err = VTokenInterface(vToken).repayBorrowBehalf(user, amount); require(err == 0, "Venus: repay failed");
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
    )
        external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        produced = new ProtocolTypes.Output[](instrs.length);
        
        uint256 k;
        for (uint256 i; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            
            // Simulation logic
            address token = ins.token;
            uint256 amount = ins.amount;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
                amount = inputs[ins.input.index].amount;
            }

            if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.Repay) {
                // Approve underlying to gateway only if insufficient allowance
                // Add 0.1% buffer for interest/rounding
                uint256 amountWithBuffer = amount == 0 ? 0 : (amount * 1001) / 1000;
                uint256 cur = IERC20(token).allowance(caller, address(this));
                if (amount != 0 && cur >= amountWithBuffer) { targets[k] = address(0); data[k] = bytes(""); }
                else { targets[k] = token; data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), amountWithBuffer); }
                k++;

                if (ins.op == ProtocolTypes.LendingOp.Deposit) {
                    // 2) Enter market to enable as collateral (idempotent)
                    address vToken = _getVTokenForUnderlying(token);
                    bool member = false; try comptroller.checkMembership(caller, vToken) returns (bool m) { member = m; } catch {}
                    if (member) { targets[k] = address(0); data[k] = bytes(""); }
                    else { address[] memory markets = new address[](1); markets[0] = vToken; targets[k] = address(comptroller); data[k] = abi.encodeWithSelector(ComptrollerInterface.enterMarkets.selector, markets); }
                    k++;
                }
                
                // Repay produces refund output (unknown/zero for sim)
                if (ins.op == ProtocolTypes.LendingOp.Repay) {
                    produced[i] = ProtocolTypes.Output({ token: token, amount: 0 });
                }
            } else if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
                address col = token; address vToken = _getVTokenForUnderlying(col);
                // First: approve gateway to spend tokens (only if insufficient)
                uint256 cur = IERC20(col).allowance(caller, address(this));
                if (amount != 0 && cur >= amount) {
                    targets[k] = address(0); data[k] = bytes("");
                } else {
                    targets[k] = col; data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), amount);
                }
                k++;
                // Second: enter market so vTokens can be used as collateral (only if not already a member)
                bool member = false;
                try comptroller.checkMembership(caller, vToken) returns (bool m) { member = m; } catch {}
                if (member) {
                    targets[k] = address(0); data[k] = bytes("");
                } else {
                    address[] memory markets = new address[](1); markets[0] = vToken;
                    targets[k] = address(comptroller); data[k] = abi.encodeWithSelector(ComptrollerInterface.enterMarkets.selector, markets);
                }
                k++;
            } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address col = token; address vToken = _getVTokenForUnderlying(col);
                // Compute required vTokens from underlying using exchangeRateStored; if amount==0, require max
                uint rate = VTokenInterface(vToken).exchangeRateStored();
                uint requiredV = amount == 0 ? type(uint256).max : (amount * 1e18 + rate - 1) / rate;
                uint256 curV = IERC20(vToken).allowance(caller, address(this));
               // Amount is already buffered if coming from GetSupplyBalance
            uint256 required = amount;
            produced[i] = ProtocolTypes.Output({ token: token, amount: required });

            if (amount != 0 && curV >= requiredV) { // Changed cur to curV and required to requiredV
                targets[k] = address(0); data[k] = bytes("");
            } else {
                targets[k] = vToken; data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), requiredV);
            }    
                // Simulate output
                produced[i] = ProtocolTypes.Output({ token: token, amount: amount });
                k++;
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                // Only updateDelegate if not already approved
                bool approved = false;
                try comptroller.approvedDelegates(caller, address(this)) returns (bool a) { approved = a; } catch {}
                if (approved) {
                    targets[k] = address(0); data[k] = bytes("");
                } else {
                    targets[k] = address(comptroller); data[k] = abi.encodeWithSelector(ComptrollerInterface.updateDelegate.selector, address(this), true);
                }
                
                // Simulate output
                produced[i] = ProtocolTypes.Output({ token: token, amount: amount });
                k++;
            } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
                address vToken = _getVTokenForUnderlying(token); uint256 bal = VTokenInterface(vToken).borrowBalanceStored(ins.user);
                // Add 0.1% buffer
                bal = (bal * 1001) / 1000;
                produced[i] = ProtocolTypes.Output({ token: token, amount: bal });
                targets[k] = address(0); data[k] = bytes("");
                k++;
            } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
                address vToken = _getVTokenForUnderlying(token); uint256 vBal = VTokenInterface(vToken).balanceOf(ins.user); uint256 rate = VTokenInterface(vToken).exchangeRateStored();
                uint256 bal = (vBal * rate) / 1e18;
                // Add 0.1% buffer
                bal = (bal * 1001) / 1000;
                produced[i] = ProtocolTypes.Output({ token: token, amount: bal });
                targets[k] = address(0); data[k] = bytes("");
                k++;
            }
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        // Deauthorization disabled for now
    }

    function _getVTokenForUnderlying(address underlying) internal view returns (address) {
        VTokenInterface[] memory vTokens = comptroller.getAllMarkets();
        for (uint i = 0; i < vTokens.length; i++) {
            try vTokens[i].underlying() returns (address u) { if (u == underlying) return address(vTokens[i]); } catch {}
        }
        revert("Venus: vToken not found");
    }
}


