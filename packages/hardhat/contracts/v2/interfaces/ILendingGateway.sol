// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILendingGateway {
    struct BasicInstruction {
        address token;
        uint256 amount;
        address user;
    }

    enum InstructionType {
        Deposit,
        Borrow,
        Repay,
        Withdraw
    }

    struct LendingInstruction {
        InstructionType instructionType;
        BasicInstruction basic;
        bool repayAll; // used for Repay
        bool withdrawAll; // used for Withdraw
    }

    /// @notice Execute a batch of lending instructions for this protocol
    /// @param instructions The array of instructions to process
    function processLendingInstructions(LendingInstruction[] calldata instructions) external;
}
