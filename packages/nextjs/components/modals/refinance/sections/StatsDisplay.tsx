import React, { FC, memo, useMemo } from "react";
import { useStatsState } from "../RefinanceContext";

export type StatsDisplayProps = {
  /** Calculated health factor for the refinance */
  refiHF: number;
  /** Color configuration for health factor display */
  hfColor: { tone: string; badge: string };
  /** Total collateral value in USD */
  totalCollateralUsd: number;
  /** Loan-to-Value ratio as string percentage */
  ltv: string;
  /** Debt amount in USD */
  debtUsd: number;
};

/**
 * StatsDisplay shows the refinance position statistics including
 * health factor, collateral amount, LTV, and debt amount.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const StatsDisplay: FC<Partial<StatsDisplayProps>> = memo((props) => {
  // Check if we have all required props
  const hasAllProps = props.refiHF !== undefined &&
    props.hfColor !== undefined &&
    props.totalCollateralUsd !== undefined &&
    props.ltv !== undefined &&
    props.debtUsd !== undefined;

  let statsState: {
    refiHF: number;
    hfColor: { tone: string; badge: string };
    totalCollateralUsd: number;
    ltv: string;
    debtUsd: number;
  };

  if (hasAllProps) {
    // Use props directly
    statsState = {
      refiHF: props.refiHF!,
      hfColor: props.hfColor!,
      totalCollateralUsd: props.totalCollateralUsd!,
      ltv: props.ltv!,
      debtUsd: props.debtUsd!,
    };
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    statsState = useStatsState();
  }

  const { refiHF, hfColor, totalCollateralUsd, ltv, debtUsd } = statsState;

  // toLocaleString options - memoized to avoid recreating objects
  const localeOptionsMinMax2 = useMemo(
    () => ({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );

  return (
    <div className="grid grid-cols-4 gap-4 text-center">
      <div>
        <div className="text-base-content/70 text-xs">Health Factor</div>
        <div className={`font-medium ${hfColor.tone}`}>
          {refiHF >= 999 ? "\u221e" : refiHF.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="text-base-content/70 text-xs">Collateral Amount</div>
        <div className="font-medium">
          ${totalCollateralUsd.toLocaleString(undefined, localeOptionsMinMax2)}
        </div>
      </div>
      <div>
        <div className="text-base-content/70 text-xs">LTV</div>
        <div className="font-medium">{ltv}%</div>
      </div>
      <div>
        <div className="text-base-content/70 text-xs">Debt Amount</div>
        <div className="font-medium">
          ${debtUsd.toLocaleString(undefined, localeOptionsMinMax2)}
        </div>
      </div>
    </div>
  );
});

StatsDisplay.displayName = "StatsDisplay";
