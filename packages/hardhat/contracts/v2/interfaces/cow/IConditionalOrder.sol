// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { GPv2Order } from "./GPv2Order.sol";

/// @title IConditionalOrder - Interface for conditional order handlers
/// @notice Defines the interface for creating conditional/programmatic orders on CoW Protocol
interface IConditionalOrder {
    /// @dev Conditional order parameters stored on-chain
    struct ConditionalOrderParams {
        IConditionalOrder handler;
        bytes32 salt;
        bytes staticData;
    }

    /// @notice Verifies that a discrete order is valid for the conditional order
    /// @param owner The owner of the conditional order
    /// @param sender The msg.sender calling isValidSignature
    /// @param _hash The EIP-712 order digest
    /// @param domainSeparator The EIP-712 domain separator
    /// @param ctx The execution context (H(params) for single, merkle root for tree)
    /// @param staticInput Order-specific data known at creation time
    /// @param offchainInput Order-specific data NOT known at creation time
    /// @param order The proposed discrete order
    function verify(
        address owner,
        address sender,
        bytes32 _hash,
        bytes32 domainSeparator,
        bytes32 ctx,
        bytes calldata staticInput,
        bytes calldata offchainInput,
        GPv2Order.Data calldata order
    ) external view;
}

/// @title IConditionalOrderGenerator - Interface for conditional order generators
/// @notice Extends IConditionalOrder to generate tradeable orders
interface IConditionalOrderGenerator is IConditionalOrder {
    /// @notice Generates a tradeable GPv2Order based on the current state
    /// @param owner The owner of the conditional order
    /// @param sender The msg.sender (usually ComposableCoW)
    /// @param ctx The execution context
    /// @param staticInput Order-specific data known at creation time
    /// @param offchainInput Order-specific data provided by the watch-tower
    /// @return order The generated GPv2Order.Data struct
    function getTradeableOrder(
        address owner,
        address sender,
        bytes32 ctx,
        bytes calldata staticInput,
        bytes calldata offchainInput
    ) external view returns (GPv2Order.Data memory order);
}

/// @title Conditional Order Errors
/// @notice Custom errors for signaling to watch-towers

/// @dev Signal to try polling again at the next block
error PollTryNextBlock(string reason);

/// @dev Signal to try polling at a specific block
error PollTryAtBlock(uint256 blockNumber, string reason);

/// @dev Signal to try polling at a specific timestamp
error PollTryAtEpoch(uint256 timestamp, string reason);

/// @dev Signal to stop polling this order (completed or cancelled)
error PollNever(string reason);

/// @dev Signal that the order parameters are invalid
error OrderNotValid(string reason);

/// @dev Signal that the order is not currently tradeable
error OrderNotReady(string reason);
