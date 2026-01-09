import { FC, ReactNode } from "react";
import { SegmentedActionBar } from "../../common/SegmentedActionBar";

export interface ModalFooterProps {
  /** Primary action button label */
  actionLabel: string;
  /** Primary action click handler */
  onAction: () => void;
  /** Whether the action button is disabled */
  isActionDisabled?: boolean;
  /** Whether the action is currently in progress (shows loading state) */
  isLoading?: boolean;
  /** Optional cancel button label (if provided, cancel button is shown) */
  cancelLabel?: string;
  /** Cancel button click handler */
  onCancel?: () => void;
  /** Optional icon to show in the action button */
  actionIcon?: ReactNode;
  /** Optional class name for the footer container */
  className?: string;
  /** Optional content to render before the buttons (e.g., batching preferences) */
  leftContent?: ReactNode;
  /** Use SegmentedActionBar style (default: true) */
  useSegmentedBar?: boolean;
}

/**
 * Shared modal footer component with action buttons.
 *
 * Usage:
 * ```tsx
 * // Simple action button
 * <ModalFooter actionLabel="Submit" onAction={handleSubmit} />
 *
 * // With cancel button
 * <ModalFooter
 *   actionLabel="Confirm"
 *   onAction={handleConfirm}
 *   cancelLabel="Cancel"
 *   onCancel={handleClose}
 * />
 *
 * // With loading state and left content
 * <ModalFooter
 *   actionLabel="Processing..."
 *   onAction={handleSubmit}
 *   isLoading={true}
 *   leftContent={<BatchingPreference {...} />}
 * />
 * ```
 */
export const ModalFooter: FC<ModalFooterProps> = ({
  actionLabel,
  onAction,
  isActionDisabled = false,
  isLoading = false,
  cancelLabel,
  onCancel,
  actionIcon,
  className = "",
  leftContent,
  useSegmentedBar = true,
}) => {
  if (useSegmentedBar) {
    return (
      <div className={`modal-action pt-2 ${className}`}>
        {leftContent && <div className="flex-1">{leftContent}</div>}
        <SegmentedActionBar
          className={leftContent ? "flex-1" : "w-full"}
          autoCompact
          actions={[
            {
              key: "action",
              label: actionLabel,
              icon: isLoading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                actionIcon
              ),
              onClick: onAction,
              disabled: isActionDisabled || isLoading,
              variant: "ghost",
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className={`flex justify-end gap-3 pt-4 ${className}`}>
      {leftContent && <div className="flex-1">{leftContent}</div>}
      {cancelLabel && onCancel && (
        <button
          className="px-4 py-2 text-sm font-medium text-base-content/60 hover:text-base-content transition-colors"
          onClick={onCancel}
          disabled={isLoading}
        >
          {cancelLabel}
        </button>
      )}
      <button
        className="px-4 py-2 text-sm font-medium bg-base-content text-base-100 rounded-lg hover:bg-base-content/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        onClick={onAction}
        disabled={isActionDisabled || isLoading}
      >
        {isLoading && <span className="loading loading-spinner loading-xs" />}
        {actionIcon && !isLoading && actionIcon}
        {actionLabel}
      </button>
    </div>
  );
};

/**
 * Simple cancel/confirm footer with two buttons side by side.
 * Common pattern for confirmation dialogs.
 */
export const ModalFooterConfirm: FC<{
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirmDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
}> = ({
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isConfirmDisabled = false,
  isLoading = false,
  className = "",
}) => {
  return (
    <div className={`flex justify-end gap-3 mt-6 ${className}`}>
      <button
        className="px-4 py-2 text-sm font-medium text-base-content/60 hover:text-base-content transition-colors"
        onClick={onCancel}
        disabled={isLoading}
      >
        {cancelLabel}
      </button>
      <button
        className="px-4 py-2 text-sm font-medium bg-base-content text-base-100 rounded-lg hover:bg-base-content/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        onClick={onConfirm}
        disabled={isConfirmDisabled || isLoading}
      >
        {isLoading && <span className="loading loading-spinner loading-xs" />}
        {confirmLabel}
      </button>
    </div>
  );
};
