"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";
import type { FC } from "react";
import Image from "next/image";
import {
  Box,
  Button,
  Card,
  Flex,
  IconButton,
  ScrollArea,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { Search, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { TablePagination } from "~~/components/common/TablePagination";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";

import type { EulerVault, EulerCollateralInfo } from "~~/hooks/useEulerLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { usePendlePTYields, isPTToken } from "~~/hooks/usePendlePTYields";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import { useModal } from "~~/hooks/useModal";
import { DepositModal } from "~~/components/modals/DepositModal";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth/notification";
import {
  toNumberSafe,
  makeUsdFormatter,
  formatPercent,
} from "../utils";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";

// Static icon sizes
const SEARCH_ICON_SIZE = { width: 12, height: 12 };
const ICON_BUTTON_ARIA_LABEL = "Clear search";

interface EulerMarketsSectionProps {
  vaults: EulerVault[];
  isLoading: boolean;
  chainId: number;
  onSupply?: (vault: EulerVault) => void;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

// Row data type for TanStack Table
interface VaultRow {
  vault: EulerVault;
  assetSymbol: string;
  assetAddress: string;
  tvlUsd: number;
  utilization01: number;
  supplyApy01: number;
  borrowApy01: number;
  collaterals: EulerCollateralInfo[];
  impliedApy: number | null; // PT implied yield (as percentage, e.g., 15.5)
}

const columnHelper = createColumnHelper<VaultRow>();

// Token Icon component
function TokenIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const src = tokenNameToLogo(symbol.toLowerCase());
  const containerStyle = React.useMemo(
    () => ({ width: size, height: size, minWidth: size, minHeight: size }),
    [size]
  );
  const fontStyle = React.useMemo(() => ({ fontSize: size * 0.4 }), [size]);
  const handleImageError = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
  }, []);

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

// Token category definitions for filter tabs
type TokenCategory = "all" | "eth" | "btc" | "stables";

const TOKEN_CATEGORIES: Record<TokenCategory, { label: string; patterns: string[] }> = {
  all: { label: "All", patterns: [] },
  eth: { label: "Eth", patterns: ["eth", "weth", "steth", "wsteth", "cbeth", "reth", "weeth", "ezeth", "rseth", "meth", "oeth", "sweth", "sfrxeth", "frxeth", "eeth"] },
  btc: { label: "Btc", patterns: ["btc", "wbtc", "cbbtc", "lbtc", "tbtc", "sbtc"] },
  stables: { label: "Stables", patterns: ["usdc", "usdt", "dai", "usde", "frax", "lusd", "gusd", "tusd", "usdp", "susd", "mim", "eurc", "cusd", "pyusd", "gho", "dola", "usd"] },
};

function matchesCategory(symbol: string, category: TokenCategory): boolean {
  if (category === "all") return true;
  const lowerSymbol = symbol.toLowerCase();
  return TOKEN_CATEGORIES[category].patterns.some(pattern => lowerSymbol.includes(pattern));
}

// Category button component
function CategoryButton({
  category,
  isActive,
  onClick
}: {
  category: TokenCategory;
  isActive: boolean;
  onClick: (category: TokenCategory) => void;
}) {
  const handleClick = React.useCallback(() => onClick(category), [category, onClick]);
  return (
    <button
      onClick={handleClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        isActive
          ? 'bg-primary text-primary-content'
          : 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'
      }`}
    >
      {TOKEN_CATEGORIES[category].label}
    </button>
  );
}

// Option button component for SearchableSelect
function OptionButton({
  option,
  isSelected,
  onSelect,
  showIcon,
  displayLabel,
}: {
  option: string;
  isSelected: boolean;
  onSelect: (option: string) => void;
  showIcon?: boolean;
  displayLabel?: string;
}) {
  const handleClick = React.useCallback(() => onSelect(option), [option, onSelect]);
  return (
    <button
      onClick={handleClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
        isSelected ? 'bg-primary/10' : 'hover:bg-base-200'
      }`}
    >
      <div className={`flex size-4 flex-shrink-0 items-center justify-center rounded border-2 ${
        isSelected ? 'border-primary bg-primary' : 'border-base-content/30'
      }`}>
        {isSelected && (
          <svg className="text-primary-content size-2.5" fill="none" viewBox="0 0 10 10">
            <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {showIcon && <TokenIcon symbol={option} size={24} />}
      <span className={`text-sm ${isSelected ? 'font-medium' : ''}`}>
        {displayLabel ?? option}
      </span>
    </button>
  );
}

// Searchable Select Component with token icons, category tabs, and multi-select support
interface SearchableSelectProps {
  options: string[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder: string;
  allLabel: string;
}

function SearchableSelect({ options, value, onValueChange, placeholder, allLabel }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<TokenCategory>("all");
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isAllSelected = value.length === 0;
  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const handleClearSearchTerm = React.useCallback(() => setSearchTerm(""), []);
  const handleToggleOpen = React.useCallback(() => setIsOpen(prev => !prev), []);
  const handleStopPropagation = React.useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const updatePosition = React.useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchTerm("");
        setActiveCategory("all");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const filteredOptions = React.useMemo(() => {
    let filtered = options;
    if (activeCategory !== "all") {
      filtered = filtered.filter(opt => matchesCategory(opt, activeCategory));
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(opt => opt.toLowerCase().includes(term));
    }
    return filtered;
  }, [options, searchTerm, activeCategory]);

  // Display value: show count or stacked icons
  const displayValue = React.useMemo(() => {
    if (isAllSelected) return allLabel;
    if (value.length === 1) return value[0];
    return `${value.length} selected`;
  }, [isAllSelected, value, allLabel]);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Toggle selection for multi-select
  const handleSelect = React.useCallback((option: string) => {
    if (option === "all") {
      // Clear all selections
      onValueChange([]);
    } else {
      // Toggle this option
      if (selectedSet.has(option)) {
        onValueChange(value.filter(v => v !== option));
      } else {
        onValueChange([...value, option]);
      }
    }
    // Keep dropdown open for multi-select
  }, [onValueChange, value, selectedSet]);

  const handleClear = React.useCallback(() => {
    onValueChange([]);
    setSearchTerm("");
    setActiveCategory("all");
  }, [onValueChange]);

  const dropdownStyle = React.useMemo(
    () => position ? { top: position.top, left: position.left } : undefined,
    [position]
  );

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value),
    []
  );

  const dropdownContent = isOpen && position && typeof document !== "undefined" ? (
    <div
      ref={dropdownRef}
      className="bg-base-100 fixed z-[9999] w-80 rounded-xl shadow-xl ring-1 ring-base-content/5"
      style={dropdownStyle}
      onClick={handleStopPropagation}
    >
      <div className="p-4 pb-3">
        <div className="relative">
          <Search className="text-base-content/40 absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search ${placeholder.toLowerCase()}...`}
            value={searchTerm}
            onChange={handleSearchChange}
            className="input input-sm bg-base-200/30 w-full border-0 pl-9 pr-8 focus:bg-base-200/50 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearchTerm}
              className="btn btn-ghost btn-xs btn-circle absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(TOKEN_CATEGORIES) as TokenCategory[]).map(cat => (
            <CategoryButton key={cat} category={cat} isActive={activeCategory === cat} onClick={setActiveCategory} />
          ))}
          <div className="flex-1" />
          <button onClick={handleClear} className="text-xs text-base-content/50 hover:text-base-content/70 transition-colors">Clear</button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto px-2 pb-2">
        <OptionButton option="all" isSelected={isAllSelected} onSelect={handleSelect} displayLabel={allLabel} />
        {filteredOptions.length === 0 ? (
          <div className="text-base-content/50 py-8 text-center text-sm">No matches found</div>
        ) : (
          <>
            {filteredOptions.slice(0, 50).map(opt => (
              <OptionButton key={opt} option={opt} isSelected={selectedSet.has(opt)} onSelect={handleSelect} showIcon />
            ))}
            {filteredOptions.length > 50 && (
              <div className="text-base-content/40 py-2 text-center text-xs">
                {filteredOptions.length - 50} more — search to find
              </div>
            )}
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex min-w-[140px] items-center justify-between gap-2 rounded-lg bg-base-200/40 px-3 py-1.5 text-sm transition-colors hover:bg-base-200/70"
        onClick={handleToggleOpen}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {!isAllSelected && value.length === 1 && <TokenIcon symbol={value[0]} size={18} />}
          {!isAllSelected && value.length > 1 && (
            <div className="flex -space-x-1">
              {value.slice(0, 3).map((v, i) => (
                <div key={v} className="ring-base-100 rounded-full ring-1" style={{ zIndex: 3 - i }}>
                  <TokenIcon symbol={v} size={16} />
                </div>
              ))}
            </div>
          )}
          <span className="truncate">{displayValue}</span>
        </div>
        <ChevronDown className={`size-4 flex-shrink-0 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {dropdownContent && typeof document !== "undefined" && ReactDOM.createPortal(dropdownContent, document.body)}
    </>
  );
}

// Collateral stack component - shows stacked token icons with hover tooltip
const MAX_VISIBLE_COLLATERALS = 5;

function CollateralStack({ collaterals }: { collaterals: EulerCollateralInfo[] }) {
  // Get unique token symbols (dedupe same token from different vaults)
  const uniqueTokens = React.useMemo(() => {
    const seen = new Set<string>();
    return collaterals.filter(c => {
      const key = c.tokenSymbol.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [collaterals]);

  if (uniqueTokens.length === 0) {
    return <span className="text-base-content/40 text-xs">None</span>;
  }

  const visibleTokens = uniqueTokens.slice(0, MAX_VISIBLE_COLLATERALS);
  const remainingCount = uniqueTokens.length - MAX_VISIBLE_COLLATERALS;

  return (
    <Tooltip content={
      <span className="block max-h-48 space-y-1 overflow-y-auto">
        <span className="mb-1.5 block text-xs font-medium">{uniqueTokens.length} accepted collaterals:</span>
        {uniqueTokens.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs">
            <TokenIcon symbol={c.tokenSymbol} size={14} />
            <span>{c.tokenSymbol}</span>
          </span>
        ))}
      </span>
    }>
      <div className="flex cursor-help items-center">
        <div className="flex items-center -space-x-1.5">
          {visibleTokens.map((c, i) => {
            const zIndex = MAX_VISIBLE_COLLATERALS - i;
            return (
              <div
                key={i}
                className="ring-base-100 rounded-full ring-1"
                style={{ zIndex }}
              >
                <TokenIcon symbol={c.tokenSymbol} size={18} />
              </div>
            );
          })}
        </div>
        {remainingCount > 0 && (
          <span className="text-base-content/60 ml-1 text-[10px] font-medium">
            +{remainingCount}
          </span>
        )}
      </div>
    </Tooltip>
  );
}

// Mobile vault row with expandable details
interface MobileVaultRowProps {
  row: VaultRow;
  usd: Intl.NumberFormat;
  chainId: number;
  onSupply: () => void;
}

// Euler app network names by chain
const EULER_NETWORK_NAMES: Record<number, string> = {
  1: "ethereum",
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
};

// Get Euler app URL for a vault
function getEulerVaultUrl(chainId: number, vaultAddress: string): string {
  const network = EULER_NETWORK_NAMES[chainId] || "ethereum";
  return `https://app.euler.finance/vault/${vaultAddress}?network=${network}`;
}

function MobileVaultRow({ row, usd, chainId, onSupply }: MobileVaultRowProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const eulerUrl = getEulerVaultUrl(chainId, row.vault.address);

  const handleToggle = React.useCallback(() => setIsExpanded(prev => !prev), []);
  const handleStopPropagation = React.useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
  const handleSupplyClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSupply();
  }, [onSupply]);

  return (
    <div
      className={`cursor-pointer rounded-lg border transition-colors ${
        isExpanded
          ? 'border-primary/30 bg-base-200/40'
          : 'border-base-300/50 bg-base-200/20 hover:bg-base-200/40'
      }`}
      onClick={handleToggle}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <TokenIcon symbol={row.assetSymbol} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <a
              href={eulerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleStopPropagation}
              className="hover:text-primary truncate transition-colors"
            >
              <TokenSymbolDisplay symbol={row.assetSymbol} size="sm" variant="inline" />
            </a>
            <a
              href={eulerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleStopPropagation}
              className="opacity-40 transition-opacity hover:opacity-80"
            >
              <ExternalLink className="size-3" />
            </a>
          </div>
          <span className="text-base-content/50 truncate text-[10px]">{row.vault.symbol}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-base-content/70 font-mono tabular-nums">{usd.format(row.tvlUsd)}</span>
          {row.impliedApy !== null ? (
            <span className="text-info font-mono tabular-nums">{formatPercent(row.impliedApy / 100, 2)}</span>
          ) : (
            <span className="text-success font-mono tabular-nums">{formatPercent(row.supplyApy01, 2)}</span>
          )}
          <span className="font-mono tabular-nums">{formatPercent(row.borrowApy01, 2)}</span>
        </div>

        <ChevronDown className={`text-base-content/40 size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded: details and actions */}
      {isExpanded && (
        <div className="space-y-2 px-3 pb-2 pt-0">
          <div className="flex items-center gap-2">
            <span className="text-base-content/50 text-[10px]">Collaterals:</span>
            <CollateralStack collaterals={row.collaterals} />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-base-content/50 flex flex-1 items-center gap-3 text-[10px]">
              <span>Util: <span className="text-base-content/70">{formatPercent(row.utilization01, 0)}</span></span>
            </div>
            <button className="btn btn-xs btn-primary" onClick={handleSupplyClick}>
              Supply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Mobile row wrapper props
interface MobileVaultRowItemProps {
  row: VaultRow;
  usd: Intl.NumberFormat;
  chainId: number;
  onSupply: (vault: EulerVault) => void;
}

function MobileVaultRowItem({ row, usd, chainId, onSupply }: MobileVaultRowItemProps) {
  const handleSupply = React.useCallback(() => onSupply(row.vault), [row.vault, onSupply]);

  return (
    <MobileVaultRow
      row={row}
      usd={usd}
      chainId={chainId}
      onSupply={handleSupply}
    />
  );
}

export const EulerMarketsSection: FC<EulerMarketsSectionProps> = ({
  vaults,
  isLoading,
  chainId,
  onSupply,
  pageSize = DEFAULT_PAGE_SIZE,
}) => {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "tvlUsd", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [selectedAssets, setSelectedAssets] = React.useState<string[]>([]);
  const [selectedCollaterals, setSelectedCollaterals] = React.useState<string[]>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const deferredGlobalFilter = React.useDeferredValue(globalFilter);

  const usd = React.useMemo(() => makeUsdFormatter(), []);

  const depositModal = useModal();
  const [selectedVault, setSelectedVault] = React.useState<EulerVault | null>(null);
  const { address: walletAddress, chainId: walletChainId } = useAccount();

  // Fetch Pendle PT yields for PT tokens
  const { yieldsByAddress, yieldsBySymbol } = usePendlePTYields(chainId);

  // Memoize filter sets for performance
  const assetFilterSet = React.useMemo(() => new Set(selectedAssets), [selectedAssets]);
  const collateralFilterSet = React.useMemo(() => new Set(selectedCollaterals), [selectedCollaterals]);

  // Transform vaults to row data
  const data = React.useMemo<VaultRow[]>(() => {
    return vaults
      .filter(v => {
        // Asset filter (underlying token) - empty array means all
        if (assetFilterSet.size > 0 && !assetFilterSet.has(v.asset.symbol)) return false;
        // Collateral filter (vaults that accept ANY of the selected collaterals) - empty array means all
        if (collateralFilterSet.size > 0) {
          const hasMatchingCollateral = v.collaterals?.some(c => collateralFilterSet.has(c.tokenSymbol));
          if (!hasMatchingCollateral) return false;
        }
        return true;
      })
      .map(v => {
        const assetSymbol = v.asset.symbol || "???";
        const assetAddress = (v.asset.address || "").toLowerCase();

        // Look up PT implied yield for the asset
        let impliedApy: number | null = null;
        if (isPTToken(assetSymbol)) {
          const ptYield = yieldsByAddress.get(assetAddress) || yieldsBySymbol.get(assetSymbol.toLowerCase());
          if (ptYield) {
            impliedApy = ptYield.fixedApy;
          }
        }

        return {
          vault: v,
          assetSymbol,
          assetAddress,
          tvlUsd: toNumberSafe(v.totalSupply),
          utilization01: toNumberSafe(v.utilization),
          supplyApy01: toNumberSafe(v.supplyApy),
          borrowApy01: toNumberSafe(v.borrowApy),
          collaterals: v.collaterals || [],
          impliedApy,
        };
      });
  }, [vaults, assetFilterSet, collateralFilterSet, yieldsByAddress, yieldsBySymbol]);

  // Extract unique assets (underlying tokens) from vaults
  const uniqueAssets = React.useMemo(() => {
    const assets = new Set<string>();
    vaults.forEach(v => {
      if (v.asset?.symbol) assets.add(v.asset.symbol);
    });
    return Array.from(assets).sort();
  }, [vaults]);

  // Extract unique collateral tokens from all vaults
  const uniqueCollaterals = React.useMemo(() => {
    const collaterals = new Set<string>();
    vaults.forEach(v => {
      v.collaterals?.forEach(c => {
        if (c.tokenSymbol && c.tokenSymbol !== "???") {
          collaterals.add(c.tokenSymbol);
        }
      });
    });
    return Array.from(collaterals).sort();
  }, [vaults]);

  // Column definitions
  const columns = React.useMemo(() => [
    columnHelper.accessor("vault", {
      id: "market",
      header: "Market",
      enableSorting: false,
      cell: info => {
        const row = info.row.original;
        const eulerUrl = getEulerVaultUrl(chainId, row.vault.address);
        return (
          <div className="flex items-center gap-2">
            <TokenIcon symbol={row.assetSymbol} size={24} />
            <div className="flex flex-col">
              <a
                href={eulerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary group/link flex items-center gap-1 transition-colors"
              >
                <TokenSymbolDisplay symbol={row.assetSymbol} size="sm" variant="inline" />
                <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/link:opacity-60" />
              </a>
              <span className="text-base-content/50 max-w-[180px] truncate text-[10px]" title={row.vault.name}>
                {row.vault.symbol}
              </span>
            </div>
          </div>
        );
      },
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue) return true;
        const r = row.original;
        const searchable = `${r.vault.name} ${r.vault.symbol} ${r.assetSymbol} ${r.vault.address}`.toLowerCase();
        return searchable.includes(filterValue.toLowerCase());
      },
    }),
    columnHelper.accessor("collaterals", {
      id: "collaterals",
      header: "Collaterals",
      enableSorting: false,
      cell: info => <CollateralStack collaterals={info.getValue()} />,
    }),
    columnHelper.accessor("tvlUsd", {
      header: "TVL",
      cell: info => usd.format(info.getValue()),
      sortingFn: "basic",
    }),
    columnHelper.accessor("utilization01", {
      id: "util",
      header: "Util",
      cell: info => formatPercent(info.getValue(), 0),
      sortingFn: "basic",
    }),
    columnHelper.accessor("supplyApy01", {
      header: "Earn",
      cell: info => {
        const row = info.row.original;
        const supplyApy = info.getValue();
        const impliedApy = row.impliedApy;

        // For PT tokens, show implied yield (if available) with indicator
        if (impliedApy !== null) {
          return (
            <Tooltip content={`Implied APY from Pendle PT. Vault APY: ${formatPercent(supplyApy, 2)}`}>
              <span className="text-info cursor-help border-b border-dashed border-current">
                {formatPercent(impliedApy / 100, 2)}
              </span>
            </Tooltip>
          );
        }

        return <span className="text-success">{formatPercent(supplyApy, 2)}</span>;
      },
      sortingFn: (rowA, rowB) => {
        // Sort by implied APY if available, otherwise by supply APY
        const aApy = rowA.original.impliedApy !== null ? rowA.original.impliedApy / 100 : rowA.original.supplyApy01;
        const bApy = rowB.original.impliedApy !== null ? rowB.original.impliedApy / 100 : rowB.original.supplyApy01;
        return aApy - bApy;
      },
    }),
    columnHelper.accessor("borrowApy01", {
      header: "Borrow",
      cell: info => formatPercent(info.getValue(), 2),
      sortingFn: "basic",
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: info => (
        <button
          onClick={() => handleSupplyClick(info.row.original.vault)}
          className="text-sm font-medium text-base-content hover:text-primary transition-colors"
        >
          Supply
        </button>
      ),
    }),
  ], [chainId, usd]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: deferredGlobalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const r = row.original;
      const searchable = `${r.vault.name} ${r.vault.symbol} ${r.assetSymbol} ${r.vault.address}`.toLowerCase();
      return searchable.includes(filterValue.toLowerCase());
    },
    initialState: {
      pagination: { pageSize },
    },
  });

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setGlobalFilter(e.currentTarget.value),
    []
  );
  const handleClearSearch = React.useCallback(() => setGlobalFilter(""), []);
  const handleResetAll = React.useCallback(() => {
    setGlobalFilter("");
    setSorting([{ id: "tvlUsd", desc: true }]);
    setSelectedAssets([]);
    setSelectedCollaterals([]);
  }, []);

  const handleSupplyClick = React.useCallback(
    (v: EulerVault) => {
      if (onSupply) {
        onSupply(v);
        return;
      }

      if (!walletAddress) {
        notification.error("Please connect your wallet to deposit");
        return;
      }

      if (walletChainId !== chainId) {
        notification.error(`Please switch to chain ID ${chainId} to deposit`);
        return;
      }

      setSelectedVault(v);
      depositModal.open();
    },
    [onSupply, depositModal, walletAddress, walletChainId, chainId]
  );

  const handleCloseDepositModal = React.useCallback(() => {
    depositModal.close();
    setSelectedVault(null);
  }, [depositModal]);

  // Memoized props for DepositModal
  const depositModalToken = React.useMemo(() => {
    if (!selectedVault) return null;
    return {
      name: selectedVault.asset.symbol,
      icon: tokenNameToLogo(selectedVault.asset.symbol),
      address: selectedVault.asset.address,
      currentRate: selectedVault.supplyApy * 100,
      decimals: selectedVault.asset.decimals,
    };
  }, [selectedVault]);

  const depositModalContext = React.useMemo(() => {
    if (!selectedVault) return "";
    return encodeEulerContext({
      borrowVault: selectedVault.address,
      collateralVault: selectedVault.address,
    });
  }, [selectedVault]);

  const rows = table.getRowModel().rows;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const canPreviousPage = table.getCanPreviousPage();
  const canNextPage = table.getCanNextPage();
  const totalItems = table.getFilteredRowModel().rows.length;

  const handlePageChange = React.useCallback(
    (newPageIndex: number) => table.setPageIndex(newPageIndex),
    [table]
  );

  // Reset to first page when filters change
  // Note: table is intentionally excluded from deps - it's a new object every render
  // but table.setPageIndex is stable via closure
  React.useEffect(() => {
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter, selectedAssets, selectedCollaterals]);

  if (isLoading) {
    return (
      <Card size="2">
        <Flex align="center" justify="center" py="6">
          <Spinner size="3" />
        </Flex>
      </Card>
    );
  }

  if (vaults.length === 0) {
    return (
      <Card size="2">
        <Flex direction="column" gap="2">
          <Text weight="bold">No markets available</Text>
          <Text color="gray">No markets were returned for this chain (chainId: {chainId}).</Text>
        </Flex>
      </Card>
    );
  }

  // Helper to get sort indicator for a column
  const getSortIcon = (columnId: string) => {
    const sortState = sorting.find(s => s.id === columnId);
    if (!sortState) return null;
    return sortState.desc ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />;
  };

  const isSorted = (columnId: string) => sorting.some(s => s.id === columnId);

  return (
    <Flex direction="column" gap="3">
      {/* Filter bar */}
      <Flex align="center" gap="2" wrap="wrap" className="px-1">
        <Box className="w-full sm:w-auto sm:min-w-[200px] sm:max-w-[280px]">
          <TextField.Root
            size="1"
            variant="surface"
            placeholder="Search markets..."
            value={globalFilter}
            onChange={handleSearchChange}
          >
            <TextField.Slot>
              <Search {...SEARCH_ICON_SIZE} />
            </TextField.Slot>

            {globalFilter ? (
              <TextField.Slot side="right">
                <IconButton
                  size="1"
                  variant="ghost"
                  aria-label={ICON_BUTTON_ARIA_LABEL}
                  onClick={handleClearSearch}
                >
                  <X {...SEARCH_ICON_SIZE} />
                </IconButton>
              </TextField.Slot>
            ) : null}
          </TextField.Root>
        </Box>

        {/* Asset and Collateral filters */}
        <div className="flex items-center gap-2">
          <SearchableSelect
            options={uniqueAssets}
            value={selectedAssets}
            onValueChange={setSelectedAssets}
            placeholder="Asset"
            allLabel="All Assets"
          />
          <SearchableSelect
            options={uniqueCollaterals}
            value={selectedCollaterals}
            onValueChange={setSelectedCollaterals}
            placeholder="Collateral"
            allLabel="All Collaterals"
          />
        </div>

        <div className="flex-1" />

        <Text size="1" color="gray" className="tabular-nums">
          {table.getFilteredRowModel().rows.length} markets
        </Text>
      </Flex>

      {rows.length === 0 ? (
        <Card size="2">
          <Flex direction="column" gap="2" p="4">
            <Text weight="bold">No matches</Text>
            <Text color="gray" size="2">
              Try a different search or clear filters.
            </Text>
            <Flex gap="2">
              <Button variant="soft" onClick={handleClearSearch} disabled={!globalFilter}>
                Clear search
              </Button>
              <Button variant="outline" onClick={handleResetAll}>
                Reset all
              </Button>
            </Flex>
          </Flex>
        </Card>
      ) : (
        <>
          {/* Mobile: Card-based layout */}
          <div className="block space-y-2 md:hidden">
            {rows.map(row => (
              <MobileVaultRowItem
                key={row.original.vault.id}
                row={row.original}
                usd={usd}
                chainId={chainId}
                onSupply={handleSupplyClick}
              />
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block">
            <ScrollArea scrollbars="horizontal" type="auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => {
                        const canSort = header.column.getCanSort();
                        const columnId = header.column.id;
                        const isMarket = columnId === "market";
                        const isCollaterals = columnId === "collaterals";
                        const isUtil = columnId === "util";
                        const isActions = columnId === "actions";

                        return (
                          <th
                            key={header.id}
                            className={`label-text-xs pb-2 ${
                              isMarket ? "text-left" :
                              isCollaterals ? "px-3 text-left" :
                              isUtil ? "text-center" :
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
                  {rows.map(row => (
                    <tr
                      key={row.id}
                      className="group"
                    >
                      {row.getVisibleCells().map(cell => {
                        const columnId = cell.column.id;
                        const isMarket = columnId === "market";
                        const isCollaterals = columnId === "collaterals";
                        const isUtil = columnId === "util";
                        const isActions = columnId === "actions";

                        return (
                          <td
                            key={cell.id}
                            className={`group-hover:bg-base-200/30 py-2.5 transition-colors ${
                              isMarket ? "rounded-l-lg pl-3" :
                              isCollaterals ? "px-3" :
                              isUtil ? "text-center" :
                              isActions ? "rounded-r-lg pl-6 pr-3 text-right" :
                              "text-right tabular-nums"
                            }`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </>
      )}

      <TablePagination
        pageIndex={pageIndex}
        pageCount={pageCount}
        onPageChange={handlePageChange}
        canPreviousPage={canPreviousPage}
        canNextPage={canNextPage}
        totalItems={totalItems}
        pageSize={pageSize}
      />

      {selectedVault && depositModalToken && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={handleCloseDepositModal}
          token={depositModalToken}
          protocolName="euler"
          chainId={chainId}
          context={depositModalContext}
        />
      )}
    </Flex>
  );
};
