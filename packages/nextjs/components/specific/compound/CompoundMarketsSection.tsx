"use client";

import * as React from "react";
import type { FC } from "react";
import Image from "next/image";
import {
  Flex,
  ScrollArea,
  Spinner,
  Text,
  Tooltip,
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

import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { DepositModal } from "~~/components/modals/DepositModal";
import { useModal } from "~~/hooks/useModal";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth/notification";
import { encodeAbiParameters, type Address } from "viem";
import type { CompoundMarketPosition } from "~~/hooks/useCompoundLendingPositions";

// ── Types ──────────────────────────────────────────────────────────

interface CompoundMarketsSectionProps {
  markets: CompoundMarketPosition[];
  isLoading: boolean;
  chainId: number;
  /** Called when user clicks "Borrow" on a market row — opens deposit+borrow flow */
  onBorrow?: (market: CompoundMarketPosition) => void;
}

interface MarketRow {
  baseToken: Address;
  baseSymbol: string;
  baseIcon: string;
  baseDecimals: number;
  supplyApr: number;
  borrowApr: number;
  collaterals: { symbol: string; icon: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────

function TokenIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const src = tokenNameToLogo(symbol.toLowerCase());
  const containerStyle = React.useMemo(
    () => ({ width: size, height: size, minWidth: size, minHeight: size }),
    [size],
  );
  const fontStyle = React.useMemo(() => ({ fontSize: size * 0.4 }), [size]);
  const handleImageError = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      (e.target as HTMLImageElement).style.display = "none";
    },
    [],
  );

  return (
    <span
      className="bg-base-300 relative inline-flex flex-shrink-0 overflow-hidden rounded-full"
      style={containerStyle}
    >
      <Image
        src={src}
        alt={symbol}
        width={size}
        height={size}
        className="object-cover"
        onError={handleImageError}
      />
      <span
        className="text-base-content/70 absolute inset-0 flex items-center justify-center text-xs font-medium"
        style={fontStyle}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
    </span>
  );
}

function formatApr(value: number): string {
  return `${value.toFixed(2)}%`;
}

function encodeCompoundMarket(marketAddress: Address): string {
  return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
}

// ── Collateral stack with tooltip ──────────────────────────────────

const MAX_VISIBLE = 5;

function CollateralStack({ collaterals }: { collaterals: { symbol: string; icon: string }[] }) {
  if (collaterals.length === 0) {
    return <span className="text-base-content/40 text-xs">None</span>;
  }

  const visible = collaterals.slice(0, MAX_VISIBLE);
  const remaining = collaterals.length - MAX_VISIBLE;

  return (
    <Tooltip
      content={
        <span className="block max-h-48 space-y-1 overflow-y-auto">
          <span className="mb-1.5 block text-xs font-medium">
            {collaterals.length} accepted collaterals:
          </span>
          {collaterals.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs">
              <TokenIcon symbol={c.symbol} size={14} />
              <span>{c.symbol}</span>
            </span>
          ))}
        </span>
      }
    >
      <div className="flex cursor-help items-center">
        <div className="flex items-center -space-x-1.5">
          {visible.map((c, i) => (
            <div
              key={i}
              className="ring-base-100 rounded-full ring-1"
              style={{ zIndex: MAX_VISIBLE - i }}
            >
              <TokenIcon symbol={c.symbol} size={18} />
            </div>
          ))}
        </div>
        {remaining > 0 && (
          <span className="text-base-content/60 ml-1 text-[10px] font-medium">
            +{remaining}
          </span>
        )}
      </div>
    </Tooltip>
  );
}

// ── Column definitions ─────────────────────────────────────────────

const columnHelper = createColumnHelper<MarketRow>();

