"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";
import type { FC } from "react";
import Image from "next/image";
import {
  Avatar,
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
} from "@tanstack/react-table";

import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { encodeMorphoContext } from "~~/utils/v2/instructionHelpers";
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { useModal } from "~~/hooks/useModal";
import { DepositModal } from "~~/components/modals/DepositModal";
import { MultiplyEvmModal } from "~~/components/modals/MultiplyEvmModal";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth/notification";
import { parseUnits } from "viem";
import { useExternalYields, hasExternalYield } from "~~/hooks/useExternalYields";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import { createTextChangeHandler } from "~~/utils/handlers";
import {
  toNumberSafe,
  pow10,
  makeUsdFormatter,
  formatPercent,
} from "../utils";

// Static icon sizes to avoid inline objects
const SEARCH_ICON_SIZE = { width: 12, height: 12 };
const ICON_BUTTON_ARIA_LABEL = "Clear search";

interface MorphoMarketsSectionProps {
  markets: MorphoMarket[];
  marketPairs: Map<string, MorphoMarket[]>;
  isLoading: boolean;
  chainId: number;

  /**
   * Optional: wire this to open your supply flow (modal / route / drawer).
   */
  onSupply?: (market: MorphoMarket) => void;

  /**
   * Optional: default 20.
   */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

// Row data type for TanStack Table
interface MarketRow {
  market: MorphoMarket;
  collateralSymbol: string;
  loanSymbol: string;
  liquidityUsd: number;
  supplyUsd: number;
  borrowUsd: number;
  utilization01: number;
  supplyApy01: number;
  borrowApy01: number;
  lltv01: number;
  impliedApy: number | null; // PT implied yield for collateral (as percentage, e.g., 15.5)
  collateralAddress: string;
}

const columnHelper = createColumnHelper<MarketRow>();


function TokenPairAvatars(props: { collateralSymbol?: string; loanSymbol: string }) {
  const collateralSymbol = (props.collateralSymbol ?? "").toLowerCase();
  const loanSymbol = (props.loanSymbol ?? "").toLowerCase();

  const collateralSrc = tokenNameToLogo(collateralSymbol);
  const loanSrc = tokenNameToLogo(loanSymbol);

  return (
    <div className="flex items-center -space-x-1.5">
      <Avatar
        size="1"
        radius="full"
        src={collateralSrc}
        fallback={(props.collateralSymbol ?? "?").slice(0, 2).toUpperCase()}
        className="ring-base-100 ring-2"
      />
      <Avatar 
        size="1" 
        radius="full" 
        src={loanSrc} 
        fallback={props.loanSymbol.slice(0, 2).toUpperCase()} 
        className="ring-base-100 ring-2"
      />
    </div>
  );
}

// Token category definitions for filter tabs
type TokenCategory = "all" | "eth" | "btc" | "stables" | "pt";

const TOKEN_CATEGORIES: Record<TokenCategory, { label: string; patterns: string[] }> = {
  all: { label: "All", patterns: [] },
  eth: { label: "Eth", patterns: ["eth", "weth", "steth", "wsteth", "cbeth", "reth", "weeth", "ezeth", "rseth", "meth", "oeth", "sweth", "sfrxeth", "frxeth", "eeth", "lseth", "bsdeth"] },
  btc: { label: "Btc", patterns: ["btc", "wbtc", "cbbtc", "lbtc", "tbtc", "sbtc", "renbtc", "hbtc"] },
  stables: { label: "Stables", patterns: ["usdc", "usdt", "dai", "usde", "frax", "lusd", "gusd", "tusd", "usdp", "susd", "mim", "eurc", "eur", "cusd", "pyusd", "gho", "dola", "usd", "aprusr", "cusdo"] },
  pt: { label: "PT", patterns: ["pt-"] },
};

function matchesCategory(symbol: string, category: TokenCategory): boolean {
  if (category === "all") {
    return true;
  }
  const lowerSymbol = symbol.toLowerCase();
  return TOKEN_CATEGORIES[category].patterns.some(pattern => lowerSymbol.includes(pattern));
}

// Token Icon component with fixed sizing
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
    <div
      className="bg-base-300 relative flex-shrink-0 overflow-hidden rounded-full"
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
    </div>
  );
}

// Category button component to avoid inline functions
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

