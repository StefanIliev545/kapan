// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolGateway} from "../../../gateways/ProtocolGateway.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IGateway} from "../../interfaces/IGateway.sol";
import {ProtocolTypes} from "../../interfaces/ProtocolTypes.sol";

import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";

interface IVariableDebtToken { function borrowAllowance(address fromUser, address spender) external view returns (uint256); }

contract AaveGatewayWrite is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable poolAddressesProvider;
    uint16 public immutable REFERRAL_CODE;

    constructor(address router, address _poolAddressesProvider, uint16 _referralCode) ProtocolGateway(router) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        REFERRAL_CODE = _referralCode;
    }

    

    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        ProtocolTypes.LendingInstruction memory instr = abi.decode(data, (ProtocolTypes.LendingInstruction));
        address token = instr.token;
        uint256 amount = instr.amount;
        if (instr.input.index < inputs.length) {
            token = inputs[instr.input.index].token;
            amount = inputs[instr.input.index].amount;
        }
        if (instr.op == ProtocolTypes.LendingOp.Deposit || instr.op == ProtocolTypes.LendingOp.DepositCollateral) {
            deposit(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](0);
        } else if (instr.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            (address u, uint256 amt) = withdraw(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: u, amount: amt });
        } else if (instr.op == ProtocolTypes.LendingOp.Borrow) {
            borrow(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
        } else if (instr.op == ProtocolTypes.LendingOp.Repay) {
            uint256 refund = repay(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: refund });
        } else if (instr.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            uint256 bal = _getBorrowBalance(token, instr.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else if (instr.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            uint256 bal = _getSupplyBalance(token, instr.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else {
            revert("Unknown op");
        }
    }

    function deposit(address token, address onBehalfOf, uint256 amount) public nonReentrant {
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        // Router should approve this gateway to pull from router balance
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(pool, 0);
        IERC20(token).approve(pool, amount);
        IPool(pool).supply(token, amount, onBehalfOf, REFERRAL_CODE);
    }

    function withdraw(address underlying, address user, uint256 amount)
        public
        onlyRouter
        nonReentrant
        returns (address, uint256)
    {
        address aToken = _getAToken(underlying);
        require(aToken != address(0), "aToken not found");
        IERC20 a = IERC20(aToken);
        require(a.balanceOf(user) >= amount, "aToken: insufficient");
        require(a.allowance(user, address(this)) >= amount, "aToken: allowance");
        a.safeTransferFrom(user, address(this), amount);
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        uint256 amountOut = IPool(pool).withdraw(underlying, amount, address(this));
        IERC20(underlying).safeTransfer(msg.sender, amountOut);
        return (underlying, amountOut);
    }

    function borrow(address token, address user, uint256 amount) public onlyRouterOrSelf(user) nonReentrant {
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        (, , address vDebt) = _getReserveTokens(token);
        require(vDebt != address(0), "vDebt not found");
        uint256 allowance = IVariableDebtToken(vDebt).borrowAllowance(user, address(this));
        require(allowance >= amount, "borrow allowance");
        IPool(pool).borrow(token, amount, 2, REFERRAL_CODE, user);
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(address token, address user, uint256 amount) public nonReentrant returns (uint256 refund) {
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        uint256 pre = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(pool, 0);
        IERC20(token).approve(pool, amount);
        uint256 repaid = IPool(pool).repay(token, amount, 2, user);
        uint256 post = IERC20(token).balanceOf(address(this));
        // Prefer protocol's returned amount when available
        uint256 spent = repaid > 0 && repaid <= amount ? repaid : (pre + amount > post ? pre + amount - post : amount);
        refund = amount > spent ? amount - spent : 0;
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
    }

    function authorize(ProtocolTypes.LendingInstruction[] calldata instrs, address caller)
        external
        view
        returns (address[] memory targets, bytes[] memory data)
    {
        // Worst-case two approvals per instruction
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.Repay) {
                // Approve underlying for this gateway
                targets[i] = ins.token;
                data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), ins.amount);
            } else if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
                targets[i] = ins.token;
                data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), ins.amount);
            } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                // Approve aToken for this gateway to pull from user
                address aToken = _getAToken(ins.token);
                targets[i] = aToken;
                data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), ins.amount);
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                // Approve delegation on variable debt token to this gateway
                (, , address vDebt) = _getReserveTokens(ins.token);
                targets[i] = vDebt;
                data[i] = abi.encodeWithSignature("approveDelegation(address,uint256)", address(this), type(uint256).max);
            } else {
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
    }

    function _getAToken(address underlying) internal view returns (address) {
        IPoolDataProvider data = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (address aToken,,) = data.getReserveTokensAddresses(underlying);
        return aToken;
    }
    function _getReserveTokens(address underlying) internal view returns (address aToken, address sDebt, address vDebt) {
        IPoolDataProvider data = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (aToken, sDebt, vDebt) = data.getReserveTokensAddresses(underlying);
    }

    function _getBorrowBalance(address token, address user) internal view returns (uint256) {
        (, , address vDebt) = _getReserveTokens(token);
        return vDebt == address(0) ? 0 : IERC20(vDebt).balanceOf(user);
    }

    function _getSupplyBalance(address token, address user) internal view returns (uint256) {
        (address aToken,,) = _getReserveTokens(token);
        return aToken == address(0) ? 0 : IERC20(aToken).balanceOf(user);
    }
}


