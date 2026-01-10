/**
 * Shared utilities and hooks for protocol position fetching
 *
 * This module consolidates common patterns used across:
 * - useMorphoLendingPositions
 * - useVesuLendingPositions
 * - useVesuV2LendingPositions
 * - useNostraLendingPositions
 * - AaveLike component
 */

// Types
export type {
  ProtocolPositionsResult,
  ExtendedProtocolPositionsResult,
  PositionLoadingState,
} from "./types";

// Utility functions
export {
  toHexAddress,
  toBoolean,
  normalizePrice,
  computeUsdValue,
  computeUsdValueFromNumber,
  calculateLtvPercent,
  parsePositionTuples,
  type PositionTuple,
} from "./utils";

// Hooks
export {
  usePositionLoadingState,
  type UsePositionLoadingStateOptions,
  type UsePositionLoadingStateResult,
} from "./usePositionLoadingState";
