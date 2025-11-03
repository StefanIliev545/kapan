// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolTypes} from "../interfaces/ProtocolTypes.sol";
import {IGateway} from "../interfaces/IGateway.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockGateway is IGateway {
    using SafeERC20 for IERC20;

    event Instruction(bytes data);
    event PulledToken(address token, uint256 amount);

    // Mock instruction struct: just encodes whether to produce output
    struct MockInstruction {
        bool produceOutput;
    }

    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        emit Instruction(data);
        
        // Decode instruction
        MockInstruction memory instr = abi.decode(data, (MockInstruction));
        
        // If we have inputs, pull the first one from router (msg.sender)
        if (inputs.length > 0) {
            ProtocolTypes.Output memory input = inputs[0];
            IERC20(input.token).safeTransferFrom(msg.sender, address(this), input.amount);
            emit PulledToken(input.token, input.amount);
            
            // Optionally produce an output (for testing chaining)
            // If producing output, send tokens back to router so the output represents real tokens
            if (instr.produceOutput) {
                IERC20(input.token).safeTransfer(msg.sender, input.amount);
                outputs = new ProtocolTypes.Output[](1);
                outputs[0] = input;
            } else {
                outputs = new ProtocolTypes.Output[](0);
            }
        } else {
            outputs = new ProtocolTypes.Output[](0);
        }
    }

    function authorize(ProtocolTypes.LendingInstruction[] calldata /* instrs */, address /* caller */)
        external
        pure
        returns (address[] memory targets, bytes[] memory data)
    {
        // Mock gateway doesn't require any user-side approvals
        targets = new address[](0);
        data = new bytes[](0);
    }
}


