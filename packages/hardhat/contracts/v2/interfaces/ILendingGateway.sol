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

    struct InstructionOutput {
        address token;
        uint256 balance;
    }

    /// @notice Execute a batch of lending instructions for this protocol
    /// @param instructions The array of instructions to process
    /// @return outputs The resulting token movements for each instruction
    function processLendingInstructions(LendingInstruction[] calldata instructions)
        external
        returns (InstructionOutput[][] memory outputs);

    /// @notice Return encoded approvals a user should perform before executing the given instructions
    /// @dev Mirrors the Cairo gateways pattern. Approvals are the same as v1 gateways.
    /// For example: ERC20 approve(router, amount) for Deposit/Repay, protocol-specific
    /// approvals like Aave approveDelegation for Borrow, or Compound allow for Borrow/Withdraw.
    /// @param instructions The array of instructions to analyze
    /// @return targets Target contract addresses for each approval call
    /// @return calldatas ABI-encoded calldata for each approval call (including selector)
    function getAuthorizationsForInstructions(LendingInstruction[] calldata instructions)
        external
        view
        returns (address[] memory targets, bytes[] memory calldatas);
}
