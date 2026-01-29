// Close Position shared components and hooks
export {
  useClosePositionQuote,
  hasEnoughCollateral,
  type ClosePositionToken,
  type ClosePositionQuote,
  type RemainderInfo,
  type UseClosePositionQuoteProps,
} from "./useClosePositionQuote";

export {
  ClosePositionSummary,
  SwapExchangeDisplay,
  FeeBreakdownDisplay,
  WithdrawRemainderDisplay,
  type SwapFeeBreakdown,
  type SwapExchangeDisplayProps,
  type FeeBreakdownDisplayProps,
  type WithdrawRemainderDisplayProps,
  type ClosePositionSummaryProps,
} from "./ClosePositionSummary";

// Existing exports
export { SwapQuoteSummary, SwapFeeSummary, type SwapQuoteItem, type AggregatedFees, type TokenDisplay, type SwapFees, type SwapFeeSummaryProps } from "./SwapQuoteSummary";
export { BatchingPreference } from "./BatchingPreference";

// Shared modal chrome components
export { ModalHeader, ModalHeaderMinimal, type ModalHeaderProps } from "./ModalHeader";
export { ModalFooter, ModalFooterConfirm, type ModalFooterProps } from "./ModalFooter";

// Amount input components
export { AmountInput, SimpleAmountInput, type AmountInputProps } from "./AmountInput";

// Swap modal shared components
export { TokenAmountInput, type TokenAmountInputProps } from "./TokenAmountInput";
export { ExecutionTypeToggle, type ExecutionType, type ExecutionTypeToggleProps } from "./ExecutionTypeToggle";
export {
    SwapStatsGrid,
    SlippageSelector,
    MarketSwapStats,
    type SwapStatItem,
    type SwapStatsGridProps,
    type SlippageSelectorProps,
    type MarketSwapStatsProps,
} from "./SwapStatsGrid";
export {
    LimitOrderSection,
    ChunkInfo,
    BatchedTxToggle,
    LimitOrderInfoNote,
    type LimitOrderSectionProps,
    type ChunkInfoProps,
    type BatchedTxToggleProps,
    type LimitOrderInfoNoteProps,
} from "./LimitOrderSection";

// Withdraw modal shared utilities and hooks
export {
    useWithdrawModalConfig,
    type WithdrawModalConfig,
    type WithdrawModalConfigParams,
    type WithdrawModalBaseProps,
} from "./useWithdrawModalConfig";

// Deposit modal shared utilities and hooks
export {
    useDepositModalConfig,
    buildDepositModalProps,
    getDepositConfig,
    type BaseDepositModalProps,
    type EvmDepositModalProps,
    type StarkDepositModalProps,
    type DepositModalConfig,
    type DepositModalRenderProps,
    type BuildTokenActionModalPropsParams,
} from "./useDepositModalConfig";

// Refinance modal shared utilities and hooks
export {
    mergeCollaterals,
    useMergedCollaterals,
    type PreSelectedCollateral,
    type CollateralFromHook,
    type MergeCollateralsOptions,
} from "./useRefinanceCollaterals";
export {
    usePreselectedCollateralsEffect,
    useStableProtocolSelection,
    useDebtInputFocus,
    useRefinanceEffects,
    type Protocol,
    type CollateralMeta,
    type UsePreselectedCollateralsEffectOptions,
    type UseStableProtocolSelectionOptions,
    type UseDebtInputFocusOptions,
    type UseRefinanceEffectsOptions,
} from "./useRefinanceEffects";

// Refinance modal shared types
export {
    type RefinancePosition,
    type RefinanceModalBaseProps,
    type RefinanceModalEvmProps,
    type RefinanceModalStarkProps,
    type VesuPools,
    type VesuV1Pool,
    type VesuV2Pool,
    type Collateral,
    type FlashLoanProvider,
} from "./useRefinanceTypes";

// Refinance modal shared UI components
export {
    VesuPoolSelect,
    type VesuPoolSelectProps,
} from "./VesuPoolSelect";
export {
    CollateralAmountInput,
    CollateralAmountInputStyled,
    clampAmount,
    type CollateralAmountInputProps,
    type CollateralAmountInputExpandedProps,
} from "./CollateralAmountInput";

// Modal token and context utilities
export {
    buildModalTokenInfo,
    encodeCompoundContext,
    isCompoundProtocol,
    type ModalTokenInfo,
} from "./modalUtils";

// Flash loan provider selector
export {
    FlashLoanProviderSelector,
    ProviderDisplay,
    ProviderDropdownItem,
    type FlashLoanProviderSelectorProps,
    type ProviderDisplayProps,
    type ProviderDropdownItemProps,
} from "./FlashLoanProviderSelector";

// Token select modal shared components
export {
    TokenListItem,
    TokenListContainer,
    TokenSelectModalShell,
    type TokenListItemProps,
    type TokenListContainerProps,
    type TokenSelectModalShellProps,
} from "./TokenListItem";

export {
    useTokenSelectModal,
    type UseTokenSelectModalOptions,
    type UseTokenSelectModalResult,
} from "./useTokenSelectModal";

// ============================================================================
// Unified Swap Modal Architecture
// ============================================================================

// Swap configuration types
export {
    type SwapQuoteResult,
    type SwapQuoteConfig,
    type SwapQuoteHookResult,
    type FlashLoanInfo,
    type FlashLoanConfig,
    type LimitOrderConfig,
    type SwapOperationConfig,
    type UseWalletSwapConfigProps,
    type UseCollateralSwapConfigProps,
    type UseDebtSwapConfigProps,
    type UseClosePositionConfigProps,
    type MarketOrderBuildParams,
    type MarketOrderBuildResult,
} from "./swapConfigTypes";

// Swap quote hook
export {
    useSwapQuote,
    getBestSwapRouter,
    type UseSwapQuoteOptions,
} from "./useSwapQuote";

// Operation-specific config hooks
export {
    useWalletSwapConfig,
} from "./useWalletSwapConfig";

export {
    useCollateralSwapConfig,
} from "./useCollateralSwapConfig";

export {
    useDebtSwapConfig,
    type EulerCollateralInfo,
} from "./useDebtSwapConfig";

export {
    useClosePositionConfig,
} from "./useClosePositionConfig";
