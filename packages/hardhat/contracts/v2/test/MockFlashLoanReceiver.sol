// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title MockFlashLoanReceiver
 * @notice Simple contract that receives tokens (simulates flash loan repayment receiver)
 * @dev Used in tests to verify flash loan repayment flow
 */
contract MockFlashLoanReceiver {
    // Just receive tokens, nothing else needed
    receive() external payable {}
}
