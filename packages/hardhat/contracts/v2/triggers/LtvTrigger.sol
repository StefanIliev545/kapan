// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IOrderTrigger } from "../interfaces/IOrderTrigger.sol";

/// @title KapanViewRouter Interface
/// @dev Minimal interface for LtvTrigger - uses unified functions with context
interface IKapanViewRouter {
    /// @notice Get current LTV for any protocol
    /// @param protocolId Protocol identifier (AAVE_V3, COMPOUND_V3, etc.)
    /// @param user User address
    /// @param context Protocol-specific context (encoded)
    /// @return ltvBps Current LTV in basis points
    function getCurrentLtv(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 ltvBps);

    /// @notice Get position value for any protocol
    /// @param protocolId Protocol identifier
    /// @param user User address
    /// @param context Protocol-specific context (encoded)
    /// @return collateralValueUsd Total collateral in 8 decimals USD
    /// @return debtValueUsd Total debt in 8 decimals USD
    function getPositionValue(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd);

    /// @notice Get collateral price for any protocol
    /// @param protocolId Protocol identifier
    /// @param collateralToken Collateral token address
    /// @param context Protocol-specific context (encoded)
    /// @return price Price in 8 decimals USD
    function getCollateralPrice(
        bytes4 protocolId,
        address collateralToken,
        bytes calldata context
    ) external view returns (uint256 price);

    /// @notice Get debt price for any protocol
    /// @param protocolId Protocol identifier
    /// @param debtToken Debt token address
    /// @param context Protocol-specific context (encoded)
    /// @return price Price in 8 decimals USD
    function getDebtPrice(
        bytes4 protocolId,
        address debtToken,
        bytes calldata context
    ) external view returns (uint256 price);

    /// @notice Calculate minimum buy amount with slippage
    /// @param protocolId Protocol identifier
    /// @param sellAmount Amount to sell
    /// @param maxSlippageBps Maximum slippage in basis points
    /// @param collateralToken Collateral token
    /// @param debtToken Debt token
    /// @param collateralDecimals Collateral token decimals
    /// @param debtDecimals Debt token decimals
    /// @param context Protocol-specific context
    /// @return minBuyAmount Minimum acceptable buy amount
    function calculateMinBuy(
        bytes4 protocolId,
        uint256 sellAmount,
        uint256 maxSlippageBps,
        address collateralToken,
        address debtToken,
        uint8 collateralDecimals,
        uint8 debtDecimals,
        bytes calldata context
    ) external view returns (uint256 minBuyAmount);
}

