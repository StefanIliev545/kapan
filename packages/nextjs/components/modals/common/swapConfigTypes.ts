/**
 * Types for the unified swap modal configuration system.
 *
 * This module defines the core types for operation-specific swap configurations
 * that can be used with SwapModalShell. Each operation type (wallet swap, collateral swap,
 * debt swap, close position) implements these interfaces to provide consistent
 * behavior across all swap modals.
 */

import type { ReactNode } from "react";
import type { Address } from "viem";
import type { SwapAsset, SwapRouter } from "../SwapModalShell";
import type { FlashLoanProviderOption } from "~~/hooks/useMovePositionData";
import type { ChunkInstructions } from "~~/hooks/useCowLimitOrder";
import type { ProtocolInstruction } from "~~/utils/v2/instructionHelpers";

// ============================================================================
// Core Configuration Types
// ============================================================================

/**
 * Quote result from any swap router (1inch, Kyber, Pendle, CoW)
 */
export interface SwapQuoteResult {
  /** Amount of destination token received */
  dstAmount: string;
  /** Transaction data for the swap */
  tx?: {
    data: string;
    to?: string;
    from?: string;
    value?: string;
  };
  /** Source amount in USD (if available) */
  srcUSD?: string | null;
  /** Destination amount in USD (if available) */
  dstUSD?: string | null;
  /** Price impact percentage (if available) */
  priceImpact?: number | null;
  /** Quote source for display */
  source?: "1inch" | "kyber" | "pendle" | "cow";
}

/**
 * Configuration for swap quote fetching
 */
export interface SwapQuoteConfig {
  /** Whether quotes should be fetched */
  enabled: boolean;
  /** Selected swap router */
  swapRouter: SwapRouter;
  /** Source token address */
  srcToken: Address;
  /** Destination token address */
  dstToken: Address;
  /** Amount in raw token units */
  amount: string;
  /** Slippage tolerance (percentage) */
  slippage: number;
  /** Chain ID */
  chainId: number;
  /** For router: address that will execute the swap (adapter address) */
  fromAddress?: Address;
  /** Quote kind: "sell" (exact input) or "buy" (exact output) */
  kind?: "sell" | "buy";
}

/**
 * Result from the swap quote hook
 */
export interface SwapQuoteHookResult {
  /** Current quote result */
  quote: SwapQuoteResult | null;
  /** Whether quote is loading */
  isLoading: boolean;
  /** Quote error if any */
  error: Error | null;
  /** Formatted output amount */
  amountOut: string;
  /** Calculated price impact */
  priceImpact: number | null;
  /** Exchange rate string (e.g., "1:2.5") */
  exchangeRate: string | null;
}

// ============================================================================
// Flash Loan Configuration
// ============================================================================

/**
 * Flash loan information for transaction execution
 */
export interface FlashLoanInfo {
  /** Flash loan lender contract address */
  lender: Address;
  /** Provider identifier (e.g., "balancer-v2", "aave", "morpho") */
  provider: string;
  /** Flash loan fee in raw token units */
  fee: bigint;
  /** Flash loan amount in raw token units */
  amount: bigint;
  /** Token being borrowed */
  token: Address;
}

/**
 * Flash loan selection configuration
 */
export interface FlashLoanConfig {
  /** Available flash loan providers */
  providers: FlashLoanProviderOption[];
  /** Currently selected provider */
  selectedProvider: FlashLoanProviderOption | null;
  /** Set the selected provider */
  setSelectedProvider: (provider: FlashLoanProviderOption) => void;
  /** Liquidity data for each provider */
  liquidityData?: Array<{
    provider: number;
    liquidity: bigint;
    hasLiquidity: boolean;
  }>;
  /** Whether flash loan is required for this operation */
  required: boolean;
}

// ============================================================================
// Limit Order Configuration
// ============================================================================

/**
 * Limit order configuration for CoW Protocol
 */
