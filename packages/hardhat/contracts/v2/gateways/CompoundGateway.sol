// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ILendingGateway.sol";
import "../interfaces/IGatewayView.sol";
import "../../gateways/ProtocolGateway.sol";
import "../../interfaces/ICompoundComet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CompoundGateway is ILendingGateway, IGatewayView, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(address => ICompoundComet) public tokenToComet;

    constructor(address router, ICompoundComet[] memory comets, address owner)
        ProtocolGateway(router)
        Ownable(owner)
    {
        for (uint256 i = 0; i < comets.length; i++) {
            if (address(comets[i]) != address(0)) {
                tokenToComet[address(comets[i].baseToken())] = comets[i];
            }
        }
    }

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
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "comet not set");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(user, token, amount);
    }

    function _borrow(address token, address user, uint256 amount)
        internal
        nonReentrant
        returns (uint256 outAmount)
    {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "comet not set");
        comet.withdrawFrom(user, address(this), token, amount);
        outAmount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, outAmount);
    }

    function _repay(address token, address user, uint256 amount, bool repayAll)
        internal
        nonReentrant
        returns (uint256 repaidAmount, uint256 refund)
    {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "comet not set");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 repayAmount = amount;
        if (repayAll) {
            uint256 debt = comet.borrowBalanceOf(user);
            if (debt < repayAmount) {
                repayAmount = debt;
            }
        }
        IERC20(token).approve(address(comet), repayAmount);
        comet.supplyTo(user, token, repayAmount);
        refund = IERC20(token).balanceOf(address(this));
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
        repaidAmount = amount - refund;
    }

    function _withdraw(address token, address user, uint256 amount, bool withdrawAll)
        internal
        nonReentrant
        returns (uint256 outAmount)
    {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "comet not set");
        uint256 withdrawAmount = amount;
        if (withdrawAll) {
            withdrawAmount = comet.balanceOf(user);
        }
        comet.withdrawFrom(user, address(this), token, withdrawAmount);
        outAmount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, outAmount);
    }

    // --------- View functions ---------
    function getBalance(address token, address user) external view override returns (uint256) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return 0;
        return comet.balanceOf(user);
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return 0;
        return comet.borrowBalanceOf(user);
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return (0, false);
        return (comet.getBorrowRate(comet.getUtilization()), true);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return (0, false);
        return (comet.getSupplyRate(comet.getUtilization()), true);
    }

    function getBorrowBalanceCurrent(address token, address user) external returns (uint256) {
        return getBorrowBalance(token, user);
    }
}

