// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";

import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPoolDataProvider } from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";

interface IVariableDebtToken {
    function borrowAllowance(address fromUser, address spender) external view returns (uint256);
}

contract AaveGatewayWrite is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable poolAddressesProvider;
    uint16 public immutable REFERRAL_CODE;

    constructor(address router, address _poolAddressesProvider, uint16 _referralCode) ProtocolGateway(router) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        REFERRAL_CODE = _referralCode;
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter returns (ProtocolTypes.Output[] memory outputs) {
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
            // NO BUFFER in execution
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else if (instr.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            uint256 bal = _getSupplyBalance(token, instr.user);
            // NO BUFFER in execution
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else if (instr.op == ProtocolTypes.LendingOp.SetEMode) {
            // Note: SetEMode is handled specially - it produces approval targets
            // for the user to call the Pool directly (see authorize function)
            outputs = new ProtocolTypes.Output[](0);
        } else {
            revert("Unknown op");
        }
    }

    function deposit(address token, address onBehalfOf, uint256 amount) internal nonReentrant {
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        // Router should approve this gateway to pull from router balance
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(pool, 0);
        IERC20(token).approve(pool, amount);
        IPool(pool).supply(token, amount, onBehalfOf, REFERRAL_CODE);
    }

    function withdraw(
        address underlying,
        address user,
        uint256 amount
    ) internal nonReentrant returns (address, uint256) {
        address aToken = _getAToken(underlying);
        require(aToken != address(0), "aToken not found");
        IERC20 a = IERC20(aToken);
        uint256 balance = a.balanceOf(user);
        // Clamp amount to balance if requested amount > balance
        // This handles rounding errors (e.g. 1 wei less) and type(uint256).max
        if (amount > balance) {
            amount = balance;
        }
        uint256 allowance = a.allowance(user, address(this));
        require(allowance >= amount, "aToken: allowance");
        a.safeTransferFrom(user, address(this), amount);
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        uint256 amountOut = IPool(pool).withdraw(underlying, amount, address(this));
        IERC20(underlying).safeTransfer(msg.sender, amountOut);
        return (underlying, amountOut);
    }

    function borrow(address token, address user, uint256 amount) internal nonReentrant {
        address pool = poolAddressesProvider.getPool();
        require(pool != address(0), "Pool not set");
        (, , address vDebt) = _getReserveTokens(token);
        require(vDebt != address(0), "vDebt not found");
        uint256 allowance = IVariableDebtToken(vDebt).borrowAllowance(user, address(this));
        require(allowance >= amount, "borrow allowance");
        IPool(pool).borrow(token, amount, 2, REFERRAL_CODE, user);
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(
        address token,
        address user,
        uint256 amount
    ) internal nonReentrant returns (uint256 refund) {
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

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        // 1. Calculate exact output count to match execution logic
        uint256 outCount = 0;
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (
                op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                op == ProtocolTypes.LendingOp.Borrow ||
                op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                op == ProtocolTypes.LendingOp.GetSupplyBalance ||
                op == ProtocolTypes.LendingOp.Repay
            ) {
                outCount++;
            }
        }
        produced = new ProtocolTypes.Output[](outCount);
        uint256 pIdx = 0;

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];

            // Simulation logic to determine actual token and amount
            address token = ins.token;
            uint256 amount = ins.amount;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
                amount = inputs[ins.input.index].amount;
            }

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address aToken = _getAToken(token);
                uint256 cur = IERC20(aToken).allowance(caller, address(this));
                uint256 required = amount;

                // Add to produced
                produced[pIdx] = ProtocolTypes.Output({ token: token, amount: amount });
                pIdx++;

                if (amount != 0 && cur >= required) {
                    targets[i] = address(0);
                    data[i] = bytes("");
                } else {
                    targets[i] = aToken;
                    data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), required);
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                (, , address vDebt) = _getReserveTokens(token);

                // Add to produced
                produced[pIdx] = ProtocolTypes.Output({ token: token, amount: amount });
                pIdx++;

                if (vDebt == address(0)) {
                    targets[i] = address(0);
                    data[i] = bytes("");
                } else {
                    uint256 cur = IVariableDebtToken(vDebt).borrowAllowance(caller, address(this));
                    uint256 required = amount; // Exact amount

                    if (cur >= required && amount != 0) {
                        targets[i] = address(0);
                        data[i] = bytes("");
                    } else {
                        targets[i] = vDebt;
                        data[i] = abi.encodeWithSignature(
                            "approveDelegation(address,uint256)",
                            address(this),
                            type(uint256).max
                        );
                    }
                }
            } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
                uint256 bal = _getBorrowBalance(token, ins.user);
                bal = (bal * 1001) / 1000; // Buffer
                produced[pIdx] = ProtocolTypes.Output({ token: token, amount: bal });
                pIdx++;
                targets[i] = address(0);
                data[i] = bytes("");
            } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
                uint256 bal = _getSupplyBalance(token, ins.user);
                bal = (bal * 1001) / 1000; // Buffer
                produced[pIdx] = ProtocolTypes.Output({ token: token, amount: bal });
                pIdx++;
                targets[i] = address(0);
                data[i] = bytes("");
            } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
                // Repay produces a refund output (usually 0)
                produced[pIdx] = ProtocolTypes.Output({ token: token, amount: 0 });
                pIdx++;
                targets[i] = address(0);
                data[i] = bytes("");
            } else if (ins.op == ProtocolTypes.LendingOp.SetEMode) {
                // SetEMode: user calls Pool.setUserEMode(categoryId) directly
                // amount encodes the categoryId
                address pool = poolAddressesProvider.getPool();
                targets[i] = pool;
                data[i] = abi.encodeWithSignature("setUserEMode(uint8)", uint8(amount));
            } else {
                // Deposit / DepositCollateral produce NO output
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/,
        ProtocolTypes.Output[] calldata inputs
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            address token = ins.token;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
            }

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                // Revoke aToken approval
                address aToken = _getAToken(token);
                targets[i] = aToken;
                data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), 0);
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                // Revoke Credit Delegation
                (, , address vDebt) = _getReserveTokens(token);
                if (vDebt != address(0)) {
                    targets[i] = vDebt;
                    data[i] = abi.encodeWithSignature("approveDelegation(address,uint256)", address(this), 0);
                }
            } else {
                // SetEMode and other ops don't need deauthorization
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
    }

    /// @notice Returns the Aave Pool address for direct calls (e.g., setUserEMode)
    function getPool() external view returns (address) {
        return poolAddressesProvider.getPool();
    }

    /// @notice Helper to encode setUserEMode calldata
    /// @param categoryId The E-Mode category ID (0 = disable E-Mode)
    /// @return target The Aave Pool address
    /// @return callData The encoded function call
    function encodeSetEMode(uint8 categoryId) external view returns (address target, bytes memory callData) {
        target = poolAddressesProvider.getPool();
        callData = abi.encodeWithSignature("setUserEMode(uint8)", categoryId);
    }

    function _getAToken(address underlying) internal view returns (address) {
        IPoolDataProvider data = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (address aToken, , ) = data.getReserveTokensAddresses(underlying);
        return aToken;
    }

    function _getReserveTokens(
        address underlying
    ) internal view returns (address aToken, address sDebt, address vDebt) {
        IPoolDataProvider data = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (aToken, sDebt, vDebt) = data.getReserveTokensAddresses(underlying);
    }

    function _getBorrowBalance(address token, address user) internal view returns (uint256) {
        (, , address vDebt) = _getReserveTokens(token);
        return vDebt == address(0) ? 0 : IERC20(vDebt).balanceOf(user);
    }

    function _getSupplyBalance(address token, address user) internal view returns (uint256) {
        (address aToken, , ) = _getReserveTokens(token);
        return aToken == address(0) ? 0 : IERC20(aToken).balanceOf(user);
    }
}
