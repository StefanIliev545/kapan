"use client";

import { FC, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import type { MorphoPositionRow, MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { PositionManager } from "~~/utils/position";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import formatPercentage from "~~/utils/formatPercentage";
import { encodeMorphoContext } from "~~/utils/v2/instructionHelpers";
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { ExternalLink } from "lucide-react";
import { isPTToken, PTYield } from "~~/hooks/usePendlePTYields";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { formatSignedPercent } from "../utils";

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

// Static image error handler at module level
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).src = "/logos/default.svg";
};

// Static click propagation handler
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// CSS class constants to avoid duplicate string warnings
const TEXT_SUCCESS = "text-success";
const TEXT_ERROR = "text-error";

// Static available actions objects (can be reused across renders)
const SUPPLY_ACTIONS_WITH_MOVE = { deposit: true, withdraw: true, move: true, swap: false } as const;
const SUPPLY_ACTIONS_WITHOUT_MOVE = { deposit: true, withdraw: true, move: false, swap: false } as const;

// Memoized position row component to avoid recreating inline objects on each render
interface MorphoPositionRowProps {
  row: MorphoPositionRow;
  chainId: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  yieldsByAddress?: Map<string, PTYield>;
  yieldsBySymbol?: Map<string, PTYield>;
}

const MorphoPositionRowComponent: FC<MorphoPositionRowProps> = ({
  row,
  chainId,
  isExpanded,
  onToggleExpanded,
  yieldsByAddress,
  yieldsBySymbol,
}) => {
  // Pre-encode the Morpho market context for modals
  const protocolContext = useMemo(() => encodeMorphoContext(row.context), [row.context]);

  // Calculate collateral rate (PT tokens have fixed yield)
  const collateralRate = useMemo(() => {
    if (!isPTToken(row.collateralSymbol)) return 0;
    const collateralAddr = row.market.collateralAsset?.address?.toLowerCase() || "";
    const ptYield = yieldsByAddress?.get(collateralAddr) || yieldsBySymbol?.get(row.collateralSymbol.toLowerCase());
    return ptYield?.fixedApy ?? 0;
  }, [row.collateralSymbol, row.market.collateralAsset?.address, yieldsByAddress, yieldsBySymbol]);

  // Memoized supply position object
  const supplyPosition = useMemo(() => ({
    icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
    name: row.collateralSymbol,
    balance: row.collateralBalanceUsd,
    tokenBalance: row.collateralBalance,
    currentRate: collateralRate,
    tokenAddress: row.market.collateralAsset?.address || "",
    tokenDecimals: row.collateralDecimals,
    tokenPrice: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
    tokenSymbol: row.collateralSymbol,
    protocolContext,
  }), [row.collateralSymbol, row.collateralBalanceUsd, row.collateralBalance, row.collateralDecimals, row.market.collateralAsset, collateralRate, protocolContext]);

  // Memoized borrow position object
  const borrowPosition = useMemo(() => {
    if (!row.hasCollateral) return null;
    return {
      icon: tokenNameToLogo(row.loanSymbol.toLowerCase()),
      name: row.loanSymbol,
      balance: row.borrowBalanceUsd,
      tokenBalance: row.borrowBalance,
      currentRate: row.borrowApy,
      tokenAddress: row.market.loanAsset.address,
      tokenDecimals: row.borrowDecimals,
      tokenPrice: BigInt(Math.floor((row.market.loanAsset.priceUsd || 0) * 1e8)),
      tokenSymbol: row.loanSymbol,
      protocolContext,
    };
  }, [row.hasCollateral, row.loanSymbol, row.borrowBalanceUsd, row.borrowBalance, row.borrowApy, row.borrowDecimals, row.market.loanAsset, protocolContext]);

  // Memoized position manager
  const positionManager = useMemo(() => {
    return PositionManager.fromPositions(
      [supplyPosition],
      borrowPosition ? [borrowPosition] : []
    );
  }, [supplyPosition, borrowPosition]);

  // Memoized LTV display value
  const ltvDisplayValue = useMemo(() => {
    return row.currentLtv != null ? `${formatPercentage(row.currentLtv, 1)}%` : "--";
  }, [row.currentLtv]);

  // Memoized yield metrics
  const positionYieldMetrics = useMemo(() => {
    return calculateNetYieldMetrics(
      [{ balance: row.collateralBalanceUsd, currentRate: collateralRate }],
      row.hasDebt ? [{ balance: row.borrowBalanceUsd, currentRate: row.borrowApy }] : []
    );
  }, [row.collateralBalanceUsd, collateralRate, row.hasDebt, row.borrowBalanceUsd, row.borrowApy]);

  // Memoized extra stats for supply position
  const extraStats = useMemo(() => [{ label: "LTV", value: ltvDisplayValue }], [ltvDisplayValue]);

  // Memoized available assets for borrow position
  const availableAssets = useMemo(() => [{
    symbol: row.collateralSymbol,
    address: row.market.collateralAsset?.address || "",
    decimals: row.collateralDecimals,
    rawBalance: row.collateralBalance,
    balance: row.collateralBalanceUsd,
    icon: tokenNameToLogo(row.collateralSymbol.toLowerCase()),
    price: BigInt(Math.floor((row.market.collateralAsset?.priceUsd || 0) * 1e8)),
  }], [row.collateralSymbol, row.collateralDecimals, row.collateralBalance, row.collateralBalanceUsd, row.market.collateralAsset]);

  // Memoized borrow available actions
  const borrowAvailableActions = useMemo(() => ({
    borrow: true,
    repay: row.hasDebt,
    move: row.hasDebt,
    close: row.hasDebt && row.hasCollateral,
    swap: false,
  }), [row.hasDebt, row.hasCollateral]);

  // Memoized move support
  const moveSupport = useMemo(() => ({
    preselectedCollaterals: row.hasCollateral ? [{
      token: row.market.collateralAsset?.address || "",
      symbol: row.collateralSymbol,
      decimals: row.collateralDecimals,
      amount: row.collateralBalance,
      maxAmount: row.collateralBalance,
      supported: true,
    }] : [],
    disableCollateralSelection: true,
  }), [row.hasCollateral, row.collateralSymbol, row.collateralDecimals, row.collateralBalance, row.market.collateralAsset?.address]);

  // Memoized Morpho URL
  const morphoUrl = useMemo(() => {
    return getMorphoMarketUrl(chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol);
  }, [chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol]);

  // Select appropriate supply actions based on collateral status
  const supplyAvailableActions = row.hasCollateral ? SUPPLY_ACTIONS_WITH_MOVE : SUPPLY_ACTIONS_WITHOUT_MOVE;

  const containerColumns = "grid-cols-1 md:grid-cols-2 md:divide-x";

  return (
    <div
      key={row.key}
      className="border-base-300 hover:border-base-content/15 relative rounded-md border transition-all duration-200"
    >
      {/* Market pair header */}
      <div
        className="bg-base-200/50 border-base-300 hover:bg-base-200/70 flex cursor-pointer flex-col gap-2 border-b px-3 py-2 transition-colors sm:flex-row sm:items-center sm:justify-between"
        onClick={onToggleExpanded}
      >
        {/* Market name row */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex flex-shrink-0 -space-x-2">
            <Image
              src={tokenNameToLogo(row.collateralSymbol.toLowerCase())}
              alt={row.collateralSymbol}
              width={20}
              height={20}
              className="border-base-100 bg-base-200 rounded-full border"
              onError={handleImageError}
            />
            <Image
              src={tokenNameToLogo(row.loanSymbol.toLowerCase())}
              alt={row.loanSymbol}
              width={20}
              height={20}
              className="border-base-100 bg-base-200 rounded-full border"
              onError={handleImageError}
            />
          </div>
          <span className="truncate text-sm font-medium" title={`${row.collateralSymbol}/${row.loanSymbol}`}>
            {row.collateralSymbol}/{row.loanSymbol}
          </span>
          {morphoUrl && (
            <a
              href={morphoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopPropagation}
              className="inline-flex flex-shrink-0 items-center gap-0.5 opacity-50 transition-opacity hover:opacity-100"
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
          )}
        </div>
        {/* Stats row - wraps on mobile */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {/* Net Value */}
          <span className="text-base-content/60">
            Net:{" "}
            <span className={positionYieldMetrics.netBalance >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>
              {formatCurrencyCompact(positionYieldMetrics.netBalance)}
            </span>
          </span>
          {/* Net APY */}
          <span className="text-base-content/60">
            APY:{" "}
            <span className={positionYieldMetrics.netApyPercent == null ? "text-base-content/40" : positionYieldMetrics.netApyPercent >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>
              {positionYieldMetrics.netApyPercent != null ? formatSignedPercent(positionYieldMetrics.netApyPercent) : "—"}
            </span>
          </span>
          {/* LTV - show first on mobile since it's important */}
          {row.hasDebt && (
            <span className="text-base-content/60">
              LTV:{" "}
              <span className={row.currentLtv && row.currentLtv > row.lltv * 0.9 ? TEXT_ERROR : TEXT_SUCCESS}>{ltvDisplayValue}</span>
              <span className="text-base-content/50">/{row.lltv.toFixed(0)}%</span>
            </span>
          )}
          {/* 30D Yield - hidden on very small screens */}
          <span className="text-base-content/60 group relative hidden cursor-help min-[400px]:inline">
            30D:{" "}
            <span className={positionYieldMetrics.netYield30d >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>
              {formatCurrencyCompact(positionYieldMetrics.netYield30d)}
            </span>
            <span className="bg-base-300 text-base-content pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Est. annual: <span className={positionYieldMetrics.netAnnualYield >= 0 ? TEXT_SUCCESS : TEXT_ERROR}>{formatCurrencyCompact(positionYieldMetrics.netAnnualYield)}</span>
            </span>
          </span>
        </div>
      </div>

      {/* Side-by-side positions */}
      <div className={`divide-base-300 grid divide-y md:divide-y-0 ${containerColumns}`}>
        {/* Left: Collateral (Supply) */}
        <SupplyPosition
          {...supplyPosition}
          protocolName="morpho-blue"
          networkType="evm"
          chainId={chainId}
          position={positionManager}
          disableMove={!row.hasCollateral}
          containerClassName="rounded-none"
          availableActions={supplyAvailableActions}
          controlledExpanded={isExpanded}
          onToggleExpanded={onToggleExpanded}
          extraStats={extraStats}
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
            availableAssets={availableAssets}
            availableActions={borrowAvailableActions}
            moveSupport={moveSupport}
            showNoDebtLabel={!row.hasDebt}
            controlledExpanded={isExpanded}
            onToggleExpanded={onToggleExpanded}
          />
        ) : null}
      </div>
    </div>
  );
};

export const MorphoPositionsSection: FC<MorphoPositionsSectionProps> = ({
  title,
  rows,
  userAddress,
  hasLoadedOnce,
  chainId,
  yieldsByAddress,
  yieldsBySymbol,
}) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRowExpanded = useCallback((key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Memoize toggle handlers for each row to avoid creating new functions on each render
  const getToggleHandler = useCallback((key: string) => {
    return () => toggleRowExpanded(key);
  }, [toggleRowExpanded]);

  const renderPositions = () => {
    if (!userAddress) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          Connect your wallet to view your Morpho Blue positions
        </div>
      );
    }

    if (!hasLoadedOnce) {
      return (
        <div className="flex justify-center py-6">
          <LoadingSpinner size="md" />
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          No positions found
        </div>
      );
    }

    return rows.map((row) => (
      <MorphoPositionRowComponent
        key={row.key}
        row={row}
        chainId={chainId}
        isExpanded={!!expandedRows[row.key]}
        onToggleExpanded={getToggleHandler(row.key)}
        yieldsByAddress={yieldsByAddress}
        yieldsBySymbol={yieldsBySymbol}
      />
    ));
  };

  return (
    <div className="space-y-4">
      {/* Header with title and badge */}
      <div className="border-base-200/50 mb-1 flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary h-5 w-1 rounded-full" />
          <span className="text-base-content/60 text-[11px] font-semibold uppercase tracking-widest">{title}</span>
        </div>
        {rows.length > 0 && (
          <div className="bg-primary/10 text-primary flex items-center gap-1.5 rounded-full px-2 py-0.5">
            <span className="font-mono text-xs font-bold">{rows.length}</span>
            <span className="text-[10px] uppercase tracking-wider opacity-70">{rows.length === 1 ? "market" : "markets"}</span>
          </div>
        )}
      </div>

      {/* Positions list */}
      <div className="space-y-3">{renderPositions()}</div>
    </div>
  );
};
