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
  Inset,
  ScrollArea,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { Search, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

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
import { usePendlePTYields, isPTToken } from "~~/hooks/usePendlePTYields";
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

type SortKey = "tvl" | "supplyApy" | "borrowApy" | "utilization";
type SortDirection = "desc" | "asc";

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

// Minimal utilization indicator - just bar, no text
function UtilizationBar({ value }: { value: number }) {
  const percent = Math.min(100, Math.max(0, value * 100));
  const color = value >= 0.95 ? "bg-error" : value >= 0.85 ? "bg-warning" : "bg-primary/70";
  const barStyle = React.useMemo(() => ({ width: `${percent}%` }), [percent]);

  return (
    <Tooltip content={`${percent.toFixed(1)}% utilized`}>
      <div className="bg-base-content/10 mx-auto h-1.5 w-14 overflow-hidden rounded-full">
        <div
          className={`h-full ${color} rounded-full`}
          style={barStyle}
        />
      </div>
    </Tooltip>
  );
}

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
  if (category === "all") return true;
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
      className={`btn btn-xs ${isActive ? 'btn-primary' : 'btn-ghost'}`}
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
      <div className={`flex size-4 flex-shrink-0 items-center justify-center rounded border-2${
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

// Searchable Select Component with token icons and category tabs (uses portal to avoid clipping)
interface SearchableSelectProps {
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
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

  // Memoized handlers to avoid inline functions
  const handleClearSearchTerm = React.useCallback(() => setSearchTerm(""), []);
  const handleToggleOpen = React.useCallback(() => setIsOpen(prev => !prev), []);
  const handleStopPropagation = React.useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  // Calculate dropdown position
  const updatePosition = React.useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, []);

  // Update position when opening and on scroll/resize
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

  // Close dropdown on outside click
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

  // Filter options based on search term and category
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

  // Get display value
  const displayValue = value === "all" ? allLabel : value;

  // Focus input when opened
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = React.useCallback((option: string) => {
    onValueChange(option);
    setIsOpen(false);
    setSearchTerm("");
    setActiveCategory("all");
  }, [onValueChange]);

  const handleClear = React.useCallback(() => {
    onValueChange("all");
    setSearchTerm("");
    setActiveCategory("all");
  }, [onValueChange]);

  // Memoized style for dropdown position
  const dropdownStyle = React.useMemo(
    () => position ? { top: position.top, left: position.left } : undefined,
    [position]
  );

  // Dropdown content (rendered via portal)
  const dropdownContent = isOpen && position && typeof document !== "undefined" ? (
    <div
      ref={dropdownRef}
      className="bg-base-100 border-base-300 fixed z-[9999] w-80 rounded-xl border shadow-2xl"
      style={dropdownStyle}
      onClick={handleStopPropagation}
    >
      {/* Search Input */}
      <div className="border-base-300 border-b p-3">
        <div className="relative">
          <Search className="text-base-content/50 absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search for ${placeholder.toLowerCase()} asset`}
            value={searchTerm}
            onChange={createTextChangeHandler(setSearchTerm)}
            className="input input-sm input-bordered bg-base-200/50 w-full pl-9 pr-8"
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

      {/* Category Tabs */}
      <div className="border-base-300 border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(TOKEN_CATEGORIES) as TokenCategory[]).map(category => (
            <CategoryButton
              key={category}
              category={category}
              isActive={activeCategory === category}
              onClick={setActiveCategory}
            />
          ))}
          <div className="flex-1" />
          <button
            onClick={handleClear}
            className="btn btn-xs btn-ghost text-base-content/60"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Options List */}
      <div className="max-h-72 overflow-y-auto p-2">
        {/* All Option */}
        <OptionButton
          option="all"
          isSelected={value === "all"}
          onSelect={handleSelect}
          displayLabel={allLabel}
        />

        {/* Token Options */}
        {filteredOptions.length === 0 ? (
          <div className="text-base-content/50 py-8 text-center text-sm">
            No matches found
          </div>
        ) : (
          filteredOptions.map(option => (
            <OptionButton
              key={option}
              option={option}
              isSelected={value === option}
              onSelect={handleSelect}
              showIcon
            />
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-sm btn-ghost border-base-300 hover:border-base-content/30 min-w-[140px] justify-between gap-2 border font-normal"
        onClick={handleToggleOpen}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {value !== "all" && <TokenIcon symbol={value} size={18} />}
          <span className="truncate text-sm">{displayValue}</span>
        </div>
        <ChevronDown 
          className={`size-4 flex-shrink-0 opacity-60 transition-transform${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Portal dropdown to body to avoid clipping */}
      {typeof document !== "undefined" && ReactDOM.createPortal(dropdownContent, document.body)}
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
  };
  pairName: string;
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
  const pairName = `${row.collateralSymbol}/${row.loanSymbol}`;
  const handleSupply = React.useCallback(() => onSupply(market), [market, onSupply]);
  const handleLoop = React.useCallback(() => onLoop(market), [market, onLoop]);

  return (
    <MobileMarketRow
      row={row}
      pairName={pairName}
      usd={usd}
      chainId={chainId}
      onSupply={handleSupply}
      onLoop={handleLoop}
    />
  );
}

// Desktop market row component to avoid inline functions
interface DesktopMarketRowProps {
  row: MobileMarketRowItemProps["row"];
  usd: Intl.NumberFormat;
  chainId: number;
  onSupply: (market: MorphoMarket) => void;
  onLoop: (market: MorphoMarket) => void;
}

function DesktopMarketRow({ row, usd, chainId, onSupply, onLoop }: DesktopMarketRowProps) {
  const { market } = row;
  const morphoUrl = getMorphoMarketUrl(chainId, market.uniqueKey, row.collateralSymbol, row.loanSymbol);
  const handleSupply = React.useCallback(() => onSupply(market), [market, onSupply]);
  const handleLoop = React.useCallback(() => onLoop(market), [market, onLoop]);

  return (
    <tr className="border-base-300/50 hover:bg-base-200/30 border-b transition-colors">
      <td className="py-2.5 pl-3">
        <div className="flex items-center gap-2">
          <TokenPairAvatars collateralSymbol={row.collateralSymbol} loanSymbol={row.loanSymbol} />
          {morphoUrl ? (
            <a
              href={morphoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary group/link flex items-center gap-1 font-medium transition-colors"
            >
              {row.collateralSymbol}/{row.loanSymbol}
              <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/link:opacity-60" />
            </a>
          ) : (
            <span className="font-medium">{row.collateralSymbol}/{row.loanSymbol}</span>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {usd.format(row.supplyUsd)}
      </td>
      <td className="py-2.5 text-center">
        <UtilizationBar value={row.utilization01} />
      </td>
      <td className="text-success py-2.5 pr-4 text-right tabular-nums">
        {formatPercent(row.supplyApy01, 2)}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {formatPercent(row.borrowApy01, 2)}
      </td>
      <td className="py-2.5 pr-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <Button size="1" variant="soft" onClick={handleSupply}>
            Supply
          </Button>
          <Button size="1" variant="outline" onClick={handleLoop}>
            Loop
          </Button>
        </div>
      </td>
    </tr>
  );
}

function MobileMarketRow({ row, pairName, usd, chainId, onSupply, onLoop }: MobileMarketRowProps) {
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
            <span className="truncate text-sm font-medium" title={pairName}>{pairName}</span>
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
  const [sortKey, setSortKey] = React.useState<SortKey>("tvl");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  
  const handleSort = React.useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }, [sortKey]);
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [visibleCount, setVisibleCount] = React.useState(pageSize);
  const [selectedCollateral, setSelectedCollateral] = React.useState<string>("all");
  const [selectedDebtAsset, setSelectedDebtAsset] = React.useState<string>("all");

  const usd = React.useMemo(() => makeUsdFormatter(), []);

  // Memoized handlers to avoid inline functions in JSX
  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.currentTarget.value),
    []
  );
  const handleClearSearch = React.useCallback(() => setSearch(""), []);
  const handleResetAll = React.useCallback(() => {
    setSearch("");
    setSortKey("tvl");
    setSortDirection("desc");
    setSelectedCollateral("all");
    setSelectedDebtAsset("all");
  }, []);
  const handleShowMore = React.useCallback(
    () => setVisibleCount(v => v + pageSize),
    [pageSize]
  );
  const handleSortTvl = React.useCallback(() => handleSort("tvl"), [handleSort]);
  const handleSortSupplyApy = React.useCallback(() => handleSort("supplyApy"), [handleSort]);
  const handleSortBorrowApy = React.useCallback(() => handleSort("borrowApy"), [handleSort]);

  const depositModal = useModal();
  const loopModal = useModal();
  const [selectedMarket, setSelectedMarket] = React.useState<MorphoMarket | null>(null);
  const [loopMarket, setLoopMarket] = React.useState<MorphoMarket | null>(null);
  const { address: walletAddress, chainId: walletChainId } = useAccount();

  // Fetch Pendle PT yields for PT tokens
  const { yieldsByAddress, yieldsBySymbol } = usePendlePTYields(chainId);

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

  const resetPaging = React.useCallback(() => setVisibleCount(pageSize), [pageSize]);

  React.useEffect(() => {
    resetPaging();
  }, [deferredSearch, sortKey, sortDirection, selectedCollateral, selectedDebtAsset, resetPaging]);

  const rows = React.useMemo(() => {
    const searchValue = deferredSearch.trim().toLowerCase();

    const candidates = markets
      .filter(m => Boolean(m.collateralAsset)) // only pairs (as in your original)
      .filter(m => {
        // Filter by selected collateral asset
        if (selectedCollateral !== "all") {
          if (m.collateralAsset?.symbol !== selectedCollateral) return false;
        }
        // Filter by selected debt asset
        if (selectedDebtAsset !== "all") {
          if (m.loanAsset?.symbol !== selectedDebtAsset) return false;
        }
        return true;
      })
      .map(m => {
        const loanDecimals = toNumberSafe(m.loanAsset?.decimals);
        const loanPriceUsd = toNumberSafe(m.loanAsset?.priceUsd);

        // Prefer USD values directly from API if available (more accurate)
        const supplyAssetsUsd = toNumberSafe(m.state?.supplyAssetsUsd);
        const borrowAssetsUsd = toNumberSafe(m.state?.borrowAssetsUsd);
        const liquidityAssetsUsd = toNumberSafe(m.state?.liquidityAssetsUsd);

        // Fallback to calculating from raw assets if USD values not available
        const supplyAssetsRaw = toNumberSafe(m.state?.supplyAssets);
        const borrowAssetsRaw = toNumberSafe(m.state?.borrowAssets);
        const liquidityAssetsRaw = toNumberSafe(m.state?.liquidityAssets ?? m.state?.supplyAssets);
        const denom = pow10(loanDecimals);

        // Use API USD values if available, otherwise calculate
        const supplyUsd = supplyAssetsUsd > 0 
          ? supplyAssetsUsd 
          : (denom > 0 ? (supplyAssetsRaw / denom) * loanPriceUsd : 0);
        const borrowUsd = borrowAssetsUsd > 0
          ? borrowAssetsUsd
          : (denom > 0 ? (borrowAssetsRaw / denom) * loanPriceUsd : 0);
        const liquidityUsd = liquidityAssetsUsd > 0
          ? liquidityAssetsUsd
          : (denom > 0 ? (liquidityAssetsRaw / denom) * loanPriceUsd : 0);

        const utilization01 = toNumberSafe(m.state?.utilization);
        const supplyApy01 = toNumberSafe(m.state?.supplyApy);
        const borrowApy01 = toNumberSafe(m.state?.borrowApy);

        const lltv01 = toNumberSafe(m.lltv) / 1e18;

        const collateralSymbol = m.collateralAsset?.symbol ?? "";
        const loanSymbol = m.loanAsset?.symbol ?? "";

        const searchable = `${collateralSymbol}/${loanSymbol} ${collateralSymbol} ${loanSymbol} ${m.uniqueKey}`.toLowerCase();

        return {
          market: m,
          collateralSymbol,
          loanSymbol,
          liquidityUsd,
          supplyUsd,
          borrowUsd,
          utilization01,
          supplyApy01,
          borrowApy01,
          lltv01,
          searchable,
        };
      })
      .filter(r => (searchValue ? r.searchable.includes(searchValue) : true));

    const sorted = [...candidates].sort((a, b) => {
      let delta = 0;

      switch (sortKey) {
        case "tvl":
          delta = a.supplyUsd - b.supplyUsd;
          break;
        case "supplyApy":
          delta = a.supplyApy01 - b.supplyApy01;
          break;
        case "borrowApy":
          delta = a.borrowApy01 - b.borrowApy01;
          break;
        case "utilization":
          delta = a.utilization01 - b.utilization01;
          break;
        default:
          delta = 0;
      }

      return sortDirection === "asc" ? delta : -delta;
    });

    return sorted;
  }, [markets, deferredSearch, sortKey, sortDirection, selectedCollateral, selectedDebtAsset]);

  const handleSupply = React.useCallback(
    (m: MorphoMarket) => {
      if (onSupply) {
        onSupply(m);
        return;
      }
      
      // Check if wallet is connected
      if (!walletAddress) {
        notification.error("Please connect your wallet to deposit");
        return;
      }
      
      // Check if wallet is on the correct chain
      if (walletChainId !== chainId) {
        notification.error(`Please switch to chain ID ${chainId} to deposit`);
        return;
      }
      
      setSelectedMarket(m);
      depositModal.open();
    },
    [onSupply, depositModal, walletAddress, walletChainId, chainId]
  );

  const handleLoop = React.useCallback(
    (m: MorphoMarket) => {
      // Check if wallet is connected
      if (!walletAddress) {
        notification.error("Please connect your wallet to create a loop");
        return;
      }
      
      // Check if wallet is on the correct chain
      if (walletChainId !== chainId) {
        notification.error(`Please switch to chain ID ${chainId} to create a loop`);
        return;
      }
      
      setLoopMarket(m);
      loopModal.open();
    },
    [loopModal, walletAddress, walletChainId, chainId]
  );

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
    if (!selectedMarket) return null;
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
    if (!selectedMarket) return "";
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
    if (!loopMarket?.collateralAsset) return [];
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
    if (!loopMarket) return [];
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
    if (!loopMarket?.collateralAsset) return null;
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
    if (!loopMarket) return 0n;
    return BigInt(Math.floor(toNumberSafe(loopMarket.lltv) / 1e14));
  }, [loopMarket]);

  const loopModalSupplyApyMap = React.useMemo(() => {
    if (!loopMarket?.collateralAsset) return {};
    const collateralAddr = loopMarket.collateralAsset.address.toLowerCase();
    let apy = 0;
    if (isPTToken(loopMarket.collateralAsset.symbol)) {
      const ptYield = yieldsByAddress.get(collateralAddr) || yieldsBySymbol.get(loopMarket.collateralAsset.symbol.toLowerCase());
      if (ptYield) apy = ptYield.fixedApy;
    }
    return { [collateralAddr]: apy };
  }, [loopMarket, yieldsByAddress, yieldsBySymbol]);

  const loopModalBorrowApyMap = React.useMemo(() => {
    if (!loopMarket) return {};
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
            value={search}
            onChange={handleSearchChange}
          >
            <TextField.Slot>
              <Search {...SEARCH_ICON_SIZE} />
            </TextField.Slot>

            {search ? (
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
          value={selectedCollateral}
          onValueChange={setSelectedCollateral}
          placeholder="Collateral"
          allLabel="All Collaterals"
        />

        <SearchableSelect
          options={debtAssets}
          value={selectedDebtAsset}
          onValueChange={setSelectedDebtAsset}
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
              <Button variant="soft" onClick={handleClearSearch} disabled={!search}>
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
            {rows.slice(0, visibleCount).map(r => (
              <MobileMarketRowItem
                key={r.market.uniqueKey}
                row={r}
                usd={usd}
                chainId={chainId}
                onSupply={handleSupply}
                onLoop={handleLoop}
              />
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block">
          <Card size="2">
            <Inset side="x" my="3">
              <ScrollArea scrollbars="horizontal" type="auto">
                <Box px="3" pb="3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-base-content/70 border-base-300 border-b text-xs">
                        <th className="py-2.5 pl-3 text-left font-medium">Market</th>
                        <th className="hover:text-base-content cursor-pointer py-2.5 pr-4 text-right font-medium" onClick={handleSortTvl}>
                          <span className={`inline-flex items-center gap-0.5 ${sortKey === "tvl" ? "text-primary" : ""}`}>
                            TVL {sortKey === "tvl" && (sortDirection === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />)}
                          </span>
                        </th>
                        <th className="w-16 py-2.5 text-center font-medium">Util</th>
                        <th className="hover:text-base-content cursor-pointer py-2.5 pr-4 text-right font-medium" onClick={handleSortSupplyApy}>
                          <span className={`inline-flex items-center gap-0.5 ${sortKey === "supplyApy" ? "text-primary" : ""}`}>
                            Earn {sortKey === "supplyApy" && (sortDirection === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />)}
                          </span>
                        </th>
                        <th className="hover:text-base-content cursor-pointer py-2.5 pr-4 text-right font-medium" onClick={handleSortBorrowApy}>
                          <span className={`inline-flex items-center gap-0.5 ${sortKey === "borrowApy" ? "text-primary" : ""}`}>
                            Borrow {sortKey === "borrowApy" && (sortDirection === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />)}
                          </span>
                        </th>
                        <th className="w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, visibleCount).map(r => (
                        <DesktopMarketRow
                          key={r.market.uniqueKey}
                          row={r}
                          usd={usd}
                          chainId={chainId}
                          onSupply={handleSupply}
                          onLoop={handleLoop}
                        />
                      ))}
                    </tbody>
                  </table>
                </Box>
              </ScrollArea>
            </Inset>
          </Card>
          </div>
        </>
      )}

      {rows.length > visibleCount && (
        <Flex align="center" justify="center" py="2">
          <Button variant="soft" onClick={handleShowMore}>
            Show more
          </Button>
        </Flex>
      )}

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
