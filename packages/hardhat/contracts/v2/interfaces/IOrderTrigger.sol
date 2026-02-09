// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IOrderTrigger
/// @notice Interface for pluggable order triggers in the Kapan conditional order system
/// @dev Triggers determine when an order should execute and how much to trade
interface IOrderTrigger {
    /// @notice Check if the order should execute based on current conditions
    /// @param staticData ABI-encoded trigger-specific parameters
    /// @param owner The order owner (user whose position is being monitored)
    /// @return shouldExecute True if the trigger condition is met
    /// @return reason Human-readable reason for the result (for debugging/logging)
    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view returns (bool shouldExecute, string memory reason);

    /// @notice Calculate the execution amounts when the trigger fires
    /// @dev Only called when shouldExecute returns true
    /// @param staticData ABI-encoded trigger-specific parameters
    /// @param owner The order owner
    /// @param iterationCount Number of executions completed so far (for chunked orders)
    /// @return sellAmount Amount of sell token to trade in this execution
    /// @return minBuyAmount Minimum amount to receive (includes slippage protection)
    function calculateExecution(
        bytes calldata staticData,
        address owner,
        uint256 iterationCount
    ) external view returns (uint256 sellAmount, uint256 minBuyAmount);

    /// @notice Check if the order is complete and should stop executing
    /// @dev Called after each execution to determine if order should be marked complete
    /// @param staticData ABI-encoded trigger-specific parameters
    /// @param owner The order owner
    /// @param iterationCount Number of executions completed so far
    /// @return complete True if the order goal has been reached
    function isComplete(
        bytes calldata staticData,
        address owner,
        uint256 iterationCount
    ) external view returns (bool complete);

    /// @notice Get human-readable name of the trigger type
    /// @return name Trigger name (e.g., "LTV", "Price", "HealthFactor")
    function triggerName() external pure returns (string memory name);
}
