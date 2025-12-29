// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IConditionalOrder } from "./IConditionalOrder.sol";
import { GPv2Order } from "./GPv2Order.sol";

/// @title IComposableCoW - Interface for the ComposableCoW contract
/// @notice Registry for conditional orders on CoW Protocol
interface IComposableCoW {
    /// @dev Proof location for merkle roots
    struct Proof {
        uint256 location;
        bytes data;
    }

    /// @dev Payload passed for signature verification
    struct PayloadStruct {
        bytes32[] proof;
        IConditionalOrder.ConditionalOrderParams params;
        bytes offchainInput;
    }

    // ============ Events ============

    /// @notice Emitted when a conditional order is created
    event ConditionalOrderCreated(
        address indexed owner,
        IConditionalOrder.ConditionalOrderParams params
    );

    /// @notice Emitted when a merkle root is set
    event MerkleRootSet(
        address indexed owner,
        bytes32 root,
        Proof proof
    );

    // ============ State Variables ============

    /// @notice Get the merkle root for an owner
    function roots(address owner) external view returns (bytes32);

    /// @notice Check if a single order exists
    function singleOrders(address owner, bytes32 singleOrderHash) external view returns (bool);

    /// @notice Get order-specific storage
    function cabinet(address owner, bytes32 ctx) external view returns (bytes32);

    // ============ User Functions ============

    /// @notice Create a single conditional order
    /// @param params The conditional order parameters
    /// @param dispatch If true, emit ConditionalOrderCreated event
    function create(
        IConditionalOrder.ConditionalOrderParams calldata params,
        bool dispatch
    ) external;

    /// @notice Create a conditional order with context
    /// @param params The conditional order parameters
    /// @param factory Factory to generate context value
    /// @param data Data passed to factory
    /// @param dispatch If true, emit ConditionalOrderCreated event
    function createWithContext(
        IConditionalOrder.ConditionalOrderParams calldata params,
        IValueFactory factory,
        bytes calldata data,
        bool dispatch
    ) external;

    /// @notice Remove a single conditional order
    /// @param singleOrderHash Hash of the order to remove: H(ConditionalOrderParams)
    function remove(bytes32 singleOrderHash) external;

    /// @notice Set the merkle root for conditional orders
    /// @param root The merkle root
    /// @param proof Proof data for the root
    function setRoot(bytes32 root, Proof calldata proof) external;

    /// @notice Set the merkle root with context
    /// @param root The merkle root
    /// @param proof Proof data for the root
    /// @param factory Factory to generate context value
    /// @param data Data passed to factory
    function setRootWithContext(
        bytes32 root,
        Proof calldata proof,
        IValueFactory factory,
        bytes calldata data
    ) external;

    /// @notice Set cabinet value for an order
    /// @param ctx The context (order hash)
    /// @param value The value to store
    function setCabinet(bytes32 ctx, bytes32 value) external;

    // ============ Watch-tower Functions ============

    /// @notice Get a tradeable order with signature for submission to CoW API
    /// @param owner The owner of the conditional order
    /// @param params The conditional order parameters
    /// @param offchainInput Off-chain provided data
    /// @param proof Merkle proof (empty for single orders)
    /// @return order The tradeable GPv2Order
    /// @return signature The ERC-1271 signature for the order
    function getTradeableOrderWithSignature(
        address owner,
        IConditionalOrder.ConditionalOrderParams calldata params,
        bytes calldata offchainInput,
        bytes32[] calldata proof
    ) external view returns (GPv2Order.Data memory order, bytes memory signature);

    /// @notice Compute the hash of conditional order params
    /// @param params The conditional order parameters
    /// @return The keccak256 hash
    function hash(IConditionalOrder.ConditionalOrderParams memory params) external pure returns (bytes32);
}

/// @title IValueFactory - Interface for context value factories
interface IValueFactory {
    function getValue(bytes calldata data) external view returns (bytes32);
}
