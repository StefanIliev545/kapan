// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IOrderTrigger } from "../interfaces/IOrderTrigger.sol";

/// @notice Morpho Blue MarketParams structure
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

/// @title KapanViewRouter Interface (same as LtvTrigger)
interface IKapanViewRouter {
    function getCurrentLtv(bytes4 protocolId, address user, bytes calldata context) external view returns (uint256 ltvBps);
    function getPositionValue(bytes4 protocolId, address user, bytes calldata context) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd);
    function getCollateralPrice(bytes4 protocolId, address collateralToken, bytes calldata context) external view returns (uint256 price);
    function getDebtPrice(bytes4 protocolId, address debtToken, bytes calldata context) external view returns (uint256 price);
    function getMorphoOraclePrice(MarketParams calldata params) external view returns (uint256 price);
}

/// @title AutoLeverageTrigger
/// @notice Triggers order execution when position LTV drops BELOW a threshold (auto-leverage)
/// @dev Opposite of LtvTrigger - increases leverage when under-leveraged
///
/// Flow:
/// 1. Pre-hook: Flash loan collateral → Deposit → Borrow debt → Push to OrderManager
/// 2. CoW Swap: Debt → Collateral
/// 3. Post-hook: Repay flash loan with received collateral
///
/// Order params:
///   - sellToken = debtToken (we're selling borrowed debt)
///   - buyToken = collateralToken (we're buying collateral to repay flash loan)
contract AutoLeverageTrigger is IOrderTrigger {
    // ============ Errors ============
    error InvalidTriggerParams();

    // ============ Constants ============
    bytes4 public constant AAVE_V3 = bytes4(keccak256("aave-v3"));
    bytes4 public constant COMPOUND_V3 = bytes4(keccak256("compound-v3"));
    bytes4 public constant MORPHO_BLUE = bytes4(keccak256("morpho-blue"));
    bytes4 public constant EULER_V2 = bytes4(keccak256("euler-v2"));

    // ============ Immutables ============
    IKapanViewRouter public immutable viewRouter;

    // ============ Structs ============

    /// @notice Trigger parameters for LTV-based auto-leverage
    struct TriggerParams {
        bytes4 protocolId;          // Protocol identifier
        bytes protocolContext;       // Protocol-specific data
        uint256 triggerLtvBps;       // LTV threshold BELOW which to trigger (e.g., 5000 = 50%)
        uint256 targetLtvBps;        // Target LTV after leverage (e.g., 7000 = 70%)
        address collateralToken;     // Token to BUY (receive from swap, repay flash loan)
        address debtToken;           // Token to SELL (borrow and swap)
        uint8 collateralDecimals;
        uint8 debtDecimals;
        uint256 maxSlippageBps;      // Maximum slippage tolerance
        uint8 numChunks;             // Number of chunks (1 = full amount)
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

        uint256 currentLtv = viewRouter.getCurrentLtv(params.protocolId, owner, params.protocolContext);

        if (currentLtv == 0) {
            return (false, "No position");
        }

        // Trigger when UNDER-leveraged (LTV too low)
        if (currentLtv < params.triggerLtvBps) {
            return (true, "LTV below threshold - under-leveraged");
        }

        return (false, "LTV above threshold");
    }

    /// @inheritdoc IOrderTrigger
    /// @dev Returns:
    ///   - sellAmount: debt tokens to borrow and swap
    ///   - minBuyAmount: collateral tokens expected (must cover flash loan + fee)
    function calculateExecution(
        bytes calldata staticData,
        address owner,
        uint256 /* iterationCount */
    ) external view override returns (uint256 sellAmount, uint256 minBuyAmount) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        // Get current position value in USD (8 decimals)
        (uint256 collateralValueUsd, uint256 debtValueUsd) = viewRouter.getPositionValue(
            params.protocolId,
            owner,
            params.protocolContext
        );

        if (collateralValueUsd == 0) return (0, 0);

        uint256 currentLtv = (debtValueUsd * 10000) / collateralValueUsd;
        if (currentLtv >= params.targetLtvBps) return (0, 0); // Already at or above target

        // Calculate how much additional debt (in USD) to reach target LTV
        //
        // After leverage:
        //   newDebt / newCollateral = targetLTV
        //   (D + ΔD) / (C + ΔC) = targetLTV
        //
        // Where ΔC ≈ ΔD (collateral received from swapping debt, roughly 1:1 in USD value)
        //
        // Solving for ΔD:
        //   D + ΔD = targetLTV × (C + ΔD)
        //   D + ΔD = targetLTV × C + targetLTV × ΔD
        //   ΔD × (1 - targetLTV) = targetLTV × C - D
        //   ΔD = (targetLTV × C - D) / (1 - targetLTV)
        //
        // This is the inverse of the ADL formula (which reduces both C and D)
        uint256 targetDebtUsd = (params.targetLtvBps * collateralValueUsd) / 10000;
        if (targetDebtUsd <= debtValueUsd) return (0, 0); // Already at or above target

        uint256 numerator = targetDebtUsd - debtValueUsd;
        uint256 denominator = 10000 - params.targetLtvBps;
        if (denominator == 0) return (0, 0); // Prevent division by zero at 100% LTV

        uint256 deltaDebtUsd = (numerator * 10000) / denominator;

        // Convert USD to debt token amount
        uint256 debtPrice = viewRouter.getDebtPrice(params.protocolId, params.debtToken, params.protocolContext);
        sellAmount = (deltaDebtUsd * (10 ** params.debtDecimals)) / debtPrice;

        // Apply chunking
        uint8 chunks = params.numChunks > 0 ? params.numChunks : 1;
        if (chunks > 1) {
            sellAmount = sellAmount / chunks;
        }

        if (sellAmount == 0) return (0, 0);

        // Truncate precision to prevent order spam from interest-bearing tokens
        // Interest changes cause slightly different amounts each block → different order hash → spam
        sellAmount = _truncatePrecision(sellAmount, params.debtDecimals);

        if (sellAmount == 0) return (0, 0);

        // Calculate minBuyAmount (collateral) with slippage
        // This must cover the flash loan repayment
        uint256 expectedCollateral;

        if (params.protocolId == MORPHO_BLUE) {
            // Morpho uses a special oracle that returns collateral/debt exchange rate at 36 decimals
            // Formula: collateralAmount = debtAmount * 1e36 / oraclePrice
            // The oracle accounts for decimal differences between tokens
            MarketParams memory marketParams = abi.decode(params.protocolContext, (MarketParams));
            uint256 morphoOraclePrice = viewRouter.getMorphoOraclePrice(marketParams);
            if (morphoOraclePrice > 0) {
                // sellAmount is in debt token decimals, result is in collateral token decimals
                expectedCollateral = (sellAmount * 1e36) / morphoOraclePrice;
            }
        } else {
            // Standard price-based calculation for other protocols
            uint256 collateralPrice = viewRouter.getCollateralPrice(
                params.protocolId,
                params.collateralToken,
                params.protocolContext
            );

            if (collateralPrice > 0) {
                // Expected collateral = sellAmount(debt) × debtPrice / collateralPrice
                expectedCollateral = (sellAmount * debtPrice) / collateralPrice;
                // Adjust for decimals
                expectedCollateral = (expectedCollateral * (10 ** params.collateralDecimals)) / (10 ** params.debtDecimals);
            }
        }

        // Truncate expectedCollateral to prevent spam from price fluctuations
        // Must truncate BEFORE applying slippage to preserve full slippage protection
        expectedCollateral = _truncatePrecision(expectedCollateral, params.collateralDecimals);

        // Apply slippage AFTER truncation
        minBuyAmount = (expectedCollateral * (10000 - params.maxSlippageBps)) / 10000;
    }

    /// @inheritdoc IOrderTrigger
    /// @dev Auto-leverage orders are continuous - they never auto-complete.
    /// The order remains active and will re-trigger whenever LTV drops below
    /// the trigger threshold, up to maxIterations or until user cancels.
    /// This provides ongoing leverage management rather than one-shot execution.
    function isComplete(
        bytes calldata /* staticData */,
        address /* owner */,
        uint256 /* iterationCount */
    ) external pure override returns (bool) {
        // Never auto-complete - rely on maxIterations for termination
        return false;
    }

    /// @inheritdoc IOrderTrigger
    function triggerName() external pure override returns (string memory) {
        return "AutoLeverage";
    }

    // ============ View Helpers ============

    /// @notice Get current LTV for a user
    function getCurrentLtv(bytes4 protocolId, address owner, bytes calldata context) external view returns (uint256) {
        return viewRouter.getCurrentLtv(protocolId, owner, context);
    }

    /// @notice Encode trigger params for order creation
    function encodeTriggerParams(TriggerParams memory params) external pure returns (bytes memory) {
        return abi.encode(params);
    }

    // ============ Internal Functions ============

    /// @dev Truncate precision to prevent order spam from interest accrual
    /// - 18 decimals (ETH): keep 5 → 0.00001
    /// - 8 decimals (WBTC): keep 6 → 0.000001
    /// - 6 decimals (USDC): keep 4 → $0.0001
    function _truncatePrecision(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals <= 4) return amount;
        uint256 keep;
        if (decimals > 12) keep = 5;
        else if (decimals > 6) keep = 6;
        else keep = 4;
        uint256 precision = 10 ** (decimals - keep);
        return (amount / precision) * precision;
    }

}
