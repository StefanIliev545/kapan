import type { FC, ReactNode } from "react";
import Image from "next/image";
import formatPercentage from "~~/utils/formatPercentage";

export interface TokenListItemProps {
  /** Token symbol/name to display */
  name: string;
  /** Token icon URL */
  icon: string;
  /** Interest rate to display (as a decimal, e.g., 0.05 for 5%) */
  rate: number;
  /** Label for the rate (e.g., "APR" or "APY") */
  rateLabel: string;
  /** Formatted balance string to display */
  balanceLabel: string;
  /** Click handler when the item is selected */
  onClick: () => void;
  /** Optional key for the element */
  itemKey?: string;
  /** Number of decimal places for rate formatting (default: 2) */
  rateDecimals?: number;
  /** Whether to format rate as raw value (default: false, meaning multiply by 100) */
  rateIsRaw?: boolean;
}

/**
 * Shared token list item component for token selection modals.
 *
 * Displays:
 * - Token icon and name on the left
 * - Rate and balance on the right
 *
 * Usage:
 * ```tsx
 * <TokenListItem
 *   name="USDC"
 *   icon="/usdc.png"
 *   rate={0.05}
 *   rateLabel="APY"
 *   balanceLabel="1,234.56"
 *   onClick={() => handleSelectToken(token)}
 * />
 * ```
 */
export const TokenListItem: FC<TokenListItemProps> = ({
  name,
  icon,
  rate,
  rateLabel,
  balanceLabel,
  onClick,
  rateDecimals = 2,
  rateIsRaw = false,
}) => {
  return (
    <button
      className="hover:bg-base-200/60 flex w-full cursor-pointer items-center justify-between p-3 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 text-left">
        <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
        <span className="text-base-content text-sm font-medium">{name}</span>
      </div>
      <div className="flex flex-col text-right">
        <div className="text-base-content/50 text-xs">
          {formatPercentage(rate, rateDecimals, rateIsRaw)}% {rateLabel}
        </div>
        <div className="text-base-content/70 text-xs">Balance: {balanceLabel}</div>
      </div>
    </button>
  );
};

export interface TokenListContainerProps {
  /** Children token list items */
  children: ReactNode;
  /** Empty state message */
  emptyMessage?: string;
  /** Whether the list is empty */
  isEmpty?: boolean;
}

/**
 * Container for token list with styling and empty state.
 *
 * Usage:
 * ```tsx
 * <TokenListContainer isEmpty={tokens.length === 0} emptyMessage="No tokens available">
 *   {tokens.map(token => <TokenListItem key={token.address} ... />)}
 * </TokenListContainer>
 * ```
 */
export const TokenListContainer: FC<TokenListContainerProps> = ({
  children,
  emptyMessage = "No tokens available",
  isEmpty = false,
}) => {
  return (
    <div className="border-base-300/50 divide-base-300/50 max-h-96 divide-y overflow-y-auto rounded-lg border">
      {isEmpty ? (
        <div className="text-base-content/50 p-6 text-center text-sm">{emptyMessage}</div>
      ) : (
        children
      )}
    </div>
  );
};

export interface TokenSelectModalShellProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Whether a nested action modal is open (hides this modal when true) */
  isActionModalOpen: boolean;
  /** Handler for clicking backdrop or close button */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Children content (token list) */
  children: ReactNode;
}

/**
 * Shell component for token select modals providing consistent structure.
 *
 * Includes:
 * - Backdrop with blur
 * - Modal box with consistent styling
 * - Header with title and close button
 *
 * Usage:
 * ```tsx
 * <TokenSelectModalShell
 *   isOpen={isOpen}
 *   isActionModalOpen={isActionModalOpen}
 *   onClose={handleDone}
 *   title="Select Token to Borrow"
 * >
 *   <TokenListContainer>...</TokenListContainer>
 * </TokenSelectModalShell>
 * ```
 */
export const TokenSelectModalShell: FC<TokenSelectModalShellProps> = ({
  isOpen,
  isActionModalOpen,
  onClose,
  title,
  children,
}) => {
  return (
    <dialog className={`modal ${isOpen && !isActionModalOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-box bg-base-100 border-base-300/50 relative max-w-md rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base-content text-lg font-semibold">{title}</h3>
          <button
            className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1.5 transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
};
