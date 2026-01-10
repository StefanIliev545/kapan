import { FC, useState, useEffect, useMemo, useCallback } from "react";
import { formatUnits } from "viem";
import { parseAmount } from "~~/utils/validation";

export interface AmountInputProps {
  /** Current value in human-readable format (e.g., "1.5") */
  value: string;
  /** Called when the value changes */
  onChange: (value: string, isMax: boolean) => void;
  /** Token/balance decimals for parsing/formatting */
  decimals: number;
  /** Raw balance in bigint for percentage calculations */
  balance: bigint;
  /** Optional base for percentage calculations (defaults to balance) */
  percentBase?: bigint;
  /** Optional maximum value (limits input) */
  max?: bigint;
  /** Optional USD price for value display */
  usdPrice?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Show percentage buttons (25%, 50%, 100%) */
  showPercentButtons?: boolean;
  /** Show MAX button only (no percentage buttons) */
  showMaxButton?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Custom class name for the input */
  inputClassName?: string;
  /** Optional trigger to reset the input (e.g., modal open state) */
  resetTrigger?: boolean | number | string;
  /** Show insufficient funds warning */
  insufficientFunds?: boolean;
  /** Token symbol for display next to MAX button */
  tokenSymbol?: string;
}

/**
 * Shared amount input component with max button and optional percentage buttons.
 *
 * Features:
 * - Input field with number validation
 * - MAX button to set maximum amount
 * - Optional percentage buttons (25%, 50%, 100%)
 * - USD value display
 * - Automatic value limiting to max
 * - Insufficient funds warning
 * - Reset on trigger change
 */
export const AmountInput: FC<AmountInputProps> = ({
  value,
  onChange,
  decimals,
  balance,
  percentBase,
  max,
  usdPrice = 0,
  disabled = false,
  placeholder = "0.0",
  showPercentButtons = true,
  showMaxButton = true,
  className = "",
  inputClassName = "",
  resetTrigger,
  insufficientFunds = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenSymbol: _tokenSymbol,
}) => {
  const [activePercent, setActivePercent] = useState<number | null>(null);

  // Reset when trigger changes
  useEffect(() => {
    setActivePercent(null);
    onChange("", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]); // Intentionally not including onChange to prevent loops

  const handlePercentClick = useCallback(
    (percent: number) => {
      const base = percentBase ?? balance;
      const val = (base * BigInt(percent)) / 100n;
      const formatted = formatUnits(val, decimals);
      setActivePercent(percent);
      onChange(formatted, percent === 100);
    },
    [balance, decimals, onChange, percentBase],
  );

  const handleMaxClick = useCallback(() => {
    const maxValue = max ?? percentBase ?? balance;
    const formatted = formatUnits(maxValue, decimals);
    setActivePercent(100);
    onChange(formatted, true);
  }, [balance, decimals, max, onChange, percentBase]);

  const handleInputChange = useCallback(
    (inputValue: string) => {
      // Parse and validate using shared utility
      const result = parseAmount(inputValue || "0", decimals);
      let parsed = result.value ?? 0n;

      // Apply max limit if specified
      const base = percentBase ?? balance;
      const limit = max ?? base;
      let finalValue = inputValue;

      if (limit > 0n && parsed >= limit) {
        parsed = limit;
        finalValue = formatUnits(limit, decimals);
      }

      setActivePercent(null);
      onChange(finalValue, false);
    },
    [balance, decimals, max, onChange, percentBase],
  );

  // Calculate USD value
  const usdValue = useMemo(() => {
    const amount = parseFloat(value || "0");
    return (amount * usdPrice).toFixed(2);
  }, [value, usdPrice]);

  // Percentage buttons to show
  const percentButtons = showPercentButtons ? [25, 50, 100] : (showMaxButton ? [100] : []);

  const handleOnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e.target.value),
    [handleInputChange],
  );

  // Factory for percentage button click handlers
  const createPercentClickHandler = useCallback(
    (p: number) => () => {
      if (p === 100 && showMaxButton && !showPercentButtons) {
        handleMaxClick();
      } else {
        handlePercentClick(p);
      }
    },
    [handleMaxClick, handlePercentClick, showMaxButton, showPercentButtons],
  );

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={handleOnChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`bg-base-200/50 border-base-300/50 text-base-content placeholder:text-base-content/30 focus:border-base-content/30 w-full rounded-lg border px-4 py-3 focus:outline-none ${
            percentButtons.length > 0 ? "pr-24" : ""
          } ${inputClassName}`}
        />
        {insufficientFunds && (
          <div className="absolute -top-4 right-1 z-10">
            <span className="badge badge-error badge-sm whitespace-nowrap">Insufficient funds</span>
          </div>
        )}
        {percentButtons.length > 0 && (
          <div className="divide-base-300 absolute inset-y-0 right-3 flex items-center divide-x text-xs">
            {percentButtons.map((p) => (
              <button
                key={p}
                type="button"
                onClick={createPercentClickHandler(p)}
                disabled={disabled}
                className={`px-1 ${activePercent === p ? "underline" : ""} ${disabled ? "opacity-50" : ""}`}
              >
                {p === 100 && showMaxButton && !showPercentButtons ? "MAX" : `${p}%`}
              </button>
            ))}
          </div>
        )}
      </div>
      {usdPrice > 0 && (
        <div className="mt-1 text-center text-xs opacity-70">
          ≈ ${usdValue}
        </div>
      )}
    </div>
  );
};

/**
 * Simplified amount input with just MAX button (for swap modals, etc.)
 */
export const SimpleAmountInput: FC<{
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChange: (value: string) => void;
  onMax: () => void;
  balance: bigint;
  decimals: number;
  usdPrice?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  showMaxButton?: boolean;
}> = ({
  value,
  onChange,
  onMax,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  balance: _balance,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  decimals: _decimals,
  usdPrice,
  disabled = false,
  placeholder = "0.00",
  className = "",
  showMaxButton = true,
}) => {
  const usdValue = useMemo(() => {
    if (!usdPrice) return null;
    const amount = parseFloat(value || "0");
    return (amount * usdPrice).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [value, usdPrice]);

  const handleOnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  );

  return (
    <div className={className}>
      <div className="relative flex-1">
        <input
          type="number"
          value={value}
          onChange={handleOnChange}
          placeholder={placeholder}
          disabled={disabled}
          className="border-base-300 w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-16 text-right font-medium outline-none"
        />
        {showMaxButton && (
          <button
            onClick={onMax}
            disabled={disabled}
            className={`text-primary hover:text-primary-focus absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold ${
              disabled ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            MAX
          </button>
        )}
      </div>
      {usdValue && (
        <div className="mt-1 flex justify-end">
          <span className="text-base-content/60 text-xs">≈ ${usdValue}</span>
        </div>
      )}
    </div>
  );
};

export default AmountInput;
