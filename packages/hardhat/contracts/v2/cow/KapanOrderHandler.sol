// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IConditionalOrder, IConditionalOrderGenerator, PollTryNextBlock, PollNever, OrderNotValid } from "../interfaces/cow/IConditionalOrder.sol";
import { GPv2Order } from "../interfaces/cow/GPv2Order.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { KapanOrderManager } from "./KapanOrderManager.sol";

/// @title KapanOrderHandler
/// @notice Generates CoW Protocol orders for Kapan leveraged positions
/// @dev Implements IConditionalOrderGenerator for ComposableCoW integration
contract KapanOrderHandler is IConditionalOrderGenerator, IERC165 {
    
    // ============ Errors ============
    error InvalidOrderManager();
    error OrderNotActive();
    
    // ============ State Variables ============
    
    /// @notice The KapanOrderManager that stores order contexts
    KapanOrderManager public immutable orderManager;
    
    /// @notice Chunk window duration - each chunk is valid for this period
    /// @dev Using fixed windows ensures deterministic validTo = same order hash during window
    uint256 public constant CHUNK_WINDOW = 30 minutes;

    // ============ Constructor ============
    
    constructor(address _orderManager) {
        if (_orderManager == address(0)) revert InvalidOrderManager();
        orderManager = KapanOrderManager(_orderManager);
    }

    // ============ IConditionalOrderGenerator Implementation ============
    
    /// @notice Generate a tradeable order for the current chunk
    /// @param owner The order owner (KapanOrderManager address)
    /// @param sender The caller (usually ComposableCoW)
    /// @param ctx The execution context (unused for single orders)
    /// @param staticInput ABI-encoded orderHash
    /// @param offchainInput Off-chain provided data (unused)
    /// @return order The GPv2Order.Data struct for this chunk
    function getTradeableOrder(
        address owner,
        address sender,
        bytes32 ctx,
        bytes calldata staticInput,
        bytes calldata offchainInput
    ) external view override returns (GPv2Order.Data memory order) {
        // Silence unused variable warnings
        (owner, sender, ctx, offchainInput);
        
        // Decode the order hash from static input
        bytes32 orderHash = abi.decode(staticInput, (bytes32));
        
        // Get order context from manager
        KapanOrderManager.OrderContext memory orderCtx = orderManager.getOrder(orderHash);
        
        // Validate order is active
        if (orderCtx.status != KapanOrderManager.OrderStatus.Active) {
            revert PollNever("order_not_active");
        }
        
        // Check if order is complete
        if (orderManager.isOrderComplete(orderHash)) {
            revert PollNever("order_complete");
        }
        
        // Calculate remaining amount
        uint256 remaining = orderCtx.params.preTotalAmount - orderCtx.executedAmount;
        if (remaining == 0) {
            revert PollNever("fully_executed");
        }
        
        // Calculate this chunk's sell amount
        uint256 sellAmount = remaining < orderCtx.params.chunkSize 
            ? remaining 
            : orderCtx.params.chunkSize;
        
        // Calculate deterministic validTo based on chunk windows (TWAP-style)
        // This ensures the same order hash is returned during a window period,
        // preventing order spam where each poll creates a new CoW order.
        uint256 validTo = _calculateValidTo(orderCtx.createdAt, orderCtx.iterationCount);
        
        // Receiver is always OrderManager - it needs the bought tokens for post-hook execution
        // (Previously had flash loan special case for Settlement, but that was incorrect -
        // Aave's working implementation shows receiver should be where post-hook runs)
        address receiver = address(orderManager);
        
        // Build the order with deterministic validTo
        order = GPv2Order.Data({
            sellToken: IERC20(orderCtx.params.sellToken),
            buyToken: IERC20(orderCtx.params.buyToken),
            receiver: receiver,
            sellAmount: sellAmount,
            buyAmount: orderCtx.params.minBuyPerChunk,
            validTo: uint32(validTo),
            appData: orderCtx.params.appDataHash,
            feeAmount: 0,  // Fee is taken from sellAmount in CoW Protocol
            kind: GPv2Order.KIND_SELL,
            partiallyFillable: false,  // Each chunk must fill completely
            sellTokenBalance: GPv2Order.BALANCE_ERC20,
            buyTokenBalance: GPv2Order.BALANCE_ERC20
        });
    }
    
    /// @notice Calculate deterministic validTo timestamp for a chunk
    /// @dev Uses fixed time windows so multiple polls return the same validTo.
    ///      If chunk doesn't fill within its window, we extend to the current window.
    /// @param createdAt Order creation timestamp
    /// @param iterationCount Current chunk index (0-based)
    /// @return validTo The validTo timestamp for this chunk's order
    function _calculateValidTo(uint256 createdAt, uint256 iterationCount) internal view returns (uint256) {
        // Calculate the ideal window for this chunk
        uint256 chunkWindowStart = createdAt + (iterationCount * CHUNK_WINDOW);
        uint256 chunkWindowEnd = chunkWindowStart + CHUNK_WINDOW - 1;
        
        // If we're still within the chunk's ideal window, use it
        if (block.timestamp <= chunkWindowEnd) {
            return chunkWindowEnd;
        }
        
        // Chunk didn't fill in time - extend to current window
        // This allows the order to remain valid and retry
        uint256 elapsedSinceCreate = block.timestamp - createdAt;
        uint256 currentWindowIndex = elapsedSinceCreate / CHUNK_WINDOW;
        return createdAt + ((currentWindowIndex + 1) * CHUNK_WINDOW) - 1;
    }
    
    /// @notice Verify that a proposed order matches the conditional order
    /// @dev Called by ComposableCoW during signature verification
    function verify(
        address owner,
        address sender,
        bytes32 _hash,
        bytes32 domainSeparator,
        bytes32 ctx,
        bytes calldata staticInput,
        bytes calldata offchainInput,
        GPv2Order.Data calldata order
    ) external view override {
        // Silence unused variable warnings
        (owner, sender, _hash, domainSeparator, ctx, offchainInput);
        
        // Decode the order hash
        bytes32 orderHash = abi.decode(staticInput, (bytes32));
        
        // Get order context
        KapanOrderManager.OrderContext memory orderCtx = orderManager.getOrder(orderHash);
        
        // Validate order is active
        if (orderCtx.status != KapanOrderManager.OrderStatus.Active) {
            revert OrderNotValid("order_not_active");
        }
        
        // Validate tokens match
        if (address(order.sellToken) != orderCtx.params.sellToken) {
            revert OrderNotValid("sell_token_mismatch");
        }
        if (address(order.buyToken) != orderCtx.params.buyToken) {
            revert OrderNotValid("buy_token_mismatch");
        }
        
        // Validate receiver - must always be OrderManager for post-hook token handling
        if (order.receiver != address(orderManager)) {
            revert OrderNotValid("invalid_receiver");
        }
        
        // Validate sell amount doesn't exceed chunk size
        if (order.sellAmount > orderCtx.params.chunkSize) {
            revert OrderNotValid("sell_amount_exceeds_chunk");
        }
        
        // Validate minimum buy amount
        if (order.buyAmount < orderCtx.params.minBuyPerChunk) {
            revert OrderNotValid("buy_amount_too_low");
        }
        
        // Validate appData matches
        if (order.appData != orderCtx.params.appDataHash) {
            revert OrderNotValid("appdata_mismatch");
        }
        
        // Order is valid
    }

    // ============ View Functions ============
    
    /// @notice Get the current chunk parameters for an order
    /// @param orderHash The order hash
    /// @return sellAmount The sell amount for the next chunk
    /// @return minBuyAmount The minimum buy amount
    /// @return isComplete Whether the order is complete
    function getChunkParams(bytes32 orderHash) external view returns (
        uint256 sellAmount,
        uint256 minBuyAmount,
        bool isComplete
    ) {
        KapanOrderManager.OrderContext memory orderCtx = orderManager.getOrder(orderHash);
        
        isComplete = orderManager.isOrderComplete(orderHash) || 
                     orderCtx.status != KapanOrderManager.OrderStatus.Active;
        
        if (isComplete) {
            return (0, 0, true);
        }
        
        uint256 remaining = orderCtx.params.preTotalAmount - orderCtx.executedAmount;
        sellAmount = remaining < orderCtx.params.chunkSize 
            ? remaining 
            : orderCtx.params.chunkSize;
        minBuyAmount = orderCtx.params.minBuyPerChunk;
    }
    
    /// @notice Get order progress
    /// @param orderHash The order hash
    /// @return executed Amount executed so far
    /// @return total Total amount to execute
    /// @return iterations Number of iterations completed
    function getProgress(bytes32 orderHash) external view returns (
        uint256 executed,
        uint256 total,
        uint256 iterations
    ) {
        KapanOrderManager.OrderContext memory orderCtx = orderManager.getOrder(orderHash);
        executed = orderCtx.executedAmount;
        total = orderCtx.params.preTotalAmount;
        iterations = orderCtx.iterationCount;
    }

    // ============ ERC-165 Implementation ============

    /// @notice Check if contract supports an interface
    /// @dev Required for ComposableCoW to verify handler compatibility
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IConditionalOrderGenerator).interfaceId ||
               interfaceId == type(IConditionalOrder).interfaceId ||
               interfaceId == type(IERC165).interfaceId;
    }
}
