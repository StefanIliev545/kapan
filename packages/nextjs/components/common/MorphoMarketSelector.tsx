"use client";

import React, { FC, useMemo } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { createMorphoContext, type MorphoMarketContext } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { LoadingSpinner } from "./Loading";

// ============ Types ============

export interface MorphoMarketSelectorProps {
  // Markets to display (pre-filtered by collateral + loan token)
  markets: MorphoMarket[];
  // Selected market
  selectedMarket: MorphoMarket | null;
  // Callback when a market is selected
  onSelectMarket: (market: MorphoMarket, context: MorphoMarketContext) => void;
  // Chain ID for external links
  chainId: number;
  // Loading state
  isLoading?: boolean;
  // Disabled state
  disabled?: boolean;
  // Additional CSS classes
  className?: string;
}

// ============ Helpers ============

function formatPercent(value01: number, digits = 2): string {
  if (!Number.isFinite(value01)) return "-.--";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value01);
}

function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLtv(lltvString: string): string {
  try {
    // lltv is stored as BigInt with 18 decimals (e.g., "860000000000000000" = 86%)
    const lltv = BigInt(lltvString);
    const percentage = Number(lltv) / 1e16; // Convert to percentage
    return `${percentage.toFixed(0)}%`;
  } catch {
    return "--%";
  }
}

function utilizationColor(utilization: number): string {
  if (utilization >= 0.95) return "text-error";
  if (utilization >= 0.85) return "text-warning";
  return "text-base-content/70";
}

// ============ Component ============

export const MorphoMarketSelector: FC<MorphoMarketSelectorProps> = ({
  markets,
  selectedMarket,
  onSelectMarket,
  chainId,
  isLoading = false,
  disabled = false,
  className = "",
}) => {
  // Find the best rate market (lowest borrow APY)
  const bestRateMarketId = useMemo(() => {
    if (markets.length === 0) return null;
    let bestMarket = markets[0];
    for (const market of markets) {
      if (market.state.borrowApy < bestMarket.state.borrowApy) {
        bestMarket = market;
      }
    }
    return bestMarket.uniqueKey;
  }, [markets]);

  const handleSelect = (market: MorphoMarket) => {
    if (disabled) return;
    const context = createMorphoContext(market);
    onSelectMarket(market, context);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="text-sm text-base-content/80">Select Morpho Market</div>
        <div className="flex items-center justify-center py-6 border border-base-300 rounded-lg">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  // No markets available
  if (markets.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="text-sm text-base-content/80">Select Morpho Market</div>
        <div className="p-4 border border-base-300 rounded-lg bg-base-200/30">
          <div className="text-sm text-base-content/60 text-center">
            No compatible Morpho markets found for this collateral/debt pair.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-sm text-base-content/80">Select Morpho Market</div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {markets.map(market => {
          const isSelected = selectedMarket?.uniqueKey === market.uniqueKey;
          const isBestRate = market.uniqueKey === bestRateMarketId;
          const collateralSymbol = market.collateralAsset?.symbol || "???";
          const loanSymbol = market.loanAsset.symbol;
          const morphoUrl = getMorphoMarketUrl(chainId, market.uniqueKey, collateralSymbol, loanSymbol);
          const tvl = market.state.supplyAssetsUsd ?? 0;
          const utilization = market.state.utilization ?? 0;

          return (
            <div
              key={market.uniqueKey}
              className={`
                p-3 border rounded-lg cursor-pointer transition-all
                ${isSelected ? "border-primary bg-primary/10" : "border-base-300 hover:border-base-content/30"}
                ${disabled ? "opacity-50 cursor-not-allowed" : ""}
              `}
              onClick={() => handleSelect(market)}
            >
              <div className="flex items-center justify-between gap-3">
                {/* Left side: Radio + Market info */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Radio indicator */}
                  <div
                    className={`
                      w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                      ${isSelected ? "border-primary bg-primary" : "border-base-content/30"}
                    `}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary-content" />}
                  </div>

                  {/* Token pair icons */}
                  <div className="flex items-center -space-x-1.5 flex-shrink-0">
                    <div className="w-5 h-5 relative ring-2 ring-base-100 rounded-full overflow-hidden">
                      <Image
                        src={tokenNameToLogo(collateralSymbol.toLowerCase())}
                        alt={collateralSymbol}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="w-5 h-5 relative ring-2 ring-base-100 rounded-full overflow-hidden">
                      <Image
                        src={tokenNameToLogo(loanSymbol.toLowerCase())}
                        alt={loanSymbol}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>

                  {/* Market name + best rate badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm whitespace-nowrap">
                      {collateralSymbol}/{loanSymbol}
                    </span>
                    {isBestRate && markets.length > 1 && (
                      <span className="badge badge-success badge-xs whitespace-nowrap">Best Rate</span>
                    )}
                    {morphoUrl && (
                      <a
                        href={morphoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-base-content/40 hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Right side: Stats */}
                <div className="flex items-center gap-4 text-xs flex-shrink-0">
                  <div className="text-center">
                    <div className="text-base-content/50">LTV</div>
                    <div className="font-medium">{formatLtv(market.lltv)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base-content/50">Borrow</div>
                    <div className="font-medium">{formatPercent(market.state.borrowApy)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base-content/50">TVL</div>
                    <div className="font-medium">{formatUsdCompact(tvl)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base-content/50">Util</div>
                    <div className={`font-medium ${utilizationColor(utilization)}`}>
                      {formatPercent(utilization)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MorphoMarketSelector;
