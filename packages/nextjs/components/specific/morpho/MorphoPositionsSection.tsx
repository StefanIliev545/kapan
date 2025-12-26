"use client";

import { FC, useState } from "react";
import Image from "next/image";
import type { MorphoPositionRow, MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { PositionManager } from "~~/utils/position";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import formatPercentage from "~~/utils/formatPercentage";
import { encodeMorphoContext } from "~~/utils/v2/instructionHelpers";

interface MorphoPositionsSectionProps {
  title: string;
  rows: MorphoPositionRow[];
  markets: MorphoMarket[];
  userAddress: string | undefined;
  hasLoadedOnce: boolean;
  isUpdating: boolean;
  chainId: number;
  onBorrowRequest?: (params: { market: MorphoMarket; collateralAddress: string }) => void;
  onDepositRequest?: () => void;
}

export const MorphoPositionsSection: FC<MorphoPositionsSectionProps> = ({
  title,
  rows,
  markets: _markets,
  userAddress,
  hasLoadedOnce,
  isUpdating: _isUpdating,
  chainId,
  onBorrowRequest: _onBorrowRequest,
  onDepositRequest: _onDepositRequest,
}) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRowExpanded = (key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderPositions = () => {
    if (!userAddress) {
      return (
        <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
          Connect your wallet to view your Morpho Blue positions
        </div>
      );
    }

    if (!hasLoadedOnce) {
      return (
        <div className="flex justify-center py-6">
          <span className="loading loading-spinner loading-md" />
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
          No positions found
        </div>
      );
    }

    return rows.map((row) => {
      // Pre-encode the Morpho market context for modals
      const protocolContext = encodeMorphoContext(row.context);

      // Create supply position with encoded context
      const supplyPosition = {
        icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
        name: row.collateralSymbol,
        balance: row.collateralBalanceUsd,
        tokenBalance: row.collateralBalance,
        currentRate: row.supplyApy,
        tokenAddress: row.market.collateralAsset?.address || "",
        tokenDecimals: row.collateralDecimals,
        tokenPrice: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
        tokenSymbol: row.collateralSymbol,
        protocolContext, // Pre-encoded market context for lending instructions
      };

      // Create borrow position with encoded context
      const borrowPosition = row.hasDebt
        ? {
            icon: tokenNameToLogo(row.loanSymbol.toLowerCase()),
            name: row.loanSymbol,
            balance: row.borrowBalanceUsd,
            tokenBalance: row.borrowBalance,
            currentRate: row.borrowApy,
            tokenAddress: row.market.loanAsset.address,
            tokenDecimals: row.borrowDecimals,
            tokenPrice: BigInt(Math.floor((row.market.loanAsset.priceUsd || 0) * 1e8)),
            tokenSymbol: row.loanSymbol,
            protocolContext, // Pre-encoded market context for lending instructions
          }
        : null;

      const positionManager = PositionManager.fromPositions(
        [supplyPosition],
        borrowPosition ? [borrowPosition] : []
      );

      const ltvDisplayValue =
        row.currentLtv != null ? `${formatPercentage(row.currentLtv, 1)}%` : "--";

      const containerColumns = "grid-cols-1 md:grid-cols-2 md:divide-x";

      return (
        <div
          key={row.key}
          className="relative overflow-hidden rounded-md border border-base-300"
        >
          {/* Market pair header */}
          <div className="flex items-center justify-between bg-base-200/50 px-3 py-2 border-b border-base-300">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                <Image
                  src={tokenNameToLogo(row.collateralSymbol.toLowerCase())}
                  alt={row.collateralSymbol}
                  width={20}
                  height={20}
                  className="rounded-full border border-base-100 bg-base-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/logos/default.svg";
                  }}
                />
                <Image
                  src={tokenNameToLogo(row.loanSymbol.toLowerCase())}
                  alt={row.loanSymbol}
                  width={20}
                  height={20}
                  className="rounded-full border border-base-100 bg-base-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/logos/default.svg";
                  }}
                />
              </div>
              <span className="text-sm font-medium">
                {row.collateralSymbol}/{row.loanSymbol}
              </span>
              <span className="text-xs text-base-content/50">
                Max LTV: {row.lltv.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {row.hasDebt && (
                <>
                  <span className="text-base-content/60">
                    LTV: <span className={row.currentLtv && row.currentLtv > row.lltv * 0.9 ? "text-error" : "text-success"}>{ltvDisplayValue}</span>
                  </span>
                  <span className={`badge badge-sm ${row.isHealthy ? "badge-success" : "badge-error"}`}>
                    HF: {row.healthFactor?.toFixed(2) || "∞"}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Side-by-side positions */}
          <div className={`grid divide-y divide-base-300 md:divide-y-0 ${containerColumns}`}>
            {/* Left: Collateral (Supply) */}
            <SupplyPosition
              {...supplyPosition}
              protocolName="morpho-blue"
              networkType="evm"
              chainId={chainId}
              position={positionManager}
              disableMove
              containerClassName="rounded-none"
              availableActions={{ deposit: true, withdraw: true, move: false, swap: false }}
              controlledExpanded={!!expandedRows[row.key]}
              onToggleExpanded={() => toggleRowExpanded(row.key)}
              extraStats={[{ label: "LTV", value: ltvDisplayValue }]}
              showExpandIndicator={false}
            />

            {/* Right: Debt (Borrow) */}
            {borrowPosition ? (
              <BorrowPosition
                {...borrowPosition}
                protocolName="morpho-blue"
                networkType="evm"
                chainId={chainId}
                position={positionManager}
                containerClassName="rounded-none"
                availableActions={{
                  borrow: true,
                  repay: true,
                  move: false,
                  close: false,
                  swap: false,
                }}
                showNoDebtLabel={!row.hasDebt}
                controlledExpanded={!!expandedRows[row.key]}
                onToggleExpanded={() => toggleRowExpanded(row.key)}
              />
            ) : (
              <div className="flex h-full items-center justify-between gap-3 border border-dashed border-base-300 bg-base-200/60 p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-base-content/70">No debt</span>
                  <span className="text-xs text-base-content/50">
                    You can borrow {row.loanSymbol} against this collateral.
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  disabled
                  title="Borrow functionality coming soon"
                >
                  Borrow
                </button>
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with title and badge */}
      <div className="flex items-center justify-between pb-3 mb-1 border-b border-base-200/50">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-base-content/60">{title}</span>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            <span className="text-xs font-mono font-bold">{rows.length}</span>
            <span className="text-[10px] uppercase tracking-wider opacity-70">{rows.length === 1 ? "market" : "markets"}</span>
          </div>
        )}
      </div>

      {/* Positions list */}
      <div className="space-y-3">{renderPositions()}</div>
    </div>
  );
};
