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

    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        emit Instruction(data);
        
        // Decode as LendingInstruction (router expects this format)
        ProtocolTypes.LendingInstruction memory instr = abi.decode(data, (ProtocolTypes.LendingInstruction));
        
        // Use amount > 0 to determine if we should produce output
        // amount == 0 means no output, amount > 0 means produce output
        bool produceOutput = instr.amount > 0;
        
        // If we have inputs, try to pull the first one from router (msg.sender)
        // Note: This will fail if router hasn't approved us, which is fine for tests
        // that just verify stack resumption
        if (inputs.length > 0) {
            ProtocolTypes.Output memory input = inputs[0];
            // Only try to pull if we have an allowance (for tests that set up approvals)
            // Otherwise, just emit the instruction event without pulling tokens
            try IERC20(input.token).transferFrom(msg.sender, address(this), input.amount) returns (bool success) {
                if (success) {
                    emit PulledToken(input.token, input.amount);
                    
                    // Optionally produce an output (for testing chaining)
                    // If producing output, send tokens back to router so the output represents real tokens
                    if (produceOutput) {
                        IERC20(input.token).safeTransfer(msg.sender, input.amount);
                        outputs = new ProtocolTypes.Output[](1);
                        outputs[0] = input;
                    } else {
                        outputs = new ProtocolTypes.Output[](0);
                    }
                } else {
                    // Transfer failed, just emit instruction and return empty outputs
                    outputs = new ProtocolTypes.Output[](0);
                }
            } catch {
                // Transfer failed (no allowance or insufficient balance), just emit instruction
                // This is fine for tests that just verify stack resumption
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