export interface LimitOrderConfig {
  /** Whether limit orders are available on this chain */
  available: boolean;
  /** Whether the limit order system is ready */
  ready: boolean;
  /** Order manager contract address */
  orderManagerAddress?: Address;
  /** Number of chunks to split the order into */
  numChunks: number;
  /** Set number of chunks */
  setNumChunks: (n: number) => void;
  /** Custom buy amount (user-editable) */
  customBuyAmount: string;
  /** Whether using custom buy amount */
  useCustomBuyAmount: boolean;
  /** Set custom buy amount */
  setCustomBuyAmount: (amount: string) => void;
  /** Flash loan info for the limit order */
  flashLoanInfo: FlashLoanInfo | null;
  /** Pre/post instructions for each chunk */
  chunkInstructions: ChunkInstructions[];
}

// ============================================================================
// Swap Operation Configuration
// ============================================================================

/**
 * Execution type for swap operations
 */
export type ExecutionType = "market" | "limit";

/**
 * Base configuration returned by operation-specific config hooks
 */
export interface SwapOperationConfig {
  // ---- Operation Identity ----
  /** Operation type identifier */
  operationType: "wallet-swap" | "collateral-swap" | "debt-swap" | "close-position";
  /** Modal title */
  title: string;
  /** Protocol name (e.g., "Aave", "Wallet") */
  protocolName: string;

  // ---- Token Configuration ----
  /** Assets available for "from" selection */
  fromAssets: SwapAsset[];
  /** Assets available for "to" selection */
  toAssets: SwapAsset[];
  /** Currently selected "from" asset */
  selectedFrom: SwapAsset | null;
  /** Currently selected "to" asset */
  selectedTo: SwapAsset | null;
  /** Set selected "from" asset */
  setSelectedFrom: (asset: SwapAsset | null) => void;
  /** Set selected "to" asset */
  setSelectedTo: (asset: SwapAsset | null) => void;
  /** Whether "from" selection is read-only */
  fromReadOnly: boolean;
  /** Whether "to" selection is read-only */
  toReadOnly: boolean;
  /** Label for "from" section */
  fromLabel: string;
  /** Label for "to" section */
  toLabel: string;

  // ---- Amount State ----
  /** Input amount (user-entered) */
  amountIn: string;
  /** Set input amount */
  setAmountIn: (amount: string) => void;
  /** Whether using max amount */
  isMax: boolean;
  /** Set max flag */
  setIsMax: (isMax: boolean) => void;
  /** Output amount (from quote) */
  amountOut: string;

  // ---- Quote State ----
  /** Whether quote is loading */
  isQuoteLoading: boolean;
  /** Quote error if any */
  quoteError: Error | null;
  /** Calculated price impact */
  priceImpact: number | null;

  // ---- Slippage ----
  /** Current slippage tolerance */
  slippage: number;
  /** Set slippage */
  setSlippage: (slippage: number) => void;

  // ---- Execution ----
  /** Current execution type */
  executionType: ExecutionType;
  /** Set execution type */
  setExecutionType: (type: ExecutionType) => void;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Whether submission is allowed */
  canSubmit: boolean;
  /** Submit button label */
  submitLabel: string;
  /** Submit handler */
  onSubmit: () => Promise<void>;

  // ---- Flash Loan (optional, for protocol operations) ----
  flashLoan?: FlashLoanConfig;

  // ---- Limit Order (optional) ----
  limitOrder?: LimitOrderConfig;

  // ---- Batching Preference (optional) ----
  preferBatching?: boolean;
  setPreferBatching?: (fn: (prev: boolean) => boolean) => void;

