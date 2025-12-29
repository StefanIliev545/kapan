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
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { ExternalLink } from "lucide-react";
import { isPTToken, PTYield } from "~~/hooks/usePendlePTYields";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { formatCurrencyCompact } from "~~/utils/formatNumber";

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
  /** PT yield lookup by address (lowercase) */
  yieldsByAddress?: Map<string, PTYield>;
  /** PT yield lookup by symbol (lowercase) */
  yieldsBySymbol?: Map<string, PTYield>;
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
  yieldsByAddress,
  yieldsBySymbol,
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
      // Note: Collateral in Morpho doesn't earn yield (0% APY) UNLESS it's a PT token
      // PT tokens have a fixed yield to maturity from Pendle
      let collateralRate = 0;
      if (isPTToken(row.collateralSymbol)) {
        const collateralAddr = row.market.collateralAsset?.address?.toLowerCase() || "";
        const ptYield = yieldsByAddress?.get(collateralAddr) || yieldsBySymbol?.get(row.collateralSymbol.toLowerCase());
        if (ptYield) {
          collateralRate = ptYield.fixedApy;
        }
      }
      
      const supplyPosition = {
        icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
        name: row.collateralSymbol,
        balance: row.collateralBalanceUsd,
        tokenBalance: row.collateralBalance,
        currentRate: collateralRate,
        tokenAddress: row.market.collateralAsset?.address || "",
        tokenDecimals: row.collateralDecimals,
        tokenPrice: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
        tokenSymbol: row.collateralSymbol,
        protocolContext, // Pre-encoded market context for lending instructions
      };

      // Create borrow position with encoded context
      // Always create borrow position if there's collateral, even with no debt (allows borrowing)
      const borrowPosition = row.hasCollateral
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

      // Calculate per-position net APY and 30D yield
      const positionYieldMetrics = calculateNetYieldMetrics(
        [{ balance: row.collateralBalanceUsd, currentRate: collateralRate }],
        row.hasDebt ? [{ balance: row.borrowBalanceUsd, currentRate: row.borrowApy }] : []
      );

      const formatSignedPercentage = (val: number) => {
        const sign = val >= 0 ? "+" : "";
        return `${sign}${val.toFixed(2)}%`;
      };

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
              {(() => {
                const morphoUrl = getMorphoMarketUrl(
                  chainId,
                  row.market.uniqueKey,
                  row.collateralSymbol,
                  row.loanSymbol
                );
                return morphoUrl ? (
                  <a
                    href={morphoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-0.5 opacity-50 hover:opacity-100 transition-opacity ml-1"
                    title="View on Morpho"
                  >
                    <Image
                      src="/logos/morpho.svg"
                      alt="Morpho"
                      width={14}
                      height={14}
                      className="rounded-sm"
                    />
                    <ExternalLink width={10} height={10} />
                  </a>
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-4 text-xs">
              {/* Net Value */}
              <span className="text-base-content/60">
                Net:{" "}
                <span className={positionYieldMetrics.netBalance >= 0 ? "text-success" : "text-error"}>
                  {formatCurrencyCompact(positionYieldMetrics.netBalance)}
                </span>
              </span>
              {/* Net APY */}
              <span className="text-base-content/60">
                Net APY:{" "}
                <span className={positionYieldMetrics.netApyPercent == null ? "text-base-content/40" : positionYieldMetrics.netApyPercent >= 0 ? "text-success" : "text-error"}>
                  {positionYieldMetrics.netApyPercent != null ? formatSignedPercentage(positionYieldMetrics.netApyPercent) : "—"}
                </span>
              </span>
              {/* 30D Yield with tooltip for annual yield */}
              <span className="hidden sm:inline text-base-content/60 group relative cursor-help">
                30D:{" "}
                <span className={positionYieldMetrics.netYield30d >= 0 ? "text-success" : "text-error"}>
                  {formatCurrencyCompact(positionYieldMetrics.netYield30d)}
                </span>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] bg-base-300 text-base-content rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Est. annual: <span className={positionYieldMetrics.netAnnualYield >= 0 ? "text-success" : "text-error"}>{formatCurrencyCompact(positionYieldMetrics.netAnnualYield)}</span>
                </span>
              </span>
              {/* LTV */}
              {row.hasDebt && (
                <span className="text-base-content/60">
                  LTV: <span className={row.currentLtv && row.currentLtv > row.lltv * 0.9 ? "text-error" : "text-success"}>{ltvDisplayValue}</span>
                  <span className="text-base-content/50 ml-1">
                    / {row.lltv.toFixed(0)}%
                  </span>
                </span>
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
              disableMove={!row.hasCollateral} // Enable move when there's collateral
              containerClassName="rounded-none"
              availableActions={{ deposit: true, withdraw: true, move: row.hasCollateral, swap: false }}
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
                availableAssets={[{
                  // Morpho markets are pair-isolated: single collateral per market
                  symbol: row.collateralSymbol,
                  address: row.market.collateralAsset?.address || "",
                  decimals: row.collateralDecimals,
                  rawBalance: row.collateralBalance,
                  balance: row.collateralBalanceUsd,
                  icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
                  price: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
                }]}
                availableActions={{
                  borrow: true,
                  repay: row.hasDebt, // Only show repay if there's actual debt
                  move: row.hasDebt, // Enable move when there's debt to refinance
                  close: row.hasDebt && row.hasCollateral, // Enable close when has both debt and collateral
                  swap: false,
                }}
                // For Morpho, preselect the collateral from the isolated market
                moveSupport={{
                  preselectedCollaterals: row.hasCollateral ? [{
                    token: row.market.collateralAsset?.address || "",
                    symbol: row.collateralSymbol,
                    decimals: row.collateralDecimals,
                    amount: row.collateralBalance,
                    maxAmount: row.collateralBalance,
                    supported: true, // Morpho collateral is always supported for moving out
                  }] : [],
                  disableCollateralSelection: true, // Morpho positions have fixed collateral
                }}
                showNoDebtLabel={!row.hasDebt}
                controlledExpanded={!!expandedRows[row.key]}
                onToggleExpanded={() => toggleRowExpanded(row.key)}
              />
            ) : null}
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