/// @title LtvTrigger
/// @notice Triggers order execution when position LTV exceeds a threshold (ADL)
/// @dev Calculates deleverage amount to reach target LTV and minimum buy with slippage
contract LtvTrigger is IOrderTrigger {
    // ============ Errors ============

    error UnsupportedProtocol(bytes4 protocolId);
    error InvalidTriggerParams();

    // ============ Constants ============

    /// @notice Protocol identifiers
    bytes4 public constant AAVE_V3 = bytes4(keccak256("aave-v3"));
    bytes4 public constant COMPOUND_V3 = bytes4(keccak256("compound-v3"));
    bytes4 public constant MORPHO_BLUE = bytes4(keccak256("morpho-blue"));
    bytes4 public constant EULER_V2 = bytes4(keccak256("euler-v2"));
    bytes4 public constant VENUS = bytes4(keccak256("venus"));

    // ============ Immutables ============

    /// @notice The KapanViewRouter for LTV and price queries
    IKapanViewRouter public immutable viewRouter;

    // ============ Structs ============

    /// @notice Trigger parameters for LTV-based ADL
    struct TriggerParams {
        bytes4 protocolId; // Protocol identifier (AAVE_V3, COMPOUND_V3, etc.)
        bytes protocolContext; // Protocol-specific data (market params, sub-account, etc.)
        uint256 triggerLtvBps; // LTV threshold to trigger (e.g., 8000 = 80%)
        uint256 targetLtvBps; // Target LTV after deleverage (e.g., 6000 = 60%)
        address collateralToken; // Token to sell (withdraw from position)
        address debtToken; // Token to buy (repay debt)
        uint8 collateralDecimals; // Decimals of collateral token
        uint8 debtDecimals; // Decimals of debt token
        uint256 maxSlippageBps; // Maximum slippage tolerance
        uint8 numChunks; // Number of chunks to split deleverage (1 = full amount, 0 treated as 1)
    }

    // ============ Constructor ============

    constructor(address _viewRouter) {
        if (_viewRouter == address(0)) revert InvalidTriggerParams();
        viewRouter = IKapanViewRouter(_viewRouter);
    }

    // ============ IOrderTrigger Implementation ============

    /// @inheritdoc IOrderTrigger
    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view override returns (bool, string memory) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        uint256 currentLtv = _getCurrentLtv(params.protocolId, owner, params.protocolContext);

        if (currentLtv == 0) {
            return (false, "No position");
        }

        if (currentLtv > params.triggerLtvBps) {
            return (true, "LTV threshold exceeded");
        }

        return (false, "LTV below threshold");
    }

    /// @inheritdoc IOrderTrigger
    function calculateExecution(
        bytes calldata staticData,
        address owner
    ) external view override returns (uint256 sellAmount, uint256 minBuyAmount) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        // 1. Get current position value in USD (or unit of account)
        (uint256 collateralValueUsd, uint256 debtValueUsd) = _getPositionValue(
            params.protocolId,
            owner,
            params.protocolContext,
            params.collateralToken,
            params.debtToken
        );

        if (collateralValueUsd == 0 || debtValueUsd == 0) {
            return (0, 0);
        }

        // 2. Calculate deleverage amount to reach target LTV
        // Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)
        // Where X is the amount in USD to sell and repay
        uint256 deleverageUsd = _calculateDeleverageAmount(collateralValueUsd, debtValueUsd, params.targetLtvBps);

        if (deleverageUsd == 0) {
            return (0, 0);
        }

        // 3. Convert USD to collateral token amount
        uint256 collateralPrice = _getCollateralPrice(
            params.protocolId,
            params.collateralToken,
            params.protocolContext
        );

        if (collateralPrice == 0) {
            return (0, 0);
        }

        // sellAmount in collateral token units
        // deleverageUsd is in 8 decimals (protocol oracle standard)
        // collateralPrice is in 8 decimals
        // sellAmount = deleverageUsd * 10^collateralDecimals / collateralPrice
        sellAmount = (deleverageUsd * (10 ** params.collateralDecimals)) / collateralPrice;

        // 4. Apply chunking - divide by numChunks to spread deleverage across multiple executions
        // numChunks of 0 or 1 means full amount in single execution
        if (params.numChunks > 1) {
            sellAmount = sellAmount / params.numChunks;
        }

        if (sellAmount == 0) {
            return (0, 0);
        }

        // 5. Calculate minimum buy amount with slippage
        // ViewRouter.calculateMinBuy uses Aave/Chainlink prices for fair market rates
        minBuyAmount = _calculateMinBuy(
            params.protocolId,
            sellAmount,
            params.maxSlippageBps,
            params.collateralToken,
            params.debtToken,
            params.collateralDecimals,
            params.debtDecimals,
            params.protocolContext
        );
    }

    /// @inheritdoc IOrderTrigger
    function isComplete(
        bytes calldata staticData,
        address owner,
        uint256 /* iterationCount */
    ) external view override returns (bool) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        uint256 currentLtv = _getCurrentLtv(params.protocolId, owner, params.protocolContext);

        // Not complete if position doesn't exist (user closed it externally)
        // Order stays active to protect future positions
        if (currentLtv == 0) return false;

        // Complete when LTV is at or below target (goal achieved)
        return currentLtv <= params.targetLtvBps;
    }

    /// @inheritdoc IOrderTrigger
    function triggerName() external pure override returns (string memory) {
        return "LTV";
    }

    // ============ View Functions ============

    /// @notice Get current LTV for a user position
    /// @param protocolId Protocol identifier
    /// @param owner User address
    /// @param context Protocol-specific context
    /// @return ltvBps Current LTV in basis points
    function getCurrentLtv(
        bytes4 protocolId,
        address owner,
        bytes memory context
    ) external view returns (uint256 ltvBps) {
        return _getCurrentLtv(protocolId, owner, context);
    }

    /// @notice Decode trigger params from static data
    /// @param staticData ABI-encoded TriggerParams
    /// @return params Decoded trigger parameters
    function decodeTriggerParams(bytes calldata staticData) external pure returns (TriggerParams memory params) {
        return abi.decode(staticData, (TriggerParams));
    }

    /// @notice Encode trigger params to static data
    /// @param params Trigger parameters
    /// @return staticData ABI-encoded data
    function encodeTriggerParams(TriggerParams calldata params) external pure returns (bytes memory) {
        return abi.encode(params);
    }

    // ============ Internal Functions ============

    /// @dev Get current LTV from the ViewRouter (protocol-agnostic)
    function _getCurrentLtv(bytes4 protocolId, address owner, bytes memory context) internal view returns (uint256) {
        return viewRouter.getCurrentLtv(protocolId, owner, context);
    }

    /// @dev Get position value in USD (8 decimals) from the ViewRouter (protocol-agnostic)
    /// @param protocolId Protocol identifier
    /// @param owner User address
    /// @param context Protocol-specific context (market params, base token, etc.)
    /// @return collateralValueUsd Total collateral value in USD (8 decimals)
    /// @return debtValueUsd Total debt value in USD (8 decimals)
    function _getPositionValue(
        bytes4 protocolId,
        address owner,
        bytes memory context,
        address /* collateralToken */,
        address /* debtToken */
    ) internal view returns (uint256 collateralValueUsd, uint256 debtValueUsd) {
        return viewRouter.getPositionValue(protocolId, owner, context);
    }

    /// @dev Calculate deleverage amount in USD
    /// Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)
    function _calculateDeleverageAmount(
        uint256 collateralValueUsd,
        uint256 debtValueUsd,
        uint256 targetLtvBps
    ) internal pure returns (uint256) {
        // Defensive checks
        if (collateralValueUsd == 0) {
            return 0; // No collateral, nothing to deleverage
        }
        if (targetLtvBps >= 10000) {
            return 0; // Invalid target (>= 100%)
        }

        // Check if already at or below target
        uint256 currentLtvBps = (debtValueUsd * 10000) / collateralValueUsd;
        if (currentLtvBps <= targetLtvBps) {
            return 0;
        }

        // X = (debt - targetLtv * collateral) / (1 - targetLtv)
        // All in 8 decimals, targetLtv in basis points
        uint256 targetDebt = (collateralValueUsd * targetLtvBps) / 10000;
        uint256 numerator = debtValueUsd - targetDebt;
        uint256 denominator = 10000 - targetLtvBps;

        return (numerator * 10000) / denominator;
    }

    /// @dev Get collateral price in USD (8 decimals) from the ViewRouter (protocol-agnostic)
    function _getCollateralPrice(
        bytes4 protocolId,
        address collateralToken,
        bytes memory context
    ) internal view returns (uint256) {
        return viewRouter.getCollateralPrice(protocolId, collateralToken, context);
    }

    /// @dev Get debt price in USD (8 decimals) from the ViewRouter (protocol-agnostic)
    function _getDebtPrice(bytes4 protocolId, address debtToken, bytes memory context) internal view returns (uint256) {
        return viewRouter.getDebtPrice(protocolId, debtToken, context);
    }

    /// @dev Calculate minimum buy amount with slippage from the ViewRouter (protocol-agnostic)
    function _calculateMinBuy(
        bytes4 protocolId,
        uint256 sellAmount,
        uint256 maxSlippageBps,
        address collateralToken,
        address debtToken,
        uint8 collateralDecimals,
        uint8 debtDecimals,
        bytes memory context
    ) internal view returns (uint256) {
        return
            viewRouter.calculateMinBuy(
                protocolId,
                sellAmount,
                maxSlippageBps,
                collateralToken,
                debtToken,
                collateralDecimals,
                debtDecimals,
                context
            );
    }
}