  // ---- UI Customization ----
  /** Custom info content for "How it works" tab */
  infoContent?: ReactNode;
  /** Custom warnings to display */
  warnings?: ReactNode;
  /** Custom right panel content (for market/limit toggle) */
  rightPanel?: ReactNode;
  /** Custom token picker for "to" section */
  customToTokenPicker?: ReactNode;
  /** Limit price adjustment buttons */
  limitPriceButtons?: ReactNode;
  /** Content to show after metrics */
  afterMetrics?: ReactNode;
  /** Whether to hide default stats grid */
  hideDefaultStats?: boolean;
  /** Handler for output amount changes (limit orders) */
  onAmountOutChange?: (value: string) => void;
}

// ============================================================================
// Operation-Specific Props
// ============================================================================

/**
 * Props for wallet swap configuration hook
 */
export interface UseWalletSwapConfigProps {
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
  /** All wallet tokens */
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
 * Props for collateral swap configuration hook
 */
export interface UseCollateralSwapConfigProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  protocolName: string;
  availableAssets: SwapAsset[];
  initialFromTokenAddress?: string;
  context?: string;
  position: {
    name: string;
    tokenAddress: string;
    decimals: number;
    balance?: number | bigint;
    type: "borrow" | "supply";
  };
  // Morpho-specific
  morphoContext?: {
    marketId: string;
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: bigint;
  };
  debtTokenAddress?: string;
  currentDebtBalance?: bigint;
  // Euler-specific
  eulerBorrowVault?: string;
  eulerCollateralVault?: string;
  eulerSubAccountIndex?: number;
}

/**
 * Props for debt swap configuration hook
 */
export interface UseDebtSwapConfigProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  protocolName: string;
  debtFromToken: Address;
  debtFromName: string;
  debtFromIcon: string;
  debtFromDecimals: number;
  debtFromPrice?: bigint;
  currentDebtBalance: bigint;
  availableAssets: SwapAsset[];
  context?: string;
  // Morpho-specific
  morphoContext?: {
    marketId: string;
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: bigint;
  };
  collateralTokenAddress?: Address;
  collateralTokenSymbol?: string;
  collateralBalance?: bigint;
  collateralDecimals?: number;
  // Euler-specific
  eulerBorrowVault?: string;
  eulerCollateralVaults?: string[];
  eulerSubAccountIndex?: number;
  eulerUsedSubAccountIndices?: number[];
  eulerCollaterals?: Array<{
    vaultAddress: string;
    tokenAddress: string;
    tokenSymbol: string;
    decimals: number;
    balance: bigint;
  }>;
}

/**
 * Props for close position configuration hook
 */
export interface UseClosePositionConfigProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  protocolName: string;
  debtToken: Address;
  debtName: string;
  debtIcon: string;
  debtDecimals: number;
  debtPrice?: bigint;
  debtBalance: bigint;
  availableCollaterals: SwapAsset[];
  context?: string;
  /** Current borrow APY as percentage (e.g., 5.5 for 5.5%). Used to calculate interest buffer. */
  borrowRateApy?: number;
  // Euler-specific
  eulerBorrowVault?: string;
  eulerCollateralVaults?: string[];
  eulerSubAccountIndex?: number;
}

// ============================================================================
// Instruction Building Types
// ============================================================================

/**
 * Parameters for building market order instructions
 */
export interface MarketOrderBuildParams {
  /** Protocol to interact with */
  protocolName: string;
  /** Source token */
  srcToken: Address;
  /** Destination token */
  dstToken: Address;
  /** Amount to swap */
  amount: bigint;
  /** Minimum output amount */
  minOutput: bigint;
  /** Swap calldata */
  swapData: string;
  /** Flash loan provider */
  flashLoanProvider: number;
  /** Protocol context */
  context?: string;
  /** Whether using max amount */
  isMax: boolean;
  /** Swap protocol name */
  swapProtocol: "oneinch" | "kyber" | "pendle";
  /** User address */
  userAddress: Address;
}

/**
 * Result from building market order instructions
 */
export interface MarketOrderBuildResult {
  /** Protocol instructions to execute */
  instructions: ProtocolInstruction[];
  /** Whether build was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}
