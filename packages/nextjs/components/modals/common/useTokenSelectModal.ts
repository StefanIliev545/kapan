import { useState, useCallback } from "react";

/**
 * Shared state management hook for token selection modals.
 *
 * Handles the common pattern of:
 * 1. Opening a token list modal
 * 2. Selecting a token from the list
 * 3. Opening a nested action modal (Deposit/Borrow)
 * 4. Closing modals appropriately
 *
 * @template T - The token type used in the modal
 */
export interface UseTokenSelectModalOptions<T> {
  /** Callback when the parent modal should close */
  onClose: () => void;
  /** Optional callback when a token is selected (for controlled mode) */
  onSelectToken?: (token: T) => void;
  /** If true, skip opening action modal after selection */
  suppressActionModals?: boolean;
}

export interface UseTokenSelectModalResult<T> {
  /** Currently selected token (null if none selected) */
  selectedToken: T | null;
  /** Whether the action modal (Borrow/Deposit) is open */
  isActionModalOpen: boolean;
  /** Handler for when a token is selected from the list */
  handleSelectToken: (token: T) => void;
  /** Handler for closing the action modal */
  handleActionModalClose: () => void;
  /** Handler for closing the entire token select flow */
  handleDone: () => void;
  /** Reset state (useful when parent closes) */
  reset: () => void;
}

/**
 * Hook that manages token selection modal state.
 *
 * Usage:
 * ```tsx
 * const {
 *   selectedToken,
 *   isActionModalOpen,
 *   handleSelectToken,
 *   handleActionModalClose,
 *   handleDone,
 * } = useTokenSelectModal<ProtocolPosition>({ onClose });
 * ```
 */
export function useTokenSelectModal<T>({
  onClose,
  onSelectToken,
  suppressActionModals = false,
}: UseTokenSelectModalOptions<T>): UseTokenSelectModalResult<T> {
  const [selectedToken, setSelectedToken] = useState<T | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const handleSelectToken = useCallback(
    (token: T) => {
      if (suppressActionModals && onSelectToken) {
        onSelectToken(token);
        onClose();
        return;
      }
      setSelectedToken(token);
      setIsActionModalOpen(true);
    },
    [suppressActionModals, onSelectToken, onClose],
  );

  const handleActionModalClose = useCallback(() => {
    setIsActionModalOpen(false);
    // Don't close the token select modal yet to allow selecting another token
  }, []);

  const handleDone = useCallback(() => {
    onClose();
  }, [onClose]);

  const reset = useCallback(() => {
    setSelectedToken(null);
    setIsActionModalOpen(false);
  }, []);

  return {
    selectedToken,
    isActionModalOpen,
    handleSelectToken,
    handleActionModalClose,
    handleDone,
    reset,
  };
}
