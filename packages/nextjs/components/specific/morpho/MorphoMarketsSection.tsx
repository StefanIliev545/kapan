"use client";

import { FC, useMemo, useState } from "react";
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

interface MorphoMarketsSectionProps {
  markets: MorphoMarket[];
  marketPairs: Map<string, MorphoMarket[]>;
  isLoading: boolean;
  chainId: number;
}

export const MorphoMarketsSection: FC<MorphoMarketsSectionProps> = ({
  markets,
  marketPairs: _marketPairs,
  isLoading,
  chainId: _chainId,
}) => {
  const [sortBy, setSortBy] = useState<"liquidity" | "apy" | "utilization">(
    "liquidity"
  );
  const [filterSearch, setFilterSearch] = useState("");

  const formatUsd = (value: number) => {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  // Filter and sort markets
  const sortedMarkets = useMemo(() => {
    let filtered = markets.filter((m) => m.collateralAsset); // Only pairs

    // Apply search filter
    if (filterSearch) {
      const search = filterSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.collateralAsset?.symbol.toLowerCase().includes(search) ||
          m.loanAsset.symbol.toLowerCase().includes(search)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "liquidity":
          return (
            (b.state.liquidityAssets || b.state.supplyAssets) -
            (a.state.liquidityAssets || a.state.supplyAssets)
          );
        case "apy":
          return b.state.supplyApy - a.state.supplyApy;
        case "utilization":
          return b.state.utilization - a.state.utilization;
        default:
          return 0;
      }
    });
  }, [markets, sortBy, filterSearch]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="rounded-lg bg-base-200/60 p-6 text-center">
        <p className="text-base-content/70">No markets found on this chain</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search markets..."
          className="input input-bordered input-sm w-48"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />

        <div className="btn-group">
          <button
            className={`btn btn-xs ${sortBy === "liquidity" ? "btn-active" : ""}`}
            onClick={() => setSortBy("liquidity")}
          >
            Liquidity
          </button>
          <button
            className={`btn btn-xs ${sortBy === "apy" ? "btn-active" : ""}`}
            onClick={() => setSortBy("apy")}
          >
            APY
          </button>
          <button
            className={`btn btn-xs ${sortBy === "utilization" ? "btn-active" : ""}`}
            onClick={() => setSortBy("utilization")}
          >
            Utilization
          </button>
        </div>

        <span className="text-sm text-base-content/60 ml-auto">
          {sortedMarkets.length} markets
        </span>
      </div>

      {/* Markets Table */}
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Market</th>
              <th className="text-right">Supply</th>
              <th className="text-right">Borrow</th>
              <th className="text-right">Utilization</th>
              <th className="text-right">Supply APY</th>
              <th className="text-right">Borrow APY</th>
              <th className="text-right">Max LTV</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedMarkets.slice(0, 20).map((market) => {
              const lltv = (Number(market.lltv) / 1e18) * 100;
              const loanPrice = market.loanAsset.priceUsd || 0;

              // Estimate TVL
              const supplyUsd =
                (market.state.supplyAssets / 10 ** market.loanAsset.decimals) *
                loanPrice;

              return (
                <tr key={market.uniqueKey} className="hover">
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        <img
                          src={tokenNameToLogo(
                            market.collateralAsset?.symbol.toLowerCase() || ""
                          )}
                          alt={market.collateralAsset?.symbol}
                          className="w-6 h-6 rounded-full border border-base-100 bg-base-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "/logos/default.svg";
                          }}
                        />
                        <img
                          src={tokenNameToLogo(
                            market.loanAsset.symbol.toLowerCase()
                          )}
                          alt={market.loanAsset.symbol}
                          className="w-6 h-6 rounded-full border border-base-100 bg-base-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "/logos/default.svg";
                          }}
                        />
                      </div>
                      <div>
                        <div className="font-medium">
                          {market.collateralAsset?.symbol}/{market.loanAsset.symbol}
                        </div>
                        <div className="text-xs text-base-content/60">
                          {market.uniqueKey.slice(0, 10)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right">
                    {formatUsd(supplyUsd)}
                  </td>
                  <td className="text-right">
                    {formatUsd(
                      (market.state.borrowAssets /
                        10 ** market.loanAsset.decimals) *
                        loanPrice
                    )}
                  </td>
                  <td className="text-right">
                    <div
                      className={`badge badge-sm ${
                        market.state.utilization > 0.9
                          ? "badge-error"
                          : market.state.utilization > 0.7
                            ? "badge-warning"
                            : "badge-success"
                      }`}
                    >
                      {(market.state.utilization * 100).toFixed(1)}%
                    </div>
                  </td>
                  <td className="text-right text-success">
                    {(market.state.supplyApy * 100).toFixed(2)}%
                  </td>
                  <td className="text-right text-error">
                    {(market.state.borrowApy * 100).toFixed(2)}%
                  </td>
                  <td className="text-right">{lltv.toFixed(0)}%</td>
                  <td>
                    <button className="btn btn-primary btn-xs">Supply</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedMarkets.length > 20 && (
        <div className="text-center text-sm text-base-content/60">
          Showing 20 of {sortedMarkets.length} markets
        </div>
      )}
    </div>
  );
};

