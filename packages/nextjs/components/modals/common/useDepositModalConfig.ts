import { ReactNode } from "react";
import type { TokenInfo, TokenActionModalProps } from "../TokenActionModal";
import type { Network } from "~~/hooks/useTokenBalance";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";
import type { VesuContext } from "~~/utils/vesu";
import type { Call } from "starknet";

/**
 * Base props shared between EVM and Starknet deposit modals
 */
export interface BaseDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
}

/**
 * EVM-specific deposit modal props
 */
export interface EvmDepositModalProps extends BaseDepositModalProps {
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
}

/**
 * Starknet-specific deposit modal props
 */
export interface StarkDepositModalProps extends BaseDepositModalProps {
  vesuContext?: VesuContext;
}

/**
 * Configuration for the deposit action that is identical across chains
 */
export interface DepositModalConfig {
  action: "Deposit";
  apyLabel: string;
  metricLabel: string;
  before: number;
}

/**
 * Returns the static configuration for deposit modals (same across all chains)
 */
export function getDepositConfig(): DepositModalConfig {
  return {
    action: "Deposit",
    apyLabel: "Supply APY",
    metricLabel: "Total supplied",
    before: 0,
  };
}

/**
 * Props returned by the useDepositModalConfig hook for rendering TokenActionModal
 */
export interface DepositModalRenderProps {
  /** Static config for the deposit action */
  config: DepositModalConfig;
  /** Token balance in wallet */
  balance: bigint;
  /** Token decimals (resolved from token or fetched) */
  decimals: number;
  /** Token with normalized decimals */
  normalizedToken: TokenInfo;
  /** Network identifier */
  network: Network;
}

interface UseDepositModalConfigParams {
  token: TokenInfo;
  network: Network;
  chainId?: number;
}

/**
 * Hook that provides common configuration and state for deposit modals.
 * Used by both EVM and Starknet deposit modal implementations.
 *
 * This hook handles:
 * - Fetching token balance
 * - Resolving token decimals
 * - Providing static deposit action configuration
 *
 * Chain-specific transaction building and execution should be handled
 * by the respective modal components.
 */
export function useDepositModalConfig({
  token,
  network,
  chainId,
}: UseDepositModalConfigParams): DepositModalRenderProps {
  const { balance, decimals: fetchedDecimals } = useTokenBalance(
    token.address,
    network,
    network === "evm" ? chainId : undefined,
    token.decimals
  );

  // Resolve decimals: prefer token.decimals, then fetched, then default to 18
  const decimals = token.decimals ?? fetchedDecimals ?? 18;

  // Normalize token with resolved decimals
  const normalizedToken: TokenInfo = {
    ...token,
    decimals,
  };

  // Note: The original code mutates token.decimals directly.
  // For backwards compatibility, we also mutate it here, though this is not ideal.
  if (token.decimals == null) {
    token.decimals = decimals;
  }

  return {
    config: getDepositConfig(),
    balance,
    decimals,
    normalizedToken,
    network,
  };
}

/**
 * Builds the common props for TokenActionModal used by deposit modals.
 * This creates the props object that can be spread into TokenActionModal.
 */
export interface BuildTokenActionModalPropsParams {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
  renderProps: DepositModalRenderProps;
  chainId?: number;
  onConfirm: (amount: string, isMax?: boolean) => Promise<unknown> | void;
  buildCalls?: (
    amount: string,
    isMax: boolean
  ) => Promise<Call | Call[] | null | undefined> | Call | Call[] | null | undefined;
  renderExtraContent?: () => ReactNode;
}

export function buildDepositModalProps({
  isOpen,
  onClose,
  token,
  protocolName,
  position,
  renderProps,
  chainId,
  onConfirm,
  buildCalls,
  renderExtraContent,
}: BuildTokenActionModalPropsParams): TokenActionModalProps {
  const { config, balance, network, normalizedToken } = renderProps;

  return {
    isOpen,
    onClose,
    action: config.action,
    token: normalizedToken,
    protocolName,
    apyLabel: config.apyLabel,
    apy: token.currentRate,
    metricLabel: config.metricLabel,
    before: config.before,
    balance,
    network,
    chainId,
    position,
    onConfirm,
    buildCalls,
    renderExtraContent,
  };
}
