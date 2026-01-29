import React, { FC, memo, useCallback } from "react";
import Image from "next/image";
import { clampAmount } from "../../common/CollateralAmountInput";
import { useDebtState } from "../RefinanceContext";
import type { Protocol } from "../../common/useRefinanceTypes";

/**
 * Props for standalone usage (without context)
 */
export type DebtSectionProps = {
  /** Debt token symbol */
  debtSymbol: string;
  /** Debt token icon URL */
  debtIcon: string;
  /** Current debt amount input value */
  debtAmount: string;
  /** Callback to update debt amount */
  setDebtAmount: (value: string) => void;
  /** Max label to display (e.g., "Max: 100.00") */
  debtMaxLabel?: string;
  /** Raw max value for clamping */
  debtMaxRaw?: string;
  /** Whether debt amount is confirmed */
  debtConfirmed: boolean;
  /** Callback to set debt confirmed state */
  setDebtConfirmed: (value: boolean) => void;
  /** Ref to the debt input element */
  debtInputRef: React.RefObject<HTMLInputElement | null>;
  /** Source protocol info */
  sourceProtocol: Protocol;
  /** Callback when max is clicked */
  setIsDebtMaxClicked: (value: boolean) => void;
};

/**
 * Internal component that renders the debt section UI
 */
const DebtSectionUI: FC<{
  symbol: string;
  icon: string;
  amount: string;
  maxLabel?: string;
  maxRaw?: string;
  confirmed: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  sourceProtocol: Protocol;
  onAmountChange: (value: string) => void;
  onMaxClick: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}> = memo(({
  symbol,
  icon,
  amount,
  maxLabel,
  confirmed,
  inputRef,
  sourceProtocol,
  onAmountChange,
  onMaxClick,
  onConfirm,
  onUnconfirm,
  onKeyDown,
}) => {
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onAmountChange(e.target.value);
    },
    [onAmountChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-base-content/80 text-sm">Amount to Refinance</span>
        {confirmed && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-base-content/60 text-[11px] leading-none">Source Protocol</span>
          </div>
        )}
      </div>

      {!confirmed ? (
        <div className="flex items-center gap-3">
          <div className="relative size-6">
            <Image src={icon} alt={symbol} fill className="rounded-full" />
          </div>
          <span className="font-medium">{symbol}</span>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="number"
              value={amount}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              placeholder="0.00"
              className="border-base-300 w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-20 outline-none"
            />
            {maxLabel && (
              <button
                onClick={onMaxClick}
                className="text-primary absolute right-2 top-1/2 -translate-y-1/2"
              >
                {maxLabel}
              </button>
            )}
          </div>
          <button
            onClick={onConfirm}
            disabled={!amount || parseFloat(amount) <= 0}
            className="text-base-content/40 hover:text-success p-1 disabled:opacity-40"
            title="Confirm amount"
          >
            &#x2713;
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex cursor-pointer items-center gap-3" onClick={onUnconfirm}>
            <div className="relative size-6">
              <Image src={icon} alt={symbol} fill className="rounded-full" />
            </div>
            <span className="font-medium">{symbol}</span>
            <span>{amount}</span>
          </div>
          <div className="flex items-center gap-2">
            <Image src={sourceProtocol.logo} alt={sourceProtocol.name} width={20} height={20} className="rounded-full" />
            <span>{sourceProtocol.name}</span>
          </div>
        </div>
      )}
    </div>
  );
});
DebtSectionUI.displayName = "DebtSectionUI";

/**
 * DebtSection handles the debt amount input and confirmation UI
 * for the refinance modal.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const DebtSection: FC<Partial<DebtSectionProps>> = memo((props) => {
  // Try to use context if available, fall back to props
  let debtState: {
    symbol: string;
    icon: string;
    amount: string;
    setAmount: (value: string) => void;
    maxLabel?: string;
    maxRaw?: string;
    confirmed: boolean;
    setConfirmed: (value: boolean) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    sourceProtocol: Protocol;
    setIsMaxClicked: (value: boolean) => void;
  };

  // Check if we have all required props
  const hasAllProps = props.debtSymbol !== undefined &&
    props.debtIcon !== undefined &&
    props.debtAmount !== undefined &&
    props.setDebtAmount !== undefined &&
    props.debtConfirmed !== undefined &&
    props.setDebtConfirmed !== undefined &&
    props.debtInputRef !== undefined &&
    props.sourceProtocol !== undefined &&
    props.setIsDebtMaxClicked !== undefined;

  if (hasAllProps) {
    // Use props directly
    debtState = {
      symbol: props.debtSymbol!,
      icon: props.debtIcon!,
      amount: props.debtAmount!,
      setAmount: props.setDebtAmount!,
      maxLabel: props.debtMaxLabel,
      maxRaw: props.debtMaxRaw,
      confirmed: props.debtConfirmed!,
      setConfirmed: props.setDebtConfirmed!,
      inputRef: props.debtInputRef!,
      sourceProtocol: props.sourceProtocol!,
      setIsMaxClicked: props.setIsDebtMaxClicked!,
    };
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    debtState = useDebtState();
  }

  const {
    symbol,
    icon,
    amount,
    setAmount,
    maxLabel,
    maxRaw,
    confirmed,
    setConfirmed,
    inputRef,
    sourceProtocol,
    setIsMaxClicked,
  } = debtState;

  // Debt input handlers
  const handleAmountChange = useCallback(
    (value: string) => {
      const sanitized = clampAmount(value, maxRaw);
      setIsMaxClicked(false);
      setAmount(sanitized);
    },
    [maxRaw, setIsMaxClicked, setAmount],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        setConfirmed(Boolean(amount && parseFloat(amount) > 0));
      }
    },
    [amount, setConfirmed],
  );

  const handleMaxClick = useCallback(() => {
    const maxValue = (maxRaw || maxLabel || "").replace(/,/g, "");
    setIsMaxClicked(true);
    setAmount(maxValue);
  }, [maxRaw, maxLabel, setIsMaxClicked, setAmount]);

  const handleConfirm = useCallback(() => {
    setConfirmed(Boolean(amount && parseFloat(amount) > 0));
  }, [amount, setConfirmed]);

  const handleUnconfirm = useCallback(() => {
    setConfirmed(false);
  }, [setConfirmed]);

  return (
    <DebtSectionUI
      symbol={symbol}
      icon={icon}
      amount={amount}
      maxLabel={maxLabel}
      maxRaw={maxRaw}
      confirmed={confirmed}
      inputRef={inputRef}
      sourceProtocol={sourceProtocol}
      onAmountChange={handleAmountChange}
      onMaxClick={handleMaxClick}
      onConfirm={handleConfirm}
      onUnconfirm={handleUnconfirm}
      onKeyDown={handleKeyDown}
    />
  );
});

DebtSection.displayName = "DebtSection";
