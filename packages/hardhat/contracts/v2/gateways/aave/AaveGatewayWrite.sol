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

import "hardhat/console.sol";

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
        console.log("AaveGatewayWrite: processLendingInstruction called");
        console.log("AaveGatewayWrite: inputs count", inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            console.log("AaveGatewayWrite: input[", i, "] token", uint256(uint160(inputs[i].token)));
            console.log("AaveGatewayWrite: input[", i, "] amount", inputs[i].amount);
        }
        console.log("AaveGatewayWrite: data length", data.length);
        
        ProtocolTypes.LendingInstruction memory instr = abi.decode(data, (ProtocolTypes.LendingInstruction));
        console.log("AaveGatewayWrite: op", uint256(instr.op));
        console.log("AaveGatewayWrite: token", uint256(uint160(instr.token)));
        console.log("AaveGatewayWrite: user", uint256(uint160(instr.user)));
        console.log("AaveGatewayWrite: amount", instr.amount);
        console.log("AaveGatewayWrite: input.index", instr.input.index);
        
        address token = instr.token;
        uint256 amount = instr.amount;
        if (instr.input.index < inputs.length) {
            token = inputs[instr.input.index].token;
            amount = inputs[instr.input.index].amount;
            console.log("AaveGatewayWrite: using UTXO - token", uint256(uint160(token)));
            console.log("AaveGatewayWrite: using UTXO - amount", amount);
        } else {
            console.log("AaveGatewayWrite: using instruction params");
        }
        
        if (instr.op == ProtocolTypes.LendingOp.Deposit || instr.op == ProtocolTypes.LendingOp.DepositCollateral) {
            console.log("AaveGatewayWrite: executing Deposit");
            deposit(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](0);
            console.log("AaveGatewayWrite: Deposit completed, 0 outputs");
        } else if (instr.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            console.log("AaveGatewayWrite: executing WithdrawCollateral");
            (address u, uint256 amt) = withdraw(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: u, amount: amt });
            console.log("AaveGatewayWrite: WithdrawCollateral completed, token", uint256(uint160(u)), "amount", amt);
        } else if (instr.op == ProtocolTypes.LendingOp.Borrow) {
            console.log("AaveGatewayWrite: executing Borrow");
            borrow(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
            console.log("AaveGatewayWrite: Borrow completed, token", uint256(uint160(token)), "amount", amount);
        } else if (instr.op == ProtocolTypes.LendingOp.Repay) {
            console.log("AaveGatewayWrite: executing Repay");
            uint256 refund = repay(token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: refund });
            console.log("AaveGatewayWrite: Repay completed, refund", refund);
        } else if (instr.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            console.log("AaveGatewayWrite: executing GetBorrowBalance");
            uint256 bal = _getBorrowBalance(token, instr.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
            console.log("AaveGatewayWrite: GetBorrowBalance completed, balance", bal);
        } else if (instr.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            console.log("AaveGatewayWrite: executing GetSupplyBalance");
            uint256 bal = _getSupplyBalance(token, instr.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
            console.log("AaveGatewayWrite: GetSupplyBalance completed, balance", bal);
        } else {
            console.log("AaveGatewayWrite: ERROR - unknown op", uint256(instr.op));
            revert("Unknown op");
        }
    }

    function deposit(address token, address onBehalfOf, uint256 amount) public onlyRouter nonReentrant {
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

    function repay(address token, address user, uint256 amount) public onlyRouter nonReentrant returns (uint256 refund) {
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
        console.log("AaveGatewayWrite.authorize: Starting", instrs.length, "instruction(s)");
        console.log("AaveGatewayWrite.authorize: Caller", uint256(uint160(caller)));
        
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            
            console.log("AaveGatewayWrite.authorize: Processing instruction", i);
            console.log("AaveGatewayWrite.authorize: Op", uint256(ins.op));
            console.log("AaveGatewayWrite.authorize: Token", uint256(uint160(ins.token)));
            console.log("AaveGatewayWrite.authorize: User", uint256(uint160(ins.user)));
            console.log("AaveGatewayWrite.authorize: Amount", ins.amount);

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                console.log("AaveGatewayWrite.authorize: WithdrawCollateral detected");
                // User must approve aToken → gateway for withdraw
                address aToken = _getAToken(ins.token);
                console.log("AaveGatewayWrite.authorize: aToken", aToken);
                targets[i] = aToken;
                // Ask for max so withdraw-all / accrued interest cases don't need another approval
                data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), type(uint256).max);
                console.log("AaveGatewayWrite.authorize: Generated approval for aToken");

            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                console.log("AaveGatewayWrite.authorize: Borrow detected");
                // User must approveDelegation(vDebt → gateway) for borrow
                (address aToken, address sToken, address vDebt) = _getReserveTokens(ins.token);
                console.log("AaveGatewayWrite.authorize: aToken", uint256(uint160(aToken)));
                console.log("AaveGatewayWrite.authorize: sToken", uint256(uint160(sToken)));
                console.log("AaveGatewayWrite.authorize: vDebt", uint256(uint160(vDebt)));
                
                if (vDebt == address(0)) {
                    console.log("AaveGatewayWrite.authorize: ERROR - vDebt is zero address!");
                } else {
                    targets[i] = vDebt;
                    data[i] = abi.encodeWithSignature(
                        "approveDelegation(address,uint256)",
                        address(this),
                        type(uint256).max
                    );
                    console.log("AaveGatewayWrite.authorize: Generated approveDelegation for vDebt");
                    console.log("AaveGatewayWrite.authorize: Target", uint256(uint160(targets[i])));
                    console.log("AaveGatewayWrite.authorize: Data length", data[i].length);
                }

            } else {
                console.log("AaveGatewayWrite.authorize: Other op (Deposit/Repay/DepositCollateral) - no user approval needed");
                // Deposit / Repay / DepositCollateral: user approvals not needed
                // (router handles pull + router->gateway approve)
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
        
        console.log("AaveGatewayWrite.authorize: Returning", targets.length, "authorization(s)");
        for (uint256 i = 0; i < targets.length; i++) {
            console.log("AaveGatewayWrite.authorize: Auth", i);
            console.log("AaveGatewayWrite.authorize: Target", uint256(uint160(targets[i])));
            console.log("AaveGatewayWrite.authorize: Data length", data[i].length);
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


