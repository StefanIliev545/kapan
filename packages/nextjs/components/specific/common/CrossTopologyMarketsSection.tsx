"use client";

import * as React from "react";
import type { FC, ReactNode } from "react";
import {
  Flex,
  ScrollArea,
  Spinner,
  Text,
} from "@radix-ui/themes";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TokenIcon } from "~~/components/common/TokenDisplay";
import { formatPercent } from "../utils";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { ReserveConfig } from "~~/hooks/usePredictiveLtv";

// ── Types ──────────────────────────────────────────────────────────

interface CrossTopologyMarketsSectionProps {
  /** Supply-side positions (all markets, including zero-balance) */
  suppliedPositions: ProtocolPosition[];
  /** Borrow-side positions (all markets, including zero-balance) */
  borrowedPositions: ProtocolPosition[];
  isLoading?: boolean;
  /**
   * Optional render function for additional per-row content (e.g., Venus collateral toggle).
   * Receives the supply position and its index in the supplied array.
   */
  renderRowExtra?: (pos: ProtocolPosition, index: number) => ReactNode;
  /** Per-asset reserve configs for LTV column (from usePredictiveLtv) */
  reserveConfigs?: ReserveConfig[];
}

/** Merged market row combining supply and borrow data for the same token */
interface MarketRow {
  tokenAddress: string;
  symbol: string;
  supplyApy: number;
  borrowApy: number | null;
  /** LTV in basis points (e.g. 8000 = 80%), null if no config available */
  ltvBps: number | null;
  supplyIndex: number;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Format an APY value (already in percentage points, e.g. 5.25 for 5.25%) */
function formatApy(value: number): string {
  // Aave/Venus rates are in percentage points; convert to 0-1 scale for formatPercent
  return formatPercent(value / 100, 2);
}

/** Format LTV from basis points (e.g. 8000 → "80%") */
function formatLtvBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

// ── Column definitions ─────────────────────────────────────────────

const columnHelper = createColumnHelper<MarketRow>();

const baseColumns = [
  columnHelper.accessor("symbol", {
    id: "market",
    header: "Market",
    cell: info => (
      <div className="flex items-center gap-2">
        <TokenIcon symbol={info.row.original.symbol} customSize={24} />
        <span className="font-medium">{info.getValue()}</span>
      </div>
    ),
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("supplyApy", {
    id: "supplyApy",
    header: "Earn",
    cell: info => {
      const value = info.getValue();
      return (
        <span className={`font-mono tabular-nums ${value > 0 ? "text-success" : "text-base-content/30"}`}>
          {formatApy(value)}
        </span>
      );
    },
    sortingFn: "basic",
  }),
  columnHelper.accessor("borrowApy", {
    id: "borrowApy",
    header: "Borrow",
    cell: info => {
      const value = info.getValue();
      if (value === null || value === 0) {
        return <span className="text-base-content/30 font-mono tabular-nums">{"\u2014"}</span>;
      }
      return <span className="font-mono tabular-nums">{formatApy(value)}</span>;
    },
    sortingFn: "basic",
  }),
  columnHelper.accessor("ltvBps", {
    id: "ltv",
    header: "LTV",
    cell: info => {
      const value = info.getValue();
      if (value === null) {
        return <span className="text-base-content/30 font-mono tabular-nums">{"\u2014"}</span>;
      }
      return <span className="text-base-content/70 font-mono tabular-nums">{formatLtvBps(value)}</span>;
    },
    sortingFn: "basic",
  }),
];

// Extra column only used when renderRowExtra is provided (e.g., Venus collateral toggle)
const extraColumn = columnHelper.display({
  id: "extra",
  header: "",
  cell: () => null,
});

// ── Component ──────────────────────────────────────────────────────

/**
 * Read-only markets table for cross-topology protocols (Aave, Venus, Spark, ZeroLend).
 *
 * Merges supply and borrow positions by tokenAddress into a single row per market,
 * showing Supply APY, Borrow APY, and per-asset LTV columns. No action buttons —
 * supply/borrow/loop buttons live under the position columns in the protocol view.
 */
export const CrossTopologyMarketsSection: FC<CrossTopologyMarketsSectionProps> = ({
  suppliedPositions,
  borrowedPositions,
  isLoading,
  renderRowExtra,
  reserveConfigs,
}) => {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const borrowRateByAddress = React.useMemo(() => {
    const map = new Map<string, number>();
    borrowedPositions.forEach(pos => {
      map.set(pos.tokenAddress.toLowerCase(), pos.currentRate);
    });
    return map;
  }, [borrowedPositions]);

  const ltvByAddress = React.useMemo(() => {
    const map = new Map<string, number>();
    if (reserveConfigs) {
      reserveConfigs.forEach(config => {
        map.set(config.token.toLowerCase(), Number(config.ltv));
      });
    }
    return map;
  }, [reserveConfigs]);

  const rows: MarketRow[] = React.useMemo(() => {
    return suppliedPositions.map((pos, index) => {
      const borrowRate = borrowRateByAddress.get(pos.tokenAddress.toLowerCase());
      const ltv = ltvByAddress.get(pos.tokenAddress.toLowerCase());
      return {
        tokenAddress: pos.tokenAddress,
        symbol: pos.tokenSymbol || pos.name,
        supplyApy: pos.currentRate,
        borrowApy: borrowRate !== undefined ? borrowRate : null,
        ltvBps: ltv !== undefined ? ltv : null,
        supplyIndex: index,
      };
    });
  }, [suppliedPositions, borrowRateByAddress, ltvByAddress]);

  const columns = React.useMemo(
    () => renderRowExtra ? [...baseColumns, extraColumn] : baseColumns,
    [renderRowExtra],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const getSortIcon = (columnId: string) => {
    const sortState = sorting.find(s => s.id === columnId);
    if (!sortState) return null;
    return sortState.desc ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />;
  };

  const isSorted = (columnId: string) => sorting.some(s => s.id === columnId);

  if (isLoading) {
    return (
      <Flex align="center" justify="center" py="6">
        <Spinner size="2" />
        <Text size="2" className="text-base-content/50 ml-2">
          Loading markets...
        </Text>
      </Flex>
    );
  }

  if (rows.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text size="2" className="text-base-content/40">
          No markets found
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {/* Desktop table */}
      <div className="hidden md:block">
        <ScrollArea scrollbars="horizontal" type="auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => {
                    const columnId = header.column.id;
                    const isMarket = columnId === "market";
                    const isExtra = columnId === "extra";
                    const canSort = header.column.getCanSort();

                    return (
                      <th
                        key={header.id}
                        className={`label-text-xs pb-2 ${
                          isMarket
                            ? "text-left"
                            : isExtra
                              ? "w-8"
                              : "text-right"
                        } ${canSort ? "hover:text-base-content/60 cursor-pointer transition-colors" : ""}`}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        {!header.isPlaceholder && (
                          <span
                            className={`inline-flex items-center gap-1 ${isSorted(columnId) ? "text-primary" : ""}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {getSortIcon(columnId)}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="group">
                  {row.getVisibleCells().map(cell => {
                    const columnId = cell.column.id;
                    const isMarket = columnId === "market";
                    const isExtra = columnId === "extra";

                    return (
                      <td
                        key={cell.id}
                        className={`group-hover:bg-base-200/30 py-2.5 transition-colors ${
                          isMarket
                            ? "rounded-l-lg pl-3"
                            : isExtra
                              ? "rounded-r-lg pr-3 text-right"
                              : "text-right"
                        }`}
                      >
                        {isExtra ? (
                          renderRowExtra?.(
                            suppliedPositions[row.original.supplyIndex],
                            row.original.supplyIndex,
                          )
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {/* Mobile cards */}
      <div className="block space-y-2 md:hidden">
        {rows.map(row => (
          <div
            key={row.tokenAddress}
            className="border-base-300/50 bg-base-200/20 hover:bg-base-200/40 rounded-lg border px-3 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TokenIcon symbol={row.symbol} customSize={24} />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{row.symbol}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className={`font-mono tabular-nums ${row.supplyApy > 0 ? "text-success" : "text-base-content/30"}`}>
                  {formatApy(row.supplyApy)}
                </span>
                {row.borrowApy !== null && row.borrowApy > 0 ? (
                  <span className="font-mono tabular-nums">{formatApy(row.borrowApy)}</span>
                ) : (
                  <span className="text-base-content/30">{"\u2014"}</span>
                )}
                {row.ltvBps !== null ? (
                  <span className="text-base-content/70 font-mono tabular-nums">{formatLtvBps(row.ltvBps)}</span>
                ) : (
                  <span className="text-base-content/30">{"\u2014"}</span>
                )}
              </div>
              {renderRowExtra && (
                <div className="flex items-center">
                  {renderRowExtra(suppliedPositions[row.supplyIndex], row.supplyIndex)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Flex>
  );
};
