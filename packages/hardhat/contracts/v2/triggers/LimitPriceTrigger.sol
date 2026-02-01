// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IOrderTrigger } from "../interfaces/IOrderTrigger.sol";

/// @title KapanViewRouter Interface (for price and position queries)
interface IKapanViewRouter {
    function getCollateralPrice(
        bytes4 protocolId,
        address collateralToken,
        bytes calldata context
    ) external view returns (uint256 price);

    function getDebtPrice(
        bytes4 protocolId,
        address debtToken,
        bytes calldata context
    ) external view returns (uint256 price);

    function getPositionValue(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd);
}

/// @title LimitPriceTrigger
/// @notice Triggers order execution when price crosses a limit threshold
/// @dev Designed for chunked limit orders - executes fixed chunks when price condition is met
///
/// Use cases:
/// - Take profit: Sell when price rises above limit
/// - Stop loss: Sell when price drops below limit
/// - DCA buy: Buy when price drops below limit
///
/// Chunking:
/// - totalSellAmount is the full amount to sell across all chunks
/// - numChunks determines how many iterations
/// - Each iteration sells totalSellAmount / numChunks
/// - Last iteration sells remaining to handle rounding
contract LimitPriceTrigger is IOrderTrigger {
    // ============ Errors ============
    error InvalidTriggerParams();

    // ============ Constants ============
    bytes4 public constant AAVE_V3 = bytes4(keccak256("aave-v3"));
    bytes4 public constant COMPOUND_V3 = bytes4(keccak256("compound-v3"));
    bytes4 public constant MORPHO_BLUE = bytes4(keccak256("morpho-blue"));

    // ============ Immutables ============
    IKapanViewRouter public immutable viewRouter;

    // ============ Structs ============

    /// @notice Trigger parameters for price-based limit orders
    struct TriggerParams {
        bytes4 protocolId;           // Protocol for price oracle
        bytes protocolContext;       // Protocol-specific context
        address sellToken;           // Token to sell
        address buyToken;            // Token to buy
        uint8 sellDecimals;          // Decimals of sell token
        uint8 buyDecimals;           // Decimals of buy token
        uint256 limitPrice;          // Limit price (8 decimals, like Chainlink)
        bool triggerAbovePrice;      // true = trigger when price >= limit (take profit)
                                     // false = trigger when price <= limit (stop loss)
        uint256 totalSellAmount;     // Total amount to sell across all chunks (SELL orders)
                                     // OR max amount willing to sell (BUY orders)
        uint256 totalBuyAmount;      // Total amount to buy across all chunks (BUY orders)
                                     // Ignored for SELL orders
        uint8 numChunks;             // Number of chunks (1 = single execution)
        uint256 maxSlippageBps;      // Maximum slippage tolerance
        bool isKindBuy;              // true = BUY order (exact buy, max sell), false = SELL order
    }

    // ============ Constructor ============

    constructor(address _viewRouter) {
        if (_viewRouter == address(0)) revert InvalidTriggerParams();
        viewRouter = IKapanViewRouter(_viewRouter);
    }

    // ============ IOrderTrigger Implementation ============

    /// @inheritdoc IOrderTrigger
    /// @dev For limit orders, tradeable until all chunks are filled
    function shouldExecute(
        bytes calldata staticData,
        address /* owner */
    ) external view override returns (bool, string memory) {
        if (staticData.length == 0) {
            return (false, "No params");
        }
        // Note: iteration count check happens in handler via isComplete
        // shouldExecute just confirms the order params are valid
        return (true, "Limit order active");
    }

    /// @inheritdoc IOrderTrigger
    /// @dev For SELL orders: returns (exactSellAmount, minBuyAmount)
    ///      For BUY orders: returns (maxSellAmount, exactBuyAmount)
    function calculateExecution(
        bytes calldata staticData,
        address /* owner */,
        uint256 iterationCount
    ) external pure override returns (uint256 sellAmount, uint256 buyAmount) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        uint8 chunks = params.numChunks > 0 ? params.numChunks : 1;

        if (params.isKindBuy) {
            // BUY order: exact buyAmount, calculate maxSellAmount
            uint256 buyChunkSize = params.totalBuyAmount / chunks;

            // For last chunk, use remaining to handle rounding
            if (iterationCount >= chunks - 1) {
                uint256 alreadyBought = iterationCount * buyChunkSize;
                buyAmount = params.totalBuyAmount > alreadyBought
                    ? params.totalBuyAmount - alreadyBought
                    : 0;
            } else {
                buyAmount = buyChunkSize;
            }

            if (buyAmount == 0) return (0, 0);

            // Calculate maxSellAmount from limit price
            // limitPrice = (buyAmount / sellAmount) * 1e8
            // So: sellAmount = buyAmount * 1e8 / limitPrice, adjusted for decimals
            uint256 expectedSell = (buyAmount * 1e8 * (10 ** params.sellDecimals))
                / (params.limitPrice * (10 ** params.buyDecimals));

            // Apply slippage (add slippage for max sell)
            sellAmount = (expectedSell * (10000 + params.maxSlippageBps)) / 10000;

            // Cap to totalSellAmount if specified (user's max willingness to sell)
            if (params.totalSellAmount > 0 && sellAmount > params.totalSellAmount) {
                sellAmount = params.totalSellAmount;
            }
        } else {
            // SELL order: exact sellAmount, calculate minBuyAmount
            uint256 sellChunkSize = params.totalSellAmount / chunks;

            // For last chunk, use remaining to handle rounding
            if (iterationCount >= chunks - 1) {
                uint256 alreadySold = iterationCount * sellChunkSize;
                sellAmount = params.totalSellAmount > alreadySold
                    ? params.totalSellAmount - alreadySold
                    : 0;
            } else {
                sellAmount = sellChunkSize;
            }

            if (sellAmount == 0) return (0, 0);

            // Calculate minBuyAmount from limit price (exchange rate)
            // limitPrice = (buyAmount / sellAmount) * 1e8 (set by frontend)
            // So: expectedBuy = sellAmount * limitPrice / 1e8, adjusted for decimals
            uint256 expectedBuy = (sellAmount * params.limitPrice * (10 ** params.buyDecimals))
                / (1e8 * (10 ** params.sellDecimals));

            // Apply slippage (subtract for min buy)
            buyAmount = (expectedBuy * (10000 - params.maxSlippageBps)) / 10000;
        }
    }

    /// @inheritdoc IOrderTrigger
    function isComplete(
        bytes calldata staticData,
        address /* owner */,
        uint256 iterationCount
    ) external pure override returns (bool) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        uint8 chunks = params.numChunks > 0 ? params.numChunks : 1;

        // Complete when all chunks executed
        return iterationCount >= chunks;
    }

    /// @inheritdoc IOrderTrigger
    function triggerName() external pure override returns (string memory) {
        return "LimitPrice";
    }

    // ============ View Helpers ============

    /// @notice Get current price for a token
    function getCurrentPrice(
        bytes4 protocolId,
        address token,
        bytes calldata context
    ) external view returns (uint256) {
        return viewRouter.getCollateralPrice(protocolId, token, context);
    }

    /// @notice Encode trigger params for order creation
    function encodeTriggerParams(TriggerParams memory params) external pure returns (bytes memory) {
        return abi.encode(params);
    }

    /// @notice Decode trigger params from static data
    function decodeTriggerParams(bytes calldata staticData) external pure returns (TriggerParams memory) {
        return abi.decode(staticData, (TriggerParams));
    }

}
