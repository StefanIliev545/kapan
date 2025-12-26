"use client";

import { FC } from "react";
import { formatUnits } from "viem";
import type { MorphoPositionRow } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

interface MorphoPositionCardProps {
  row: MorphoPositionRow;
  onRefresh?: () => void;
}

export const MorphoPositionCard: FC<MorphoPositionCardProps> = ({
  row,
  onRefresh: _onRefresh,
}) => {
  const formatUsd = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    if (value < 0.01 && value > 0) return `<$0.01`;
    return `$${value.toFixed(2)}`;
  };

  const formatBalance = (balance: bigint, decimals: number, symbol: string) => {
    const num = Number(formatUnits(balance, decimals));
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M ${symbol}`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K ${symbol}`;
    if (num < 0.0001 && num > 0) return `<0.0001 ${symbol}`;
    return `${num.toFixed(4)} ${symbol}`;
  };

  const healthColor =
    row.healthFactor === null
      ? "text-base-content"
      : row.healthFactor < 1.1
        ? "text-error"
        : row.healthFactor < 1.3
          ? "text-warning"
          : "text-success";

  const ltvColor =
    row.currentLtv === null
      ? "text-base-content"
      : row.currentLtv > row.lltv * 0.9
        ? "text-error"
        : row.currentLtv > row.lltv * 0.7
          ? "text-warning"
          : "text-success";

  return (
    <div className="card bg-base-100 shadow-lg border border-base-300 hover:border-primary/30 transition-all">
      <div className="card-body p-4">
        {/* Header: Market Pair */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Stacked token icons */}
            <div className="flex -space-x-2">
              <img
                src={tokenNameToLogo(row.collateralSymbol.toLowerCase())}
                alt={row.collateralSymbol}
                className="w-8 h-8 rounded-full border-2 border-base-100 bg-base-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logos/default.svg";
                }}
              />
              <img
                src={tokenNameToLogo(row.loanSymbol.toLowerCase())}
                alt={row.loanSymbol}
                className="w-8 h-8 rounded-full border-2 border-base-100 bg-base-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logos/default.svg";
                }}
              />
            </div>
            <div>
              <div className="font-semibold">
                {row.collateralSymbol}/{row.loanSymbol}
              </div>
              <div className="text-xs text-base-content/60">
                Max LTV: {row.lltv.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Health indicator */}
          {row.hasDebt && (
            <div
              className={`badge ${
                row.isHealthy ? "badge-success" : "badge-error"
              } badge-sm`}
            >
              {row.isHealthy ? "Healthy" : "At Risk"}
            </div>
          )}
        </div>

        {/* Position Details */}
        <div className="space-y-3">
          {/* Collateral */}
          {row.hasCollateral && (
            <div className="flex justify-between items-center">
              <div className="text-sm text-base-content/70">Collateral</div>
              <div className="text-right">
                <div className="font-medium">
                  {formatBalance(
                    row.collateralBalance,
                    row.collateralDecimals,
                    row.collateralSymbol
                  )}
                </div>
                <div className="text-xs text-base-content/60">
                  {formatUsd(row.collateralBalanceUsd)}
                </div>
              </div>
            </div>
          )}

          {/* Debt */}
          {row.hasDebt && (
            <div className="flex justify-between items-center">
              <div className="text-sm text-base-content/70">Debt</div>
              <div className="text-right">
                <div className="font-medium text-error">
                  {formatBalance(
                    row.borrowBalance,
                    row.borrowDecimals,
                    row.loanSymbol
                  )}
                </div>
                <div className="text-xs text-base-content/60">
                  {formatUsd(row.borrowBalanceUsd)}
                </div>
              </div>
            </div>
          )}

          <div className="divider my-1" />

          {/* Rates & Risk */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {/* Current LTV */}
            <div>
              <div className="text-base-content/60 text-xs">Current LTV</div>
              <div className={`font-medium ${ltvColor}`}>
                {row.currentLtv !== null
                  ? `${row.currentLtv.toFixed(1)}%`
                  : "--"}
              </div>
            </div>

            {/* Health Factor */}
            <div>
              <div className="text-base-content/60 text-xs">Health Factor</div>
              <div className={`font-medium ${healthColor}`}>
                {row.healthFactor !== null
                  ? row.healthFactor.toFixed(2)
                  : "∞"}
              </div>
            </div>

            {/* Borrow APY */}
            <div>
              <div className="text-base-content/60 text-xs">Borrow APY</div>
              <div className="font-medium text-error">
                {row.borrowApy.toFixed(2)}%
              </div>
            </div>

            {/* Supply APY */}
            <div>
              <div className="text-base-content/60 text-xs">Supply APY</div>
              <div className="font-medium text-success">
                {row.supplyApy.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="card-actions justify-end mt-4">
          <button className="btn btn-outline btn-xs">Repay</button>
          <button className="btn btn-outline btn-xs">Withdraw</button>
          <button className="btn btn-primary btn-xs">Manage</button>
        </div>
      </div>
    </div>
  );
};

