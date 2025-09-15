// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ILendingGateway.sol";
import "../../gateways/ProtocolGateway.sol";
import "../../interfaces/aave/IUiDataProvider.sol";
import "../../interfaces/aave/IPoolAddressProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface DebtToken {
    function borrowAllowance(address user, address spender) external view returns (uint256);
}

contract AaveGateway is ILendingGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;
    uint16 public immutable REFERRAL_CODE;

    constructor(address router, address _poolAddressesProvider, address _uiPoolDataProvider, uint16 _referralCode)
        ProtocolGateway(router)
    {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
        REFERRAL_CODE = _referralCode;
    }

    // --------- Approvals encoding (v1 parity) ---------
    function getAuthorizationsForInstructions(LendingInstruction[] calldata instructions)
        external
        view
        override
        returns (address[] memory targets, bytes[] memory calldatas)
    {
        uint256 count = 0;
        // First pass: count approvals
        for (uint256 i = 0; i < instructions.length; i++) {
            LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == InstructionType.Deposit || ins.instructionType == InstructionType.Repay) {
                // ERC20 approve to ROUTER
                count += 1;
            } else if (ins.instructionType == InstructionType.Borrow) {
                // approveDelegation on variable debt token to this gateway
                (, address variableDebtToken, bool found) = _getReserveAddresses(ins.basic.token);
                if (found && variableDebtToken != address(0)) {
                    count += 1;
                }
            }
        }

        targets = new address[](count);
        calldatas = new bytes[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < instructions.length; i++) {
            LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == InstructionType.Deposit) {
                targets[idx] = ins.basic.token;
                calldatas[idx] = abi.encodeWithSelector(
                    IERC20.approve.selector,
                    ROUTER,
                    ins.basic.amount
                );
                idx += 1;
            } else if (ins.instructionType == InstructionType.Repay) {
                targets[idx] = ins.basic.token;
                uint256 approveAmount = ins.repayAll ? type(uint256).max : ins.basic.amount;
                calldatas[idx] = abi.encodeWithSelector(
                    IERC20.approve.selector,
                    ROUTER,
                    approveAmount
                );
                idx += 1;
            } else if (ins.instructionType == InstructionType.Borrow) {
                (, address variableDebtToken, bool found) = _getReserveAddresses(ins.basic.token);
                if (found && variableDebtToken != address(0)) {
                    targets[idx] = variableDebtToken;
                    // Align with v1: use max delegation to avoid re-approvals
                    calldatas[idx] = abi.encodeWithSignature(
                        "approveDelegation(address,uint256)",
                        address(this),
                        type(uint256).max
                    );
                    idx += 1;
                }
            }
        }
    }

    // --------- Core instruction processing ---------
    function processLendingInstructions(LendingInstruction[] calldata instructions)
        external
        override
        onlyRouter
        returns (InstructionOutput[][] memory outputs)
    {
        outputs = new InstructionOutput[][](instructions.length);
        for (uint256 i = 0; i < instructions.length; i++) {
            LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == InstructionType.Deposit) {
                _deposit(ins.basic.token, ins.basic.user, ins.basic.amount);
                outputs[i] = _singleOutput(ins.basic.token, 0);
            } else if (ins.instructionType == InstructionType.Borrow) {
                uint256 outAmount = _borrow(ins.basic.token, ins.basic.user, ins.basic.amount);
                outputs[i] = _singleOutput(ins.basic.token, outAmount);
            } else if (ins.instructionType == InstructionType.Repay) {
                (uint256 repaid, uint256 refund) =
                    _repay(ins.basic.token, ins.basic.user, ins.basic.amount, ins.repayAll);
                outputs[i] = _dualOutput(ins.basic.token, repaid, refund);
            } else if (ins.instructionType == InstructionType.Withdraw) {
                uint256 outAmount =
                    _withdraw(ins.basic.token, ins.basic.user, ins.basic.amount, ins.withdrawAll);
                outputs[i] = _singleOutput(ins.basic.token, outAmount);
            }
        }
    }

    function _singleOutput(address token, uint256 amount)
        internal
        pure
        returns (InstructionOutput[] memory arr)
    {
        arr = new InstructionOutput[](1);
        arr[0] = InstructionOutput({token: token, balance: amount});
    }

    function _dualOutput(address token, uint256 a, uint256 b)
        internal
        pure
        returns (InstructionOutput[] memory arr)
    {
        arr = new InstructionOutput[](2);
        arr[0] = InstructionOutput({token: token, balance: a});
        arr[1] = InstructionOutput({token: token, balance: b});
    }

    function _deposit(address token, address user, uint256 amount) internal nonReentrant {
        address pool = poolAddressesProvider.getPool();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(pool), amount);
        IPool(pool).supply(token, amount, user, REFERRAL_CODE);
    }

    function _borrow(address token, address user, uint256 amount) internal nonReentrant returns (uint256 outAmount) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        require(found && variableDebtToken != address(0), "invalid debt token");
        uint256 allowance = DebtToken(variableDebtToken).borrowAllowance(user, address(this));
        require(allowance >= amount, "insufficient borrow allowance");
        pool.borrow(token, amount, 2, REFERRAL_CODE, user);
        outAmount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, outAmount);
    }

    function _repay(address token, address user, uint256 amount, bool repayAll)
        internal
        nonReentrant
        returns (uint256 repaidAmount, uint256 refund)
    {
        IPool pool = IPool(poolAddressesProvider.getPool());
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 repayAmount = repayAll ? type(uint256).max : amount;
        IERC20(token).approve(address(pool), repayAmount);
        pool.repay(token, repayAmount, 2, user);
        refund = IERC20(token).balanceOf(address(this));
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
        repaidAmount = amount - refund;
    }

    function _withdraw(address token, address /*user*/, uint256 amount, bool withdrawAll)
        internal
        nonReentrant
        returns (uint256 outAmount)
    {
        IPool pool = IPool(poolAddressesProvider.getPool());
        uint256 withdrawAmount = withdrawAll ? type(uint256).max : amount;
        pool.withdraw(token, withdrawAmount, address(this));
        outAmount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, outAmount);
    }

    function _getReserveAddresses(address token) internal view returns (address aToken, address variableDebtToken, bool found) {
        try uiPoolDataProvider.getReservesData(poolAddressesProvider) returns (
            IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,
            IUiPoolDataProviderV3.BaseCurrencyInfo memory
        ) {
            for (uint256 i = 0; i < reserves.length; i++) {
                if (reserves[i].underlyingAsset == token) {
                    return (reserves[i].aTokenAddress, reserves[i].variableDebtTokenAddress, true);
                }
            }
        } catch {}
        return (address(0), address(0), false);
    }
}