const columns = [
  columnHelper.accessor("baseSymbol", {
    id: "market",
    header: "Market",
    cell: info => (
      <div className="flex items-center gap-2">
        <TokenIcon symbol={info.row.original.baseSymbol} size={24} />
        <span className="font-medium">{info.getValue()}</span>
      </div>
    ),
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("collaterals", {
    id: "collaterals",
    header: "Collaterals",
    cell: info => <CollateralStack collaterals={info.getValue()} />,
    enableSorting: false,
  }),
  columnHelper.accessor("supplyApr", {
    id: "supplyApr",
    header: "Earn",
    cell: info => (
      <span className="text-success">{formatApr(info.getValue())}</span>
    ),
    sortingFn: "basic",
  }),
  columnHelper.accessor("borrowApr", {
    id: "borrowApr",
    header: "Borrow",
    cell: info => <span>{formatApr(info.getValue())}</span>,
    sortingFn: "basic",
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: () => null,
  }),
];

// ── Component ──────────────────────────────────────────────────────

export const CompoundMarketsSection: FC<CompoundMarketsSectionProps> = ({
  markets,
  isLoading,
  chainId,
  onBorrow,
}) => {
  const { address: connectedAddress } = useAccount();
  const depositModal = useModal();
  const [selectedMarket, setSelectedMarket] = React.useState<MarketRow | null>(null);
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const rows: MarketRow[] = React.useMemo(() => {
    return markets.map(market => ({
      baseToken: market.baseToken,
      baseSymbol: market.baseSymbol,
      baseIcon: market.baseIcon,
      baseDecimals: market.baseDecimals,
      supplyApr: market.supplyApr,
      borrowApr: market.borrowApr,
      collaterals: market.acceptedCollaterals.map(c => ({
        symbol: c.symbol,
        icon: c.icon,
      })),
    }));
  }, [markets]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Lookup map: baseToken -> original market (for onBorrow callback)
  const marketsByToken = React.useMemo(() => {
    const map = new Map<string, CompoundMarketPosition>();
    for (const m of markets) map.set(m.baseToken.toLowerCase(), m);
    return map;
  }, [markets]);

  const handleSupply = React.useCallback(
    (row: MarketRow) => {
      if (!connectedAddress) {
        notification.warning("Connect your wallet to supply");
        return;
      }
      setSelectedMarket(row);
      depositModal.open();
    },
    [connectedAddress, depositModal],
  );

  const handleBorrow = React.useCallback(
    (row: MarketRow) => {
      if (!onBorrow) return;
      const market = marketsByToken.get(row.baseToken.toLowerCase());
      if (market) onBorrow(market);
    },
    [onBorrow, marketsByToken],
  );

  const handleCloseDepositModal = React.useCallback(() => {
    depositModal.close();
    setSelectedMarket(null);
  }, [depositModal]);

  const depositModalToken = React.useMemo(() => {
    if (!selectedMarket) return null;
    return {
      name: selectedMarket.baseSymbol,
      icon: selectedMarket.baseIcon,
      address: selectedMarket.baseToken,
      decimals: selectedMarket.baseDecimals,
      currentRate: selectedMarket.supplyApr,
    };
  }, [selectedMarket]);

  const depositModalContext = React.useMemo(() => {
    if (!selectedMarket) return undefined;
    return encodeCompoundMarket(selectedMarket.baseToken);
  }, [selectedMarket]);

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
        <Text size="2" className="text-base-content/50 ml-2">Loading markets...</Text>
      </Flex>
    );
  }

  if (rows.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text size="2" className="text-base-content/40">No Compound markets found</Text>
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
                    const isCollaterals = columnId === "collaterals";
                    const isActions = columnId === "actions";
                    const canSort = header.column.getCanSort();

                    return (
                      <th
                        key={header.id}
                        className={`label-text-xs pb-2 ${
                          isMarket ? "text-left" :
                          isCollaterals ? "px-3 text-left" :
                          isActions ? "pl-6" :
                          "text-right"
                        } ${canSort ? "hover:text-base-content/60 cursor-pointer transition-colors" : ""}`}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        {!header.isPlaceholder && (
                          <span className={`inline-flex items-center gap-1 ${isSorted(columnId) ? "text-primary" : ""}`}>
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
                    const isCollaterals = columnId === "collaterals";
                    const isActions = columnId === "actions";

                    return (
                      <td
                        key={cell.id}
                        className={`group-hover:bg-base-200/30 py-2.5 transition-colors ${
                          isMarket ? "rounded-l-lg pl-3" :
                          isCollaterals ? "px-3" :
                          isActions ? "rounded-r-lg pl-6 pr-3 text-right" :
                          "text-right tabular-nums"
                        }`}
                      >
                        {isActions ? (
                          <div className="flex items-center justify-end gap-3">
                            {onBorrow && (
                              <button
                                type="button"
                                className="text-base-content/60 hover:text-primary text-sm font-medium transition-colors"
                                onClick={() => handleBorrow(row.original)}
                              >
                                Borrow
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-base-content hover:text-primary text-sm font-medium transition-colors"
                              onClick={() => handleSupply(row.original)}
                            >
                              Supply
                            </button>
                          </div>
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
            key={row.baseToken}
            className="border-base-300/50 bg-base-200/20 hover:bg-base-200/40 rounded-lg border px-3 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TokenIcon symbol={row.baseSymbol} size={24} />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{row.baseSymbol}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-success font-mono tabular-nums">{formatApr(row.supplyApr)}</span>
                <span className="font-mono tabular-nums">{formatApr(row.borrowApr)}</span>
              </div>
              <div className="flex items-center gap-2">
                {onBorrow && (
                  <button
                    type="button"
                    className="text-base-content/60 hover:text-primary text-xs font-medium transition-colors"
                    onClick={() => handleBorrow(row)}
                  >
                    Borrow
                  </button>
                )}
                <button
                  type="button"
                  className="text-base-content hover:text-primary text-xs font-medium transition-colors"
                  onClick={() => handleSupply(row)}
                >
                  Supply
                </button>
              </div>
            </div>
            {row.collaterals.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-base-content/50 text-[10px]">Collaterals:</span>
                <CollateralStack collaterals={row.collaterals} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Deposit Modal */}
      {selectedMarket && depositModalToken && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={handleCloseDepositModal}
          token={depositModalToken}
          protocolName="compound"
          chainId={chainId}
          context={depositModalContext}
        />
      )}
    </Flex>
  );
};