// Option button component to avoid inline functions
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
        isSelected
          ? 'bg-primary border-primary'
          : 'border-base-content/30'
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
    if (!isOpen) {
      return;
    }
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

  const displayValue = React.useMemo(() => {
    if (isAllSelected) {
      return allLabel;
    }
    if (value.length === 1) {
      return value[0];
    }
    return `${value.length} selected`;
  }, [isAllSelected, value, allLabel]);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = React.useCallback((option: string) => {
    if (option === "all") {
      onValueChange([]);
    } else {
      if (selectedSet.has(option)) {
        onValueChange(value.filter(v => v !== option));
      } else {
        onValueChange([...value, option]);
      }
    }
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
            onChange={createTextChangeHandler(setSearchTerm)}
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
          {(Object.keys(TOKEN_CATEGORIES) as TokenCategory[]).map(category => (
            <CategoryButton
              key={category}
              category={category}
              isActive={activeCategory === category}
              onClick={setActiveCategory}
            />
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
            {filteredOptions.slice(0, 50).map(option => (
              <OptionButton
                key={option}
                option={option}
                isSelected={selectedSet.has(option)}
                onSelect={handleSelect}
                showIcon
              />
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

// Mobile market row with expandable details
interface MobileMarketRowProps {
  row: {
    market: MorphoMarket;
    collateralSymbol: string;
    loanSymbol: string;
    supplyUsd: number;
    borrowUsd: number;
    utilization01: number;
    supplyApy01: number;
    borrowApy01: number;
    lltv01: number;
    impliedApy: number | null;
  };
  usd: Intl.NumberFormat;
  chainId: number;
  onSupply: () => void;
  onLoop: () => void;
}

// Wrapper component to avoid inline functions when rendering mobile market rows
interface MobileMarketRowItemProps {
  row: MobileMarketRowProps["row"];
  usd: Intl.NumberFormat;
  chainId: number;
  onSupply: (market: MorphoMarket) => void;
  onLoop: (market: MorphoMarket) => void;
}

function MobileMarketRowItem({ row, usd, chainId, onSupply, onLoop }: MobileMarketRowItemProps) {
  const { market } = row;
  const handleSupply = React.useCallback(() => onSupply(market), [market, onSupply]);
  const handleLoop = React.useCallback(() => onLoop(market), [market, onLoop]);

  return (
    <MobileMarketRow
      row={row}
      usd={usd}
      chainId={chainId}
      onSupply={handleSupply}
      onLoop={handleLoop}
    />
  );
}

function MobileMarketRow({ row, usd, chainId, onSupply, onLoop }: MobileMarketRowProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const morphoUrl = getMorphoMarketUrl(chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol);

  const handleToggle = React.useCallback(() => setIsExpanded(prev => !prev), []);
  const handleStopPropagation = React.useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
  const handleSupplyClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSupply();
  }, [onSupply]);
  const handleLoopClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onLoop();
  }, [onLoop]);

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
        {/* Token pair icons + name */}
        <TokenPairAvatars collateralSymbol={row.collateralSymbol} loanSymbol={row.loanSymbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <TokenSymbolDisplay symbol={row.collateralSymbol} size="xs" variant="inline" />
            <span className="text-base-content/50 text-xs">/</span>
            <span className="text-xs font-medium">{row.loanSymbol}</span>
            {morphoUrl && (
              <a
                href={morphoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleStopPropagation}
                className="opacity-40 transition-opacity hover:opacity-80"
              >
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        {/* Stats - always visible */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-base-content/70 font-mono tabular-nums">{usd.format(row.supplyUsd)}</span>
          <span className="text-success font-mono tabular-nums">{formatPercent(row.supplyApy01, 2)}</span>
          <span className="font-mono tabular-nums">{formatPercent(row.borrowApy01, 2)}</span>
        </div>

        {/* Chevron */}
        <ChevronDown className={`text-base-content/40 size-4 transition-transform${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded: action bar */}
      {isExpanded && (
        <div className="flex items-center gap-2 px-3 pb-2 pt-0">
          <div className="text-base-content/50 flex flex-1 items-center gap-3 text-[10px]">
            <span>Util: <span className="text-base-content/70">{formatPercent(row.utilization01, 0)}</span></span>
            <span>LTV: <span className="text-base-content/70">{formatPercent(row.lltv01, 0)}</span></span>
            {row.impliedApy !== null && (
              <span>Implied: <span className="text-info">{formatPercent(row.impliedApy / 100, 2)}</span></span>
            )}
          </div>
          <button
            className="btn btn-xs btn-primary"
            onClick={handleSupplyClick}
          >
            Supply
          </button>
          <button
            className="btn btn-xs btn-ghost"
            onClick={handleLoopClick}
          >
            Loop
          </button>
        </div>
      )}
    </div>
  );
}

export const MorphoMarketsSection: FC<MorphoMarketsSectionProps> = ({
  markets,
  // marketPairs is part of the interface but currently unused (reserved for future use)
  isLoading,
  chainId,
  onSupply,
  pageSize = DEFAULT_PAGE_SIZE,
}) => {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "supplyUsd", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [selectedCollaterals, setSelectedCollaterals] = React.useState<string[]>([]);
  const [selectedDebtAssets, setSelectedDebtAssets] = React.useState<string[]>([]);
  const deferredGlobalFilter = React.useDeferredValue(globalFilter);

  const usd = React.useMemo(() => makeUsdFormatter(), []);

  const depositModal = useModal();
  const loopModal = useModal();
  const [selectedMarket, setSelectedMarket] = React.useState<MorphoMarket | null>(null);
  const [loopMarket, setLoopMarket] = React.useState<MorphoMarket | null>(null);
  const { address: walletAddress, chainId: walletChainId } = useAccount();

  // Fetch external yields (Pendle PT tokens, Maple syrup tokens, etc.)
  const { findYield } = useExternalYields(chainId);

  // Memoize filter sets for performance
  const collateralFilterSet = React.useMemo(() => new Set(selectedCollaterals), [selectedCollaterals]);
  const debtFilterSet = React.useMemo(() => new Set(selectedDebtAssets), [selectedDebtAssets]);

  // Transform markets to row data
  const data = React.useMemo<MarketRow[]>(() => {
    return markets
      .filter(m => Boolean(m.collateralAsset))
      .filter(m => {
        // Collateral filter - empty array means all
        if (collateralFilterSet.size > 0 && !collateralFilterSet.has(m.collateralAsset?.symbol ?? "")) {
          return false;
        }
        // Debt filter - empty array means all
        if (debtFilterSet.size > 0 && !debtFilterSet.has(m.loanAsset?.symbol ?? "")) {
          return false;
        }
        return true;
      })
      .map(m => {
        const loanDecimals = toNumberSafe(m.loanAsset?.decimals);
        const loanPriceUsd = toNumberSafe(m.loanAsset?.priceUsd);

        const supplyAssetsUsd = toNumberSafe(m.state?.supplyAssetsUsd);
        const borrowAssetsUsd = toNumberSafe(m.state?.borrowAssetsUsd);
        const liquidityAssetsUsd = toNumberSafe(m.state?.liquidityAssetsUsd);

        const supplyAssetsRaw = toNumberSafe(m.state?.supplyAssets);
        const borrowAssetsRaw = toNumberSafe(m.state?.borrowAssets);
        const liquidityAssetsRaw = toNumberSafe(m.state?.liquidityAssets ?? m.state?.supplyAssets);
        const denom = pow10(loanDecimals);

        const supplyUsd = supplyAssetsUsd > 0
          ? supplyAssetsUsd
          : (denom > 0 ? (supplyAssetsRaw / denom) * loanPriceUsd : 0);
        const borrowUsd = borrowAssetsUsd > 0
          ? borrowAssetsUsd
          : (denom > 0 ? (borrowAssetsRaw / denom) * loanPriceUsd : 0);
        const liquidityUsd = liquidityAssetsUsd > 0
          ? liquidityAssetsUsd
          : (denom > 0 ? (liquidityAssetsRaw / denom) * loanPriceUsd : 0);

        // Look up external yield for collateral token (PT tokens, syrupUSDC, etc.)
        const collateralSymbol = m.collateralAsset?.symbol ?? "";
        const collateralAddress = (m.collateralAsset?.address ?? "").toLowerCase();
        let impliedApy: number | null = null;

        if (hasExternalYield(collateralSymbol)) {
          const externalYield = findYield(collateralAddress, collateralSymbol);
          if (externalYield) {
            impliedApy = externalYield.fixedApy;
          }
        }
        // Note: impliedApy is intentionally mutable because it's conditionally assigned above

        return {
          market: m,
          collateralSymbol,
          loanSymbol: m.loanAsset?.symbol ?? "",
          collateralAddress,
          liquidityUsd,
          supplyUsd,
          borrowUsd,
          utilization01: toNumberSafe(m.state?.utilization),
          supplyApy01: toNumberSafe(m.state?.supplyApy),
          borrowApy01: toNumberSafe(m.state?.borrowApy),
          lltv01: toNumberSafe(m.lltv) / 1e18,
          impliedApy,
        };
      });
  }, [markets, collateralFilterSet, debtFilterSet, findYield]);

  // Extract unique collateral and debt assets from markets
  const { collateralAssets, debtAssets } = React.useMemo(() => {
    const collateralSet = new Set<string>();
    const debtSet = new Set<string>();
    markets.forEach(m => {
      if (m.collateralAsset?.symbol) {
        collateralSet.add(m.collateralAsset.symbol);
      }
      if (m.loanAsset?.symbol) {
        debtSet.add(m.loanAsset.symbol);
      }
    });
    return {
      collateralAssets: Array.from(collateralSet).sort(),
      debtAssets: Array.from(debtSet).sort(),
    };
  }, [markets]);

  // Column definitions
  const columns = React.useMemo(() => [
    columnHelper.accessor("market", {
      id: "market",
      header: "Market",
      enableSorting: false,
      cell: info => {
        const row = info.row.original;
        const morphoUrl = getMorphoMarketUrl(chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol);
        return (
          <div className="flex items-center gap-2">
            <TokenPairAvatars collateralSymbol={row.collateralSymbol} loanSymbol={row.loanSymbol} />
            <div className="flex flex-col">
              {morphoUrl ? (
                <a
                  href={morphoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary group/link flex items-center gap-1 transition-colors"
                >
                  <TokenSymbolDisplay symbol={row.collateralSymbol} size="sm" variant="inline" />
                  <span className="text-base-content/50">/</span>
                  <span className="font-medium">{row.loanSymbol}</span>
                  <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/link:opacity-60" />
                </a>
              ) : (
                <span className="flex items-center gap-1">
                  <TokenSymbolDisplay symbol={row.collateralSymbol} size="sm" variant="inline" />
                  <span className="text-base-content/50">/</span>
                  <span className="font-medium">{row.loanSymbol}</span>
                </span>
              )}
              <span className="text-base-content/50 text-[10px]">LLTV {formatPercent(row.lltv01, 0)}</span>
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("supplyUsd", {
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
    columnHelper.accessor("impliedApy", {
      id: "implied",
      header: () => (
        <Tooltip content="Implied APY for PT collateral tokens (Pendle fixed yield)">
          <span className="cursor-help border-b border-dashed border-current">Implied</span>
        </Tooltip>
      ),
      cell: info => {
        const value = info.getValue();
        if (value === null) {
          return <span className="text-base-content/30">—</span>;
        }
        return <span className="text-info">{formatPercent(value / 100, 2)}</span>;
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.impliedApy ?? -Infinity;
        const b = rowB.original.impliedApy ?? -Infinity;
        return a - b;
      },
    }),
    columnHelper.accessor("supplyApy01", {
      header: "Earn",
      cell: info => <span className="text-success">{formatPercent(info.getValue(), 2)}</span>,
      sortingFn: "basic",
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
        <Flex gap="6" align="center" justify="end" className="ml-6">
          <button
            onClick={() => handleSupplyClick(info.row.original.market)}
            className="text-sm font-medium text-base-content hover:text-primary transition-colors"
          >
            Supply
          </button>
          <button
            onClick={() => handleLoopClick(info.row.original.market)}
            className="text-sm font-medium text-base-content hover:text-primary transition-colors"
          >
            Loop
          </button>
        </Flex>
      ),
    }),
  ], [chainId, usd]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: deferredGlobalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue) {
        return true;
      }
      const r = row.original;
      const searchable = `${r.collateralSymbol}/${r.loanSymbol} ${r.collateralSymbol} ${r.loanSymbol} ${r.market.uniqueKey}`.toLowerCase();
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
    setSorting([{ id: "supplyUsd", desc: true }]);
    setSelectedCollaterals([]);
    setSelectedDebtAssets([]);
  }, []);

  const handleSupplyClick = React.useCallback(
    (m: MorphoMarket) => {
      if (onSupply) {
        onSupply(m);
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
      setSelectedMarket(m);
      depositModal.open();
    },
    [onSupply, depositModal, walletAddress, walletChainId, chainId]
  );

  const handleLoopClick = React.useCallback(
    (m: MorphoMarket) => {
      if (!walletAddress) {
        notification.error("Please connect your wallet to create a loop");
        return;
      }
      if (walletChainId !== chainId) {
        notification.error(`Please switch to chain ID ${chainId} to create a loop`);
        return;
      }
      setLoopMarket(m);
      loopModal.open();
    },
    [loopModal, walletAddress, walletChainId, chainId]
  );

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
  }, [globalFilter, selectedCollaterals, selectedDebtAssets]);

  const handleCloseDepositModal = React.useCallback(() => {
    depositModal.close();
    setSelectedMarket(null);
  }, [depositModal]);

  const handleCloseLoopModal = React.useCallback(() => {
    loopModal.close();
    setLoopMarket(null);
  }, [loopModal]);

  // Memoized props for DepositModal
  const depositModalToken = React.useMemo(() => {
    if (!selectedMarket) {
      return null;
    }
    return {
      name: selectedMarket.collateralAsset?.symbol ?? "",
      icon: tokenNameToLogo(selectedMarket.collateralAsset?.symbol ?? ""),
      address: selectedMarket.collateralAsset?.address ?? "",
      currentRate: 0,
      usdPrice: selectedMarket.collateralAsset?.priceUsd ?? undefined,
      decimals: selectedMarket.collateralAsset?.decimals,
    };
  }, [selectedMarket]);

  const depositModalContext = React.useMemo(() => {
    if (!selectedMarket) {
      return "";
    }
    return encodeMorphoContext({
      marketId: selectedMarket.uniqueKey,
      loanToken: selectedMarket.loanAsset.address,
      collateralToken: selectedMarket.collateralAsset?.address || "",
      oracle: selectedMarket.oracle?.address || "",
      irm: selectedMarket.irmAddress,
      lltv: BigInt(selectedMarket.lltv),
    });
  }, [selectedMarket]);

  // Memoized props for MultiplyEvmModal
  const loopModalCollaterals = React.useMemo(() => {
    if (!loopMarket?.collateralAsset) {
      return [];
    }
    return [{
      symbol: loopMarket.collateralAsset.symbol,
      address: loopMarket.collateralAsset.address as `0x${string}`,
      decimals: loopMarket.collateralAsset.decimals,
      icon: tokenNameToLogo(loopMarket.collateralAsset.symbol),
      rawBalance: 0n,
      balance: 0,
      price: loopMarket.collateralAsset.priceUsd
        ? parseUnits(loopMarket.collateralAsset.priceUsd.toFixed(8), 8)
        : 0n,
    }];
  }, [loopMarket]);

  const loopModalDebtOptions = React.useMemo(() => {
    if (!loopMarket) {
      return [];
    }
    return [{
      symbol: loopMarket.loanAsset.symbol,
      address: loopMarket.loanAsset.address as `0x${string}`,
      decimals: loopMarket.loanAsset.decimals,
      icon: tokenNameToLogo(loopMarket.loanAsset.symbol),
      rawBalance: 0n,
      balance: 0,
      price: loopMarket.loanAsset.priceUsd
        ? parseUnits(loopMarket.loanAsset.priceUsd.toFixed(8), 8)
        : 0n,
    }];
  }, [loopMarket]);

  const loopModalMorphoContext = React.useMemo(() => {
    if (!loopMarket?.collateralAsset) {
      return null;
    }
    return {
      marketId: loopMarket.uniqueKey,
      loanToken: loopMarket.loanAsset.address,
      collateralToken: loopMarket.collateralAsset.address,
      oracle: loopMarket.oracle?.address || "",
      irm: loopMarket.irmAddress,
      lltv: BigInt(loopMarket.lltv),
    };
  }, [loopMarket]);

  const loopModalMaxLtvBps = React.useMemo(() => {
    if (!loopMarket) {
      return 0n;
    }
    return BigInt(Math.floor(toNumberSafe(loopMarket.lltv) / 1e14));
  }, [loopMarket]);

  const loopModalSupplyApyMap = React.useMemo(() => {
    if (!loopMarket?.collateralAsset) {
      return {};
    }
    const collateralAddr = loopMarket.collateralAsset.address.toLowerCase();
    let apy = 0;
    if (hasExternalYield(loopMarket.collateralAsset.symbol)) {
      const externalYield = findYield(collateralAddr, loopMarket.collateralAsset.symbol);
      if (externalYield) {
        apy = externalYield.fixedApy;
      }
    }
    return { [collateralAddr]: apy };
  }, [loopMarket, findYield]);

  const loopModalBorrowApyMap = React.useMemo(() => {
    if (!loopMarket) {
      return {};
    }
    return { [loopMarket.loanAsset.address.toLowerCase()]: toNumberSafe(loopMarket.state?.borrowApy) * 100 };
  }, [loopMarket]);

  if (isLoading) {
    return (
      <Card size="2">
        <Flex align="center" justify="center" py="6">
          <Spinner size="3" />
        </Flex>
      </Card>
    );
  }

  if (markets.length === 0) {
    return (
      <Card size="2">
        <Flex direction="column" gap="2">
          <Text weight="bold">No markets available</Text>
          <Text color="gray">No markets were returned for this chain (chainId: {chainId}).</Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {/* Filter bar - responsive */}
      <Flex align="center" gap="2" wrap="wrap" className="px-1">
        <Box className="w-full sm:w-auto sm:min-w-[200px] sm:max-w-[280px]">
          <TextField.Root
            size="1"
            variant="surface"
            placeholder="Search..."
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

        <SearchableSelect
          options={collateralAssets}
          value={selectedCollaterals}
          onValueChange={setSelectedCollaterals}
          placeholder="Collateral"
          allLabel="All Collaterals"
        />

        <SearchableSelect
          options={debtAssets}
          value={selectedDebtAssets}
          onValueChange={setSelectedDebtAssets}
          placeholder="Debt"
          allLabel="All Debt"
        />

        <div className="flex-1" />

        <Text size="1" color="gray" className="tabular-nums">
          {rows.length} markets
        </Text>
      </Flex>

      {rows.length === 0 ? (
        <Card size="2">
          <Flex direction="column" gap="2" p="4">
            <Text weight="bold">No matches</Text>
            <Text color="gray" size="2">
              Try a different symbol or clear the search filter.
            </Text>
            <Flex gap="2">
              <Button variant="soft" onClick={handleClearSearch} disabled={!globalFilter}>
                Clear search
              </Button>
              <Button
                variant="outline"
                onClick={handleResetAll}
              >
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
              <MobileMarketRowItem
                key={row.original.market.uniqueKey}
                row={row.original}
                usd={usd}
                chainId={chainId}
                onSupply={handleSupplyClick}
                onLoop={handleLoopClick}
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
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          className={`label-text-xs pb-2 ${
                            header.id === "market" ? "text-left" :
                            header.id === "util" ? "text-center" :
                            header.id === "actions" ? "" :
                            "text-right"
                          } ${header.column.getCanSort() ? "hover:text-base-content/60 cursor-pointer transition-colors" : ""}`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className={`inline-flex items-center gap-1 ${header.column.getIsSorted() ? "text-primary" : ""}`}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "desc" && <ChevronDown className="size-3" />}
                            {header.column.getIsSorted() === "asc" && <ChevronUp className="size-3" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr
                      key={row.id}
                      className="group"
                    >
                      {row.getVisibleCells().map((cell, idx, cells) => {
                        const isFirst = idx === 0;
                        const isLast = idx === cells.length - 1;

                        return (
                          <td
                            key={cell.id}
                            className={`group-hover:bg-base-200/30 py-2.5 transition-colors ${
                              cell.column.id === "market" ? "pl-3" :
                              cell.column.id === "util" ? "text-center" :
                              cell.column.id === "actions" ? "pr-3" :
                              "text-right tabular-nums"
                            } ${isFirst ? "rounded-l-lg" : ""} ${isLast ? "rounded-r-lg" : ""}`}
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

      {selectedMarket && depositModalToken && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={handleCloseDepositModal}
          token={depositModalToken}
          protocolName="morpho-blue"
          chainId={chainId}
          context={depositModalContext}
        />
      )}

      {loopMarket && loopMarket.collateralAsset && loopModalMorphoContext && (
        <MultiplyEvmModal
          isOpen={loopModal.isOpen}
          onClose={handleCloseLoopModal}
          protocolName="morpho-blue"
          chainId={chainId}
          collaterals={loopModalCollaterals}
          debtOptions={loopModalDebtOptions}
          morphoContext={loopModalMorphoContext}
          maxLtvBps={loopModalMaxLtvBps}
          lltvBps={loopModalMaxLtvBps}
          supplyApyMap={loopModalSupplyApyMap}
          borrowApyMap={loopModalBorrowApyMap}
          disableAssetSelection={true}
        />
      )}
    </Flex>
  );
};
