import { useCallback } from "react";
import type { ReactNode } from "react";
import type { Call } from "starknet";
import type { TokenInfo } from "../TokenActionModal";
import type { Network } from "~~/hooks/useTokenBalance";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useLendingAction } from "~~/hooks/useLendingAction";
import type { PositionManager } from "~~/utils/position";
import type { VesuContext } from "~~/utils/vesu";

/**
 * Common configuration for borrow modals across chains
 */
export interface BorrowModalConfig {
  /** Token to borrow */
  token: TokenInfo;
  /** Current debt balance (for display) */
  currentDebt: number;
  /** Protocol name (e.g., "aave", "morpho", "vesu") */
  protocolName: string;
  /** Position manager for health factor calculations */
  position?: PositionManager;
}

/**
 * EVM-specific configuration
 */
export interface BorrowModalEvmConfig extends BorrowModalConfig {
  network: "evm";
  /** Chain ID for EVM networks */
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams) */
  context?: string;
}

/**
 * Starknet-specific configuration
 */
export interface BorrowModalStarkConfig extends BorrowModalConfig {
  network: "stark";
  /** Vesu protocol context for Starknet */
  vesuContext?: VesuContext;
}

export type BorrowModalNetworkConfig = BorrowModalEvmConfig | BorrowModalStarkConfig;

/**
 * Props for the TokenActionModal that are computed by the hook
 */
export interface BorrowModalComputedProps {
  action: "Borrow";
  token: TokenInfo;
  protocolName: string;
  apyLabel: string;
  apy: number;
  metricLabel: string;
  before: number;
  balance: bigint;
  network: Network;
  chainId?: number;
  position?: PositionManager;
  onConfirm: (amount: string, isMax?: boolean) => Promise<void>;
  buildCalls?: (amount: string, isMax: boolean) => Promise<Call | Call[] | null | undefined> | Call | Call[] | null | undefined;
  renderExtraContent?: () => ReactNode;
}

/**
 * Return type for useBorrowModal hook
 */
export interface UseBorrowModalReturn {
  /** Props to spread to TokenActionModal */
  modalProps: BorrowModalComputedProps;
  /** Token with normalized decimals */
  normalizedToken: TokenInfo;
}

/**
 * Extended return type for EVM borrow modal that includes batching preference
 */
export interface UseEvmBorrowModalReturn extends UseBorrowModalReturn {
  batchingPreference: ReturnType<typeof useEvmTransactionFlow>["batchingPreference"];
}

/**
 * Normalizes token decimals using the provided value or fetched balance decimals
 */
function normalizeTokenDecimals(token: TokenInfo, fetchedDecimals?: number): TokenInfo {
  const decimals = token.decimals ?? fetchedDecimals ?? 18;
  // Return a new object to avoid mutating the original
  return { ...token, decimals };
}

/**
 * Hook for EVM borrow modal logic
 */
function useEvmBorrowModal(
  config: BorrowModalEvmConfig,
  isOpen: boolean,
  onClose: () => void,
): UseEvmBorrowModalReturn {
  const { token, currentDebt, protocolName, position, chainId, context } = config;
  const { buildBorrowFlow } = useKapanRouterV2();
  const { balance, decimals: fetchedDecimals } = useTokenBalance(token.address, "evm", chainId, token.decimals);

  const normalizedToken = normalizeTokenDecimals(token, fetchedDecimals);
  const normalizedProtocolName = protocolName.toLowerCase();
  const decimals = normalizedToken.decimals!;

  const buildFlow = useCallback(
    (amount: string) =>
      buildBorrowFlow(normalizedProtocolName, token.address, amount, decimals, context),
    [buildBorrowFlow, context, decimals, normalizedProtocolName, token.address],
  );

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Borrow transaction sent",
    emptyFlowErrorMessage: "Failed to build borrow instructions",
  });

  return {
    modalProps: {
      action: "Borrow",
      token: normalizedToken,
      protocolName,
      apyLabel: "Borrow APY",
      apy: token.currentRate,
      metricLabel: "Total debt",
      before: currentDebt,
      balance,
      network: "evm",
      chainId,
      position,
      onConfirm: handleConfirm,
    },
    normalizedToken,
    batchingPreference,
  };
}

/**
 * Hook for Starknet borrow modal logic
 */
function useStarkBorrowModal(
  config: BorrowModalStarkConfig,
  _isOpen: boolean,
  _onClose: () => void,
): UseBorrowModalReturn {
  const { token, currentDebt, protocolName, position, vesuContext } = config;
  const { balance, decimals: fetchedDecimals } = useTokenBalance(token.address, "stark", undefined, token.decimals);

  const normalizedToken = normalizeTokenDecimals(token, fetchedDecimals);
  const decimals = normalizedToken.decimals!;

  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Borrow",
    token.address,
    protocolName,
    decimals,
    vesuContext,
  );

  return {
    modalProps: {
      action: "Borrow",
      token: normalizedToken,
      protocolName,
      apyLabel: "Borrow APY",
      apy: token.currentRate,
      metricLabel: "Total debt",
      before: currentDebt,
      balance,
      network: "stark",
      position,
      onConfirm: execute,
      buildCalls,
    },
    normalizedToken,
  };
}

/**
 * Unified hook for borrow modal logic across EVM and Starknet chains.
 *
 * This hook abstracts the common logic for:
 * - Token balance fetching with proper network context
 * - Decimals normalization
 * - Building the props needed for TokenActionModal
 *
 * Chain-specific logic is preserved:
 * - EVM: Uses useKapanRouterV2 + useEvmTransactionFlow, supports BatchingPreference
 * - Starknet: Uses useLendingAction, supports VesuContext
 *
 * @example
 * ```tsx
 * // EVM usage
 * const { modalProps } = useBorrowModal(
 *   { network: "evm", token, currentDebt, protocolName, chainId, context },
 *   isOpen,
 *   onClose
 * );
 *
 * // Starknet usage
 * const { modalProps } = useBorrowModal(
 *   { network: "stark", token, currentDebt, protocolName, vesuContext },
 *   isOpen,
 *   onClose
 * );
 * ```
 */
export function useBorrowModal(
  config: BorrowModalNetworkConfig,
  isOpen: boolean,
  onClose: () => void,
): UseBorrowModalReturn {
  // We need to call hooks unconditionally to satisfy React's rules of hooks.
  // However, since the network is known at component mount time and doesn't change,
  // we can safely use conditional rendering at the component level.
  // This hook should be called from network-specific components that know their network type.

  if (config.network === "evm") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useEvmBorrowModal(config, isOpen, onClose);
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStarkBorrowModal(config, isOpen, onClose);
  }
}

/**
 * Hook specifically for EVM borrow modals.
 * Use this when you know at compile time that you're building an EVM modal.
 */
export function useEvmBorrow(
  config: Omit<BorrowModalEvmConfig, "network">,
  isOpen: boolean,
  onClose: () => void,
): UseEvmBorrowModalReturn {
  return useEvmBorrowModal({ ...config, network: "evm" }, isOpen, onClose);
}

/**
 * Hook specifically for Starknet borrow modals.
 * Use this when you know at compile time that you're building a Starknet modal.
 */
export function useStarkBorrow(
  config: Omit<BorrowModalStarkConfig, "network">,
  isOpen: boolean,
  onClose: () => void,
): UseBorrowModalReturn {
  return useStarkBorrowModal({ ...config, network: "stark" }, isOpen, onClose);
}
