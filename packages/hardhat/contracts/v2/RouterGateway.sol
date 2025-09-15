// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/ILendingGateway.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RouterGateway V2
/// @notice Receives high level protocol instructions and forwards them to
/// protocol specific gateways while handling token movements.
contract RouterGateway is Ownable {
    using SafeERC20 for IERC20;

    struct ProtocolInstruction {
        string protocolName;
        ILendingGateway.LendingInstruction[] instructions;
    }

    mapping(string => ILendingGateway) public gateways;

    constructor(address owner) Ownable(owner) {}

    function addGateway(string calldata protocolName, address gateway) external onlyOwner {
        gateways[protocolName] = ILendingGateway(gateway);
    }

    /// @notice Process batched lending instructions across multiple protocols
    /// @param protocolInstructions The list of protocol scoped instructions
    function processProtocolInstructions(ProtocolInstruction[] calldata protocolInstructions) external {
        for (uint256 i = 0; i < protocolInstructions.length; i++) {
            ILendingGateway gateway = gateways[protocolInstructions[i].protocolName];
            require(address(gateway) != address(0), "Protocol not supported");
            ILendingGateway.LendingInstruction[] calldata instructions = protocolInstructions[i].instructions;
            uint256[] memory balancesBefore = _beforeSendInstructions(address(gateway), instructions, true);
            gateway.processLendingInstructions(instructions);
            _afterSendInstructions(address(gateway), instructions, balancesBefore, true);
        }
    }

    function _beforeSendInstructions(
        address gateway,
        ILendingGateway.LendingInstruction[] calldata instructions,
        bool shouldTransfer
    ) internal returns (uint256[] memory balancesBefore) {
        balancesBefore = new uint256[](instructions.length);

        // first pass – store balances
        for (uint256 i = 0; i < instructions.length; i++) {
            ILendingGateway.LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == ILendingGateway.InstructionType.Repay ||
                ins.instructionType == ILendingGateway.InstructionType.Withdraw ||
                ins.instructionType == ILendingGateway.InstructionType.Borrow
            ) {
                balancesBefore[i] = IERC20(ins.basic.token).balanceOf(address(this));
            }
        }

        // second pass – transfer and approve
        for (uint256 i = 0; i < instructions.length; i++) {
            ILendingGateway.LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == ILendingGateway.InstructionType.Deposit ||
                ins.instructionType == ILendingGateway.InstructionType.Repay
            ) {
                uint256 amount = ins.basic.amount;
                if (ins.instructionType == ILendingGateway.InstructionType.Repay && ins.repayAll) {
                    amount = type(uint256).max;
                }
                if (shouldTransfer) {
                    IERC20(ins.basic.token).safeTransferFrom(msg.sender, address(this), ins.basic.amount);
                }
                IERC20(ins.basic.token).approve(gateway, amount);
            }
        }
    }

    function _afterSendInstructions(
        address gateway,
        ILendingGateway.LendingInstruction[] calldata instructions,
        uint256[] memory balancesBefore,
        bool shouldTransfer
    ) internal {
        for (uint256 i = 0; i < instructions.length; i++) {
            ILendingGateway.LendingInstruction calldata ins = instructions[i];
            IERC20 token = IERC20(ins.basic.token);
            if (ins.instructionType == ILendingGateway.InstructionType.Borrow ||
                ins.instructionType == ILendingGateway.InstructionType.Withdraw
            ) {
                uint256 balanceAfter = token.balanceOf(address(this));
                uint256 diff = balanceAfter - balancesBefore[i];
                if (shouldTransfer && diff > 0) {
                    token.safeTransfer(ins.basic.user, diff);
                }
            }
            if (ins.instructionType == ILendingGateway.InstructionType.Repay) {
                uint256 balanceAfter = token.balanceOf(address(this));
                if (balancesBefore[i] > balanceAfter) {
                    uint256 leftover = balancesBefore[i] - balanceAfter;
                    if (shouldTransfer && leftover > 0) {
                        token.safeTransfer(msg.sender, leftover);
                    }
                }
            }
        }
    }
}
