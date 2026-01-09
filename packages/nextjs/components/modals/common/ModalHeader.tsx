import { FC, ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export interface ModalHeaderProps {
  /** Modal title displayed on the left */
  title: string;
  /** Close handler for the X button */
  onClose: () => void;
  /** Optional subtitle or protocol name displayed below or beside the title */
  subtitle?: string;
  /** Optional custom content to render between title and close button (e.g., tabs) */
  centerContent?: ReactNode;
  /** Optional class name for the header container */
  className?: string;
  /** Whether to show the close button (default: true) */
  showCloseButton?: boolean;
}

/**
 * Shared modal header component with title and close button.
 *
 * Usage:
 * ```tsx
 * <ModalHeader title="Select Token" onClose={handleClose} />
 * <ModalHeader title="Swap" subtitle="Aave V3" onClose={handleClose} />
 * <ModalHeader
 *   title="Settings"
 *   centerContent={<TabButtons />}
 *   onClose={handleClose}
 * />
 * ```
 */
export const ModalHeader: FC<ModalHeaderProps> = ({
  title,
  onClose,
  subtitle,
  centerContent,
  className = "",
  showCloseButton = true,
}) => {
  return (
    <div className={`flex items-center justify-between mb-4 pb-3 border-b border-base-200 ${className}`}>
      <div className="flex items-center gap-4">
        <div>
          <h3 className="font-semibold text-lg text-base-content">{title}</h3>
          {subtitle && (
            <span className="text-xs text-base-content/50 uppercase tracking-wider">{subtitle}</span>
          )}
        </div>
        {centerContent}
      </div>
      {showCloseButton && (
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
          aria-label="Close modal"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

/**
 * Minimal modal header without border - just title and close button inline.
 * Useful for simpler modals like token selectors.
 */
export const ModalHeaderMinimal: FC<Omit<ModalHeaderProps, "centerContent">> = ({
  title,
  onClose,
  subtitle,
  className = "",
  showCloseButton = true,
}) => {
  return (
    <div className={`flex justify-between items-center mb-3 ${className}`}>
      <div>
        <h3 className="font-semibold text-lg text-base-content">{title}</h3>
        {subtitle && (
          <span className="text-xs text-base-content/50">{subtitle}</span>
        )}
      </div>
      {showCloseButton && (
        <button
          className="p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
          onClick={onClose}
          aria-label="Close modal"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
