/**
 * Shared types for swap-related modals (DebtSwap, CloseWithCollateral, CollateralSwap)
 *
 * Consolidates common interfaces that were previously duplicated across:
 * - debtSwapEvmHelpers.tsx
 * - closeWithCollateralEvmHelpers.tsx
 */

import type { SwapAsset } from "../SwapModalShell";
import type { LimitOrderResult } from "~~/components/LimitOrderConfig";
import type { BuildOrderResult } from "~~/hooks/useCowLimitOrder";

/** Alias for backwards compatibility */
export type LimitOrderBuildResult = BuildOrderResult;

/**
 * Flash loan information for CoW Protocol swaps
 */
export interface FlashLoanInfo {
  /** Flash loan lender address */
  lender: string;
  /** Provider name (e.g., "balancer-v2", "aave") */
  provider: string;
  /** Flash loan fee in wei */
  fee: bigint;
  /** Flash loan amount in wei */
  amount: bigint;
  /** Token address being borrowed */
  token: string;
}

/**
 * Parameters for building CoW chunk instructions
 * Used by both debt swap and close-with-collateral flows
 */
export interface CowChunkParams {
  /** Target swap asset (what we're swapping TO) */
  selectedTo: SwapAsset;
  /** User's wallet address */
  userAddress: string;
  /** Amount to repay in raw token units */
  repayAmountRaw: bigint;
  /** KapanOrderManager contract address */
  orderManagerAddress: string;
  /** Protocol name (e.g., "aave", "compound") */
  protocolName: string;
  /** Protocol-specific context (e.g., market address) */
  context: string | undefined;
  /** Debt token address */
  debtToken: string;
  /** Debt token symbol/name for display */
  debtName: string;
  /** Debt token decimals */
  debtDecimals: number;
  /** Flash loan configuration */
  cowFlashLoanInfo: FlashLoanInfo;
  /** Limit order configuration (if using limit orders) */
  limitOrderConfig: LimitOrderResult | null;
  /** Whether user selected "max" - enables dust clearing with refund to user */
  isMax?: boolean;
}
