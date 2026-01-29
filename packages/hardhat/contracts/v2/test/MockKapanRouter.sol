// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolTypes } from "../interfaces/ProtocolTypes.sol";

/// @title MockKapanRouter
/// @notice Minimal mock of KapanRouter for testing KapanConditionalOrderManager
contract MockKapanRouter {
    // Track calls for verification
    uint256 public callCount;
    bytes public lastCallData;

    /// @notice Mock implementation of processProtocolInstructions
    function processProtocolInstructions(
        ProtocolTypes.ProtocolInstruction[] calldata instructions
    ) external {
        callCount++;
        lastCallData = abi.encode(instructions);
    }

    /// @notice Always returns true for authorization checks
    function isAuthorizedFor(address) external pure returns (bool) {
        return true;
    }

    /// @notice Reset state between tests
    function reset() external {
        callCount = 0;
        lastCallData = "";
    }
}
