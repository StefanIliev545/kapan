// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IConditionalOrder, IConditionalOrderGenerator, PollTryNextBlock, PollNever, OrderNotValid } from "../interfaces/cow/IConditionalOrder.sol";
import { GPv2Order } from "../interfaces/cow/GPv2Order.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IOrderTrigger } from "../interfaces/IOrderTrigger.sol";

/// @notice Minimal interface to read from KapanConditionalOrderManager
interface IKapanConditionalOrderManager {
    enum OrderStatus { None, Active, Completed, Cancelled }

    struct KapanOrderParams {
        address user;
        address trigger;
        bytes triggerStaticData;
        bytes preInstructions;
        address sellToken;
        address buyToken;
        bytes postInstructions;
        bytes32 appDataHash;
        uint256 maxIterations;
        address sellTokenRefundAddress;
        bool isKindBuy;
    }

    struct OrderContext {
        KapanOrderParams params;
        OrderStatus status;
        uint256 iterationCount;
        uint256 createdAt;
    }

    function getOrder(bytes32 orderHash) external view returns (OrderContext memory);
    function chunkWindow() external view returns (uint256);
}

/// @title KapanConditionalOrderHandler
/// @notice Generates CoW Protocol orders for Kapan conditional/trigger-based orders (ADL, stop-loss, etc.)
/// @dev Implements IConditionalOrderGenerator for ComposableCoW integration.
///      This is a STATELESS handler that reads order data from KapanConditionalOrderManager.
///      Separating handler from manager is required because:
///      - Handler must implement IERC165 for ComposableCoW to verify interface support
///      - Manager (owner) must NOT implement IERC165 to avoid Safe/fallback handler path
contract KapanConditionalOrderHandler is IConditionalOrderGenerator, IERC165 {

    // ============ State Variables ============

    /// @notice The KapanConditionalOrderManager that stores order contexts
    IKapanConditionalOrderManager public immutable manager;

    // ============ Constructor ============

    constructor(address _manager) {
        require(_manager != address(0), "Invalid manager");
        manager = IKapanConditionalOrderManager(_manager);
    }

    // ============ IConditionalOrderGenerator Implementation ============

    /// @notice Generate a tradeable order if trigger condition is met
    /// @dev Called by ComposableCoW via getTradeableOrderWithSignature
    /// @param staticInput ABI-encoded orderHash
    /// @return order The GPv2Order.Data struct
    function getTradeableOrder(
        address,
        address,
        bytes32,
        bytes calldata staticInput,
        bytes calldata
    ) external view override returns (GPv2Order.Data memory order) {
        bytes32 orderHash = abi.decode(staticInput, (bytes32));
        IKapanConditionalOrderManager.OrderContext memory ctx = manager.getOrder(orderHash);

        // Validate order is active
        if (ctx.status != IKapanConditionalOrderManager.OrderStatus.Active) {
            revert PollNever("order_not_active");
        }

        // Get trigger
        IOrderTrigger trigger = IOrderTrigger(ctx.params.trigger);

        // Check if order is complete
        if (trigger.isComplete(ctx.params.triggerStaticData, ctx.params.user, ctx.iterationCount)) {
            revert PollNever("trigger_complete");
        }
        if (ctx.params.maxIterations > 0 && ctx.iterationCount >= ctx.params.maxIterations) {
            revert PollNever("max_iterations_reached");
        }

        // Check trigger condition
        (bool shouldExecute, string memory reason) = trigger.shouldExecute(
            ctx.params.triggerStaticData,
            ctx.params.user
        );

        if (!shouldExecute) {
            revert PollTryNextBlock(reason);
        }

        // Calculate amounts from trigger (trigger handles precision truncation to prevent spam)
        (uint256 sellAmount, uint256 minBuyAmount) = trigger.calculateExecution(
            ctx.params.triggerStaticData,
            ctx.params.user,
            ctx.iterationCount
        );

        if (sellAmount == 0) {
            revert PollNever("zero_sell_amount");
        }

        // Calculate deterministic validTo
        uint256 validTo = _calculateValidTo(ctx.createdAt, ctx.iterationCount);

        // Verify order hasn't expired
        if (block.timestamp > validTo) {
            revert PollTryNextBlock("window_expired");
        }

        // Build the order - receiver is manager (for post-hook token handling)
        // For BUY orders: sellAmount = maxSellAmount, buyAmount = exact buyAmount
        // For SELL orders: sellAmount = exact sellAmount, buyAmount = minBuyAmount
        order = GPv2Order.Data({
            sellToken: IERC20(ctx.params.sellToken),
            buyToken: IERC20(ctx.params.buyToken),
            receiver: address(manager),
            sellAmount: sellAmount,
            buyAmount: minBuyAmount,
            validTo: uint32(validTo),
            appData: ctx.params.appDataHash,
            feeAmount: 0,
            kind: ctx.params.isKindBuy ? GPv2Order.KIND_BUY : GPv2Order.KIND_SELL,
            partiallyFillable: false,
            sellTokenBalance: GPv2Order.BALANCE_ERC20,
            buyTokenBalance: GPv2Order.BALANCE_ERC20
        });
    }

    /// @notice Verify that a proposed order matches the conditional order
    /// @dev Called by ComposableCoW during signature verification
    function verify(
        address,
        address,
        bytes32,
        bytes32,
        bytes32,
        bytes calldata staticInput,
        bytes calldata,
        GPv2Order.Data calldata order
    ) external view override {
        bytes32 orderHash = abi.decode(staticInput, (bytes32));
        IKapanConditionalOrderManager.OrderContext memory ctx = manager.getOrder(orderHash);

        if (ctx.status != IKapanConditionalOrderManager.OrderStatus.Active) {
            revert OrderNotValid("order_not_active");
        }

        // Validate tokens match
        if (address(order.sellToken) != ctx.params.sellToken) {
            revert OrderNotValid("sell_token_mismatch");
        }
        if (address(order.buyToken) != ctx.params.buyToken) {
            revert OrderNotValid("buy_token_mismatch");
        }

        // Validate receiver is manager
        if (order.receiver != address(manager)) {
            revert OrderNotValid("invalid_receiver");
        }

        // Validate appData
        if (order.appData != ctx.params.appDataHash) {
            revert OrderNotValid("appdata_mismatch");
        }
    }

    // ============ Internal Functions ============

    /// @notice Calculate deterministic validTo timestamp
    /// @dev Reads chunkWindow from manager for consistency
    function _calculateValidTo(uint256 createdAt, uint256 iterationCount) internal view returns (uint256) {
        uint256 window = manager.chunkWindow();
        uint256 chunkWindowStart = createdAt + (iterationCount * window);
        uint256 chunkWindowEnd = chunkWindowStart + window - 1;

        if (block.timestamp <= chunkWindowEnd) {
            return chunkWindowEnd;
        }

        // Extend to current window
        uint256 elapsedSinceCreate = block.timestamp - createdAt;
        uint256 currentWindowIndex = elapsedSinceCreate / window;
        return createdAt + ((currentWindowIndex + 1) * window) - 1;
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
