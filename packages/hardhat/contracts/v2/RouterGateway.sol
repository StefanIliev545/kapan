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
    /// @return allOutputs Flattened list of outputs for each processed instruction
    function processProtocolInstructions(ProtocolInstruction[] calldata protocolInstructions)
        external
        returns (ILendingGateway.InstructionOutput[][] memory allOutputs)
    {
        uint256 totalInstructions = 0;
        for (uint256 i = 0; i < protocolInstructions.length; i++) {
            totalInstructions += protocolInstructions[i].instructions.length;
        }
        allOutputs = new ILendingGateway.InstructionOutput[][](totalInstructions);
        uint256 outIndex = 0;
        for (uint256 i = 0; i < protocolInstructions.length; i++) {
            ILendingGateway gateway = gateways[protocolInstructions[i].protocolName];
            require(address(gateway) != address(0), "Protocol not supported");
            ILendingGateway.LendingInstruction[] calldata instructions = protocolInstructions[i].instructions;
            _beforeSendInstructions(address(gateway), instructions, true);
            ILendingGateway.InstructionOutput[][] memory gatewayOutputs =
                gateway.processLendingInstructions(instructions);
            _afterSendInstructions(address(gateway), instructions, gatewayOutputs, true);
            for (uint256 j = 0; j < gatewayOutputs.length; j++) {
                allOutputs[outIndex++] = gatewayOutputs[j];
            }
        }
    }

    /// @notice Aggregate approvals required by gateways for the provided instructions
    /// @dev Mirrors Cairo get_authorizations_for_instructions; approvals same as v1 gateways
    function getAuthorizationsForInstructions(ProtocolInstruction[] calldata protocolInstructions)
        external
        view
        returns (address[] memory targets, bytes[] memory calldatas)
    {
        uint256 total = 0;
        // First pass: count
        for (uint256 i = 0; i < protocolInstructions.length; i++) {
            ILendingGateway gateway = gateways[protocolInstructions[i].protocolName];
            require(address(gateway) != address(0), "Protocol not supported");
            (address[] memory t, ) = gateway.getAuthorizationsForInstructions(protocolInstructions[i].instructions);
            total += t.length; // assume returned arrays are aligned
        }
        targets = new address[](total);
        calldatas = new bytes[](total);
        uint256 idx = 0;
        // Second pass: fill
        for (uint256 i = 0; i < protocolInstructions.length; i++) {
            ILendingGateway gateway = gateways[protocolInstructions[i].protocolName];
            (address[] memory t, bytes[] memory d) = gateway.getAuthorizationsForInstructions(protocolInstructions[i].instructions);
            for (uint256 j = 0; j < t.length; j++) {
                targets[idx] = t[j];
                calldatas[idx] = d[j];
                idx++;
            }
        }
    }

    function _beforeSendInstructions(
        address gateway,
        ILendingGateway.LendingInstruction[] calldata instructions,
        bool shouldTransfer
    ) internal {
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
        ILendingGateway.InstructionOutput[][] memory outputs,
        bool shouldTransfer
    ) internal {
        for (uint256 i = 0; i < instructions.length; i++) {
            ILendingGateway.LendingInstruction calldata ins = instructions[i];
            ILendingGateway.InstructionOutput[] memory outs = outputs[i];
            if (ins.instructionType == ILendingGateway.InstructionType.Borrow ||
                ins.instructionType == ILendingGateway.InstructionType.Withdraw
            ) {
                if (shouldTransfer && outs.length > 0) {
                    IERC20(outs[0].token).safeTransfer(ins.basic.user, outs[0].balance);
                }
            } else if (ins.instructionType == ILendingGateway.InstructionType.Repay) {
                if (ins.repayAll) {
                    IERC20(ins.basic.token).approve(gateway, 0);
                }
                if (shouldTransfer && outs.length > 1 && outs[1].balance > 0) {
                    IERC20(outs[1].token).safeTransfer(ins.basic.user, outs[1].balance);
                }
            }
        }
    }
}
