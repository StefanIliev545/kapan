/**
 * CollateralSwapModalV2 - Refactored using the unified swap modal architecture.
 *
 * This component demonstrates the new pattern where:
 * 1. Operation-specific logic is encapsulated in a config hook (useCollateralSwapConfig)
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
import { SwapModalShell, type SwapAsset } from "./SwapModalShell";
import { useCollateralSwapConfig } from "./common/useCollateralSwapConfig";
import type { MorphoMarketContextForEncoding } from "~~/utils/v2/instructionHelpers";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Extended collateral type with price info
interface ExtendedCollateral {
    symbol: string;
    address: string;
    decimals: number;
    rawBalance: bigint;
    balance?: number;
    usdValue?: number;
    price?: bigint;
}

interface CollateralSwapModalV2Props {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    availableAssets: ExtendedCollateral[];
    initialFromTokenAddress?: string;
    chainId: number;
    /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
    context?: string;
    position: {
        name: string;
        tokenAddress: string;
        decimals: number;
        balance?: number | bigint;
        type: "borrow" | "supply";
    };
    /** Morpho-specific: Raw market context for encoding (required for Morpho collateral swap) */
    morphoContext?: MorphoMarketContextForEncoding;
    /** Morpho-specific: Debt token address for finding compatible markets */
    debtTokenAddress?: string;
    /** Morpho-specific: Current debt balance (raw bigint) for proportional debt migration */
    currentDebtBalance?: bigint;
    /** Euler-specific: Borrow vault address (extracted from context) */
    eulerBorrowVault?: string;
    /** Euler-specific: Current collateral vault address */
    eulerCollateralVault?: string;
    /** Euler-specific: Sub-account index (0-255) */
    eulerSubAccountIndex?: number;
}

/**
 * CollateralSwapModalV2 - Collateral swap modal using unified architecture.
 *
 * This is a migration of the 2,000+ line CollateralSwapModal.tsx that separates:
 * - useCollateralSwapConfig.tsx: ~1,200 lines of pure logic
 * - This file: ~100 lines of integration
 *
 * Benefits:
 * - Hook can be unit tested without rendering
 * - SwapModalShell provides consistent UI
 * - Complex protocol logic (Morpho, Euler, standard) is encapsulated
 * - Limit order (CoW) and market order (flash loan) flows are cleanly separated
 */
export const CollateralSwapModalV2: FC<CollateralSwapModalV2Props> = (props) => {
    const {
        isOpen,
        onClose,
        chainId,
        protocolName,
        availableAssets,
        initialFromTokenAddress,
        context,
        position,
        morphoContext,
        debtTokenAddress,
        currentDebtBalance,
        eulerBorrowVault,
        eulerCollateralVault,
        eulerSubAccountIndex,
    } = props;

    // Convert availableAssets to SwapAsset format for the config hook
    const swapAssets: SwapAsset[] = availableAssets.map(a => ({
        symbol: a.symbol,
        address: a.address as Address,
        decimals: a.decimals,
        rawBalance: a.rawBalance,
        balance: a.balance ?? Number(a.rawBalance) / (10 ** a.decimals),
        icon: tokenNameToLogo(a.symbol.toLowerCase()),
        usdValue: a.usdValue,
        price: a.price,
    }));

    // Get all configuration from the hook
    const config = useCollateralSwapConfig({
        isOpen,
        onClose,
        chainId,
        protocolName,
        availableAssets: swapAssets,
        initialFromTokenAddress,
        context,
        position,
        morphoContext,
        debtTokenAddress,
        currentDebtBalance,
        eulerBorrowVault,
        eulerCollateralVault,
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
            initialFromAddress={initialFromTokenAddress}
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
            priceImpact={config.priceImpact}
            hideDefaultStats={config.hideDefaultStats}
            rightPanel={config.rightPanel}
            onAmountOutChange={config.onAmountOutChange}
            limitPriceButtons={config.limitPriceButtons}
        />
    );
};

export default CollateralSwapModalV2;
