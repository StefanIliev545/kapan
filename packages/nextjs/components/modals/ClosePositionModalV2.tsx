/**
 * ClosePositionModalV2 - Refactored using the unified swap modal architecture.
 *
 * This component demonstrates the new pattern where:
 * 1. Operation-specific logic is encapsulated in a config hook (useClosePositionConfig)
 * 2. The hook returns a SwapOperationConfig that maps directly to SwapModalShell props
 * 3. The modal component becomes a thin wrapper
 *
 * This approach allows:
 * - Easy testing of the close position logic in isolation (test the hook)
 * - Consistent UI across all swap types (all use SwapModalShell)
 * - Clear separation between business logic and presentation
 *
 * Close position flow:
 * 1. User enters debt amount to repay
 * 2. System calculates required collateral based on exchange rate
 * 3. Flash loan provides the collateral
 * 4. Collateral is swapped for debt token
 * 5. Debt is repaid
 * 6. Remaining collateral is withdrawn to repay flash loan
 *
 * Supports both market orders (instant via flash loans) and limit orders (via CoW Protocol).
 */

import type { FC } from "react";
import type { Address } from "viem";
import type { SwapAsset } from "./SwapModalShell";
import { useClosePositionConfig } from "./common/useClosePositionConfig";
import { SwapModalShell } from "./SwapModalShell";

interface ClosePositionModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  // Debt token info (preselected "From" - what we're repaying, user inputs amount)
  debtToken: Address;
  debtName: string;
  debtIcon: string;
  debtDecimals: number;
  /** Price in 8 decimals (e.g., from Chainlink) */
  debtPrice?: bigint;
  debtBalance: bigint;
  // Available collateral assets for "To" selection (collateral to sell)
  availableCollaterals: SwapAsset[];
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
  /** Current borrow APY as percentage (e.g., 5.5 for 5.5%). Used to calculate interest buffer. */
  borrowRateApy?: number;
  // ========================================================================
  // Euler-specific props
  // ========================================================================
  /** Euler: Current borrow vault address */
  eulerBorrowVault?: string;
  /** Euler: User's collateral vault addresses */
  eulerCollateralVaults?: string[];
  /** Euler: Sub-account index (0-255) */
  eulerSubAccountIndex?: number;
}

/**
 * ClosePositionModalV2 - Close debt position by selling collateral using unified architecture.
 *
 * Migration notes:
 *
 * 1. The existing CloseWithCollateralEvmModal.tsx has ~1,361 lines of mixed logic and UI
 * 2. This new version separates concerns:
 *    - useClosePositionConfig.tsx: ~1,100 lines of pure logic
 *    - This file: ~90 lines of integration
 * 3. Total is similar but now testable and composable
 *
 * Benefits:
 * - Hook can be unit tested without rendering
 * - SwapModalShell provides consistent UI
 * - Easy to add new position types by creating new config hooks
 */
export const ClosePositionModalV2: FC<ClosePositionModalV2Props> = props => {
  const {
    isOpen,
    onClose,
    chainId,
    protocolName,
    debtToken,
    debtName,
    debtIcon,
    debtDecimals,
    debtPrice,
    debtBalance,
    availableCollaterals,
    context,
    borrowRateApy,
    eulerBorrowVault,
    eulerCollateralVaults,
    eulerSubAccountIndex,
  } = props;

  // Get all configuration from the hook
  const config = useClosePositionConfig({
    isOpen,
    onClose,
    chainId,
    protocolName,
    debtToken,
    debtName,
    debtIcon,
    debtDecimals,
    debtPrice,
    debtBalance,
    availableCollaterals,
    context,
    borrowRateApy,
    eulerBorrowVault,
    eulerCollateralVaults,
    eulerSubAccountIndex,
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

export default ClosePositionModalV2;
