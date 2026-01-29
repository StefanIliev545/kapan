/**
 * WalletSwapModalV2 - Refactored using the unified swap modal architecture.
 *
 * This component demonstrates the new pattern where:
 * 1. Operation-specific logic is encapsulated in a config hook (useWalletSwapConfig)
 * 2. The hook returns a SwapOperationConfig that maps directly to SwapModalShell props
 * 3. The modal component becomes a thin wrapper
 *
 * This approach allows:
 * - Easy testing of the swap logic in isolation (test the hook)
 * - Consistent UI across all swap types (all use SwapModalShell)
 * - Clear separation between business logic and presentation
 */

import { FC } from "react";
import { type Address } from "viem";
import { SwapModalShell } from "./SwapModalShell";
import { useWalletSwapConfig } from "./common/useWalletSwapConfig";

interface WalletSwapModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  /** Token to swap from (pre-selected) */
  fromToken: {
    address: Address;
    symbol: string;
    decimals: number;
    balance: bigint;
    balanceFormatted: number;
    icon: string;
    price: number;
  };
  /** All wallet tokens available for swapping */
  walletTokens: Array<{
    address: Address;
    symbol: string;
    decimals: number;
    balance: bigint;
    balanceFormatted: number;
    icon: string;
    price: number;
  }>;
  /** Success callback */
  onSuccess?: () => void;
}

/**
 * WalletSwapModalV2 - Wallet-to-wallet swap modal using unified architecture.
 *
 * This is a proof-of-concept showing the new pattern. To migrate:
 *
 * 1. The existing WalletSwapModal.tsx has ~543 lines of mixed logic and UI
 * 2. This new version separates concerns:
 *    - useWalletSwapConfig.tsx: ~400 lines of pure logic
 *    - This file: ~50 lines of integration
 * 3. Total is similar but now testable and composable
 *
 * Benefits:
 * - Hook can be unit tested without rendering
 * - SwapModalShell provides consistent UI
 * - Easy to add new swap types by creating new config hooks
 */
export const WalletSwapModalV2: FC<WalletSwapModalV2Props> = (props) => {
  const { isOpen, onClose, chainId, fromToken, walletTokens, onSuccess } = props;

  // Get all configuration from the hook
  const config = useWalletSwapConfig({
    isOpen,
    onClose,
    chainId,
    fromToken,
    walletTokens,
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
      customToTokenPicker={config.customToTokenPicker}
    />
  );
};

export default WalletSwapModalV2;
