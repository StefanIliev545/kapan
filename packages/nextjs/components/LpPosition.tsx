import { FC } from "react";
import { BasePosition } from "./common/BasePosition";
import type { SegmentedAction } from "./common/SegmentedActionBar";

// View-only: no action bar.
const NO_ACTIONS: SegmentedAction[] = [];

const formatAmount = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 4 });
};

export interface LpPositionProps {
  icon: string;
  symbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  /** Token price with 8 decimals of precision. */
  tokenPrice?: bigint;
  /** Human token amount held in the position. */
  amount: number;
  /** Uncollected fees in this token (human units). */
  fees?: number;
  /** Uncollected fees in USD (for the subtitle). */
  feesUsd?: number;
}

/**
 * One token side of a liquidity-pool position (Uniswap V3/V4).
 *
 * A view-only sibling to {@link SupplyPosition}/{@link BorrowPosition} that reuses
 * {@link BasePosition} for identical chrome (icon wrapper, Balance column, card styling),
 * but swaps the lending APY/30D columns — meaningless for an LP — for the LP-relevant
 * Amount + Fees columns via `hideRateColumns` + `extraStats`.
 */
export const LpPosition: FC<LpPositionProps> = ({
  icon,
  symbol,
  tokenAddress,
  tokenDecimals,
  tokenPrice,
  amount,
  fees = 0,
  feesUsd = 0,
}) => {
  const rawBalance = amount > 0 ? BigInt(Math.round(amount * 10 ** tokenDecimals)) : 0n;

  // Balance (USD) reveals the token amount on hover, so no separate Amount column.
  const extraStats = [
    {
      label: "Fees",
      // Fees in USD (token amounts have absurd decimals); tiny → "<$0.01", raw on hover.
      value: feesUsd > 0 ? (
        <span className="text-success" title={`${formatAmount(fees)} ${symbol}`}>
          {feesUsd < 0.01 ? "<$0.01" : `$${feesUsd.toFixed(2)}`}
        </span>
      ) : (
        <span className="text-base-content/40">—</span>
      ),
    },
  ];

  return (
    <BasePosition
      icon={icon}
      name={symbol}
      tokenAddress={tokenAddress}
      tokenPrice={tokenPrice}
      tokenDecimals={tokenDecimals}
      tokenBalance={rawBalance}
      protocolName="Uniswap"
      networkType="evm"
      currentRate={0}
      positionType="supply"
      hideRateColumns
      showExpandIndicator={false}
      actions={NO_ACTIONS}
      extraStats={extraStats}
      balanceClassName="text-success"
    />
  );
};

export default LpPosition;
