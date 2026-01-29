/**
 * DebtSwapModalV2 - Refactored using the unified swap modal architecture.
 *
 * This component demonstrates the new pattern where:
 * 1. Operation-specific logic is encapsulated in a config hook (useDebtSwapConfig)
 * 2. The hook returns a SwapOperationConfig that maps directly to SwapModalShell props
 * 3. The modal component becomes a thin wrapper
 *
 * Key features of debt swaps:
 * - REQUIRES flash loans to swap debt atomically
 * - Supports both market orders (1inch/Kyber/Pendle) and limit orders (CoW)
 * - Handles protocol-specific logic:
 *   - Morpho: Collateral withdrawal/deposit when switching markets
 *   - Euler: Sub-account migration to avoid controller conflicts
 *   - Aave/Compound/Venus: Standard shared-pool model
 */

import { FC } from "react";
import { type Address } from "viem";
import { SwapModalShell, type SwapAsset } from "./SwapModalShell";
import { useDebtSwapConfig, type EulerCollateralInfo } from "./common/useDebtSwapConfig";

interface DebtSwapModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  /** Current debt token address */
  debtFromToken: Address;
  /** Current debt token symbol */
  debtFromName: string;
  /** Current debt token icon */
  debtFromIcon: string;
  /** Current debt token decimals */
  debtFromDecimals: number;
  /** Current debt token price in 8 decimals (e.g., from Chainlink) */
  debtFromPrice?: bigint;
  /** Current debt balance in raw units */
  currentDebtBalance: bigint;
  /** Available assets for "To" selection */
  availableAssets: SwapAsset[];
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
  // ========================================================================
  // Morpho-specific props (pair-isolated markets require moving collateral)
  // ========================================================================
  /** Morpho: Raw market context for encoding (OLD market) */
  morphoContext?: {
    marketId: string;
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: bigint;
  };
  /** Morpho: Collateral token address (same across old and new markets) */
  collateralTokenAddress?: Address;
  /** Morpho: Collateral token symbol */
  collateralTokenSymbol?: string;
  /** Morpho: Current collateral balance */
  collateralBalance?: bigint;
  /** Morpho: Collateral decimals */
  collateralDecimals?: number;
  // ========================================================================
  // Euler-specific props
  // ========================================================================
  /** Euler: Current borrow vault address */
  eulerBorrowVault?: string;
  /** Euler: User's collateral vault addresses in the current position */
  eulerCollateralVaults?: string[];
  /** Euler: Sub-account index (0 = main account) */
  eulerSubAccountIndex?: number;
  /** Euler: All sub-account indices that are currently in use (have positions) */
  eulerUsedSubAccountIndices?: number[];
  /** Euler: Full collateral info for sub-account migration (vault + token + balance) */
  eulerCollaterals?: EulerCollateralInfo[];
  /** Success callback */
  onSuccess?: () => void;
}

/**
 * DebtSwapModalV2 - Debt swap modal using unified architecture.
 *
 * This follows the same pattern as WalletSwapModalV2:
 * - useDebtSwapConfig: Contains all swap logic (~800 lines)
 * - This file: Thin wrapper (~80 lines)
 *
 * Benefits:
 * - Hook can be unit tested without rendering
 * - SwapModalShell provides consistent UI
 * - Clear separation between business logic and presentation
 */
export const DebtSwapModalV2: FC<DebtSwapModalV2Props> = (props) => {
  const {
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtFromToken,
    debtFromName,
    debtFromIcon,
    debtFromDecimals,
    debtFromPrice,
    currentDebtBalance,
    availableAssets,
    context,
    // Morpho-specific
    morphoContext,
    collateralTokenAddress,
    collateralTokenSymbol,
    collateralBalance,
    collateralDecimals,
    // Euler-specific
    eulerBorrowVault,
    eulerCollateralVaults,
    eulerSubAccountIndex,
    eulerUsedSubAccountIndices,
    eulerCollaterals,
    onSuccess,
  } = props;

  // Get all configuration from the hook
  const config = useDebtSwapConfig({
    isOpen,
    onClose,
    chainId,
    protocolName,
    debtFromToken,
    debtFromName,
    debtFromIcon,
    debtFromDecimals,
    debtFromPrice,
    currentDebtBalance,
    availableAssets,
    context,
    // Morpho-specific
    morphoContext,
    collateralTokenAddress,
    collateralTokenSymbol,
    collateralBalance,
    collateralDecimals,
    // Euler-specific
    eulerBorrowVault,
    eulerCollateralVaults,
    eulerSubAccountIndex,
    eulerUsedSubAccountIndices,
    eulerCollaterals,
    onSuccess,
  });

  // Map config to SwapModalShell props
  return (
    <SwapModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      protocolName={config.protocolName}
      fromAssets={config.fromAssets}
      toAssets={config.toAssets}
      initialFromAddress={debtFromToken}
      selectedFrom={config.selectedFrom}
      setSelectedFrom={config.setSelectedFrom}
      selectedTo={config.selectedTo}
      setSelectedTo={config.setSelectedTo}
      amountIn={config.amountIn}
      setAmountIn={config.setAmountIn}
      isMax={config.isMax}
      setIsMax={config.setIsMax}
      amountOut={config.amountOut}
      isQuoteLoading={config.isQuoteLoading}
      quoteError={config.quoteError}
      slippage={config.slippage}
      setSlippage={config.setSlippage}
      preferBatching={config.preferBatching}
      setPreferBatching={config.setPreferBatching}
      onSubmit={config.onSubmit}
      isSubmitting={config.isSubmitting}
      canSubmit={config.canSubmit}
      submitLabel={config.submitLabel}
      infoContent={config.infoContent}
      warnings={config.warnings}
      fromLabel={config.fromLabel}
      toLabel={config.toLabel}
      fromReadOnly={config.fromReadOnly}
      toReadOnly={config.toReadOnly}
      hideDefaultStats={config.hideDefaultStats}
      rightPanel={config.rightPanel}
      onAmountOutChange={config.onAmountOutChange}
      limitPriceButtons={config.limitPriceButtons}
      priceImpact={config.priceImpact}
    />
  );
};

export default DebtSwapModalV2;

// Re-export the EulerCollateralInfo type for consumers
export type { EulerCollateralInfo } from "./common/useDebtSwapConfig";
