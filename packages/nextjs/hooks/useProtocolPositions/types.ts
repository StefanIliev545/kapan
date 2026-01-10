/**
 * Shared types for protocol position hooks
 */

import type { ProtocolPosition } from "~~/components/ProtocolView";

/**
 * Common result interface for all protocol position hooks
 */
export interface ProtocolPositionsResult {
  /** Positions where user has supplied collateral */
  suppliedPositions: ProtocolPosition[];
  /** Positions where user has borrowed assets */
  borrowedPositions: ProtocolPosition[];
  /** Whether the initial data load is in progress */
  isLoading: boolean;
  /** Whether the hook has completed at least one successful load */
  hasLoadedOnce: boolean;
  /** Whether data is being refetched (not initial load) */
  isUpdating: boolean;
  /** Function to manually trigger a refetch */
  refetchPositions: () => void;
  /** Optional error from the data fetch */
  error?: unknown;
}

/**
 * Extended result interface with additional position rows for detailed display
 */
export interface ExtendedProtocolPositionsResult<TRow> extends ProtocolPositionsResult {
  /** Detailed position rows with protocol-specific data */
  rows: TRow[];
}

/**
 * Configuration for position loading state management
 */
export interface PositionLoadingState {
  /** Is the primary data loading */
  isLoading: boolean;
  /** Is the data being fetched (includes refetch) */
  isFetching: boolean;
  /** The user address being queried */
  userAddress: string | undefined;
  /** Any error from the fetch */
  error?: unknown;
}
