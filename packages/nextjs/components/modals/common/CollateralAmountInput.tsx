import React, { FC, useCallback } from "react";

/* ------------------------------ Types ------------------------------ */

/**
 * Core props for CollateralAmountInput
 */
export type CollateralAmountInputCoreProps = {
  /** Current input value */
  value: string;
  /** Callback when value changes (receives clamped value) */
  onChange: (value: string) => void;
  /** Callback when max button is clicked */
  onMaxClick: () => void;
  /** Callback when confirm button is clicked */
  onConfirm: () => void;
  /** Human-readable balance for display and clamping */
  balance: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
  /** Additional class names */
  className?: string;
};

/**
 * Extended props including raw balance and decimals
 * These are passed through from parent but not used by the component directly
 */
export type CollateralAmountInputProps = CollateralAmountInputCoreProps & {
  /** Raw balance (for parent component use, not used in this component) */
  rawBalance: bigint;
  /** Token decimals (for parent component use, not used in this component) */
  decimals: number;
};

/* ------------------------------ Helpers ------------------------------ */

/**
 * Clamp an amount to be within valid bounds
 */
export function clampAmount(value: string, max?: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";

  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return "";

  if (max != null) {
    const maxParsed = parseFloat(max);
    if (Number.isFinite(maxParsed) && parsed > maxParsed) {
      return max;
    }
  }

  return trimmed;
}

/* ------------------------------ Component ------------------------------ */

/**
 * Reusable collateral amount input with max button and confirm
 *
 * Used in refinance modal for entering collateral amounts to move.
 * Handles clamping values, max button, and confirm action.
 */
export const CollateralAmountInput: FC<CollateralAmountInputProps> = ({
  value,
  onChange,
  onMaxClick,
  onConfirm,
  balance,
  disabled = false,
  autoFocus = false,
  className = "",
  // rawBalance and decimals are passed through but not used by this component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rawBalance: _rawBalance,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  decimals: _decimals,
}) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const clamped = clampAmount(e.target.value, String(balance));
    onChange(clamped);
  }, [balance, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onConfirm();
    }
  }, [onConfirm]);

  const handleMaxClickInternal = useCallback(() => {
    onMaxClick();
  }, [onMaxClick]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const isConfirmDisabled = !value || parseFloat(value) <= 0;

  return (
    <div className={`flex items-center gap-2 ${className}`} onClick={handleContainerClick}>
      <div className="relative flex-1">
        <input
          type="number"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          className="border-base-300 text-base-content w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-20 outline-none"
          autoFocus={autoFocus}
          disabled={disabled}
        />
        <button
          className="text-primary absolute right-2 top-1/2 -translate-y-1/2"
          onClick={handleMaxClickInternal}
          disabled={disabled}
          type="button"
        >
          {balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
        </button>
      </div>
      <button
        className="btn btn-ghost btn-sm text-success disabled:text-base-content/40"
        onClick={onConfirm}
        disabled={isConfirmDisabled || disabled}
        title="Add collateral"
        type="button"
      >
        {/* Checkmark */}
        &#10003;
      </button>
    </div>
  );
};

/* ------------------------------ Expanded Variant ------------------------------ */

export type CollateralAmountInputExpandedProps = Omit<CollateralAmountInputProps, "className"> & {
  /** Whether this is an expanded tile (adds margin-top) */
  variant?: "expanded" | "preselected";
};

/**
 * Collateral amount input with styling variants
 *
 * - expanded: For when a collateral tile is expanded for editing
 * - preselected: For disabled collateral selection with editable amount
 */
export const CollateralAmountInputStyled: FC<CollateralAmountInputExpandedProps> = ({
  variant = "expanded",
  ...props
}) => {
  const marginClass = variant === "expanded" ? "mt-3" : "mt-2";
  return <CollateralAmountInput {...props} className={marginClass} autoFocus />;
};

export default CollateralAmountInput;
