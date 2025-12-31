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
import { encodeMorphoContext, MorphoMarketContextForEncoding } from "~~/utils/v2/instructionHelpers";
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { useModal } from "~~/hooks/useModal";
import { DepositModal } from "~~/components/modals/DepositModal";
import { MultiplyEvmModal } from "~~/components/modals/MultiplyEvmModal";
import { SwapAsset } from "~~/components/modals/SwapModalShell";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth/notification";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { parseUnits } from "viem";
import { usePendlePTYields, isPTToken } from "~~/hooks/usePendlePTYields";

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

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pow10(decimals: number): number {
  // decimals are typically <= 18; safe for JS numbers in this context.
  return 10 ** Math.max(0, Math.min(36, decimals));
}

function utilizationColor(utilization: number): string {
  if (utilization >= 0.95) return "text-error";
  if (utilization >= 0.85) return "text-warning";
  return "text-base-content/70";
}

// Minimal utilization indicator - just bar, no text
function UtilizationBar({ value }: { value: number }) {
  const percent = Math.min(100, Math.max(0, value * 100));
  const color = value >= 0.95 ? "bg-error" : value >= 0.85 ? "bg-warning" : "bg-primary/70";
  
  return (
    <Tooltip content={`${percent.toFixed(1)}% utilized`}>
      <div className="w-14 h-1.5 bg-base-content/10 rounded-full overflow-hidden mx-auto">
        <div 
          className={`h-full ${color} rounded-full`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </Tooltip>
  );
}

function makeUsdFormatter() {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value01: number, digits: number): string {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return fmt.format(value01);
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
        className="ring-2 ring-base-100"
      />
      <Avatar 
        size="1" 
        radius="full" 
        src={loanSrc} 
        fallback={props.loanSymbol.slice(0, 2).toUpperCase()} 
        className="ring-2 ring-base-100"
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
  return (
    <div 
      className="relative rounded-full overflow-hidden bg-base-300 flex-shrink-0"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      <Image
        src={src}
        alt={symbol}
        width={size}
        height={size}
        className="object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
      <span 
        className="absolute inset-0 flex items-center justify-center text-xs font-medium text-base-content/70"
        style={{ fontSize: size * 0.4 }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
    </div>
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

  const handleSelect = (option: string) => {
    onValueChange(option);
    setIsOpen(false);
    setSearchTerm("");
    setActiveCategory("all");
  };

  const handleClear = () => {
    onValueChange("all");
    setSearchTerm("");
    setActiveCategory("all");
  };

  // Dropdown content (rendered via portal)
  const dropdownContent = isOpen && position && typeof document !== "undefined" ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-base-100 border border-base-300 rounded-xl shadow-2xl w-80"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Input */}
      <div className="p-3 border-b border-base-300">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            ref={inputRef}
            type="text"
            placeholder={`Search for ${placeholder.toLowerCase()} asset`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input input-sm input-bordered w-full pl-9 pr-8 bg-base-200/50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-3 py-2 border-b border-base-300">
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(TOKEN_CATEGORIES) as TokenCategory[]).map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`btn btn-xs ${
                activeCategory === category 
                  ? 'btn-primary' 
                  : 'btn-ghost'
              }`}
            >
              {TOKEN_CATEGORIES[category].label}
            </button>
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
        <button
          onClick={() => handleSelect("all")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
            value === "all" ? 'bg-primary/10' : 'hover:bg-base-200'
          }`}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
            value === "all" 
              ? 'bg-primary border-primary' 
              : 'border-base-content/30'
          }`}>
            {value === "all" && (
              <svg className="w-2.5 h-2.5 text-primary-content" fill="none" viewBox="0 0 10 10">
                <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className={`text-sm ${value === "all" ? 'font-medium' : ''}`}>
            {allLabel}
          </span>
        </button>

        {/* Token Options */}
        {filteredOptions.length === 0 ? (
          <div className="py-8 text-center text-sm text-base-content/50">
            No matches found
          </div>
        ) : (
          filteredOptions.map(option => (
            <button
              key={option}
              onClick={() => handleSelect(option)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                value === option ? 'bg-primary/10' : 'hover:bg-base-200'
              }`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                value === option 
                  ? 'bg-primary border-primary' 
                  : 'border-base-content/30'
              }`}>
                {value === option && (
                  <svg className="w-2.5 h-2.5 text-primary-content" fill="none" viewBox="0 0 10 10">
                    <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <TokenIcon symbol={option} size={24} />
              <span className={`text-sm ${value === option ? 'font-medium' : ''}`}>
                {option}
              </span>
            </button>
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
        className="btn btn-sm btn-ghost border border-base-300 hover:border-base-content/30 gap-2 min-w-[140px] justify-between font-normal"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {value !== "all" && <TokenIcon symbol={value} size={18} />}
          <span className="truncate text-sm">{displayValue}</span>
        </div>
        <ChevronDown 
          className={`w-4 h-4 flex-shrink-0 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
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

function MobileMarketRow({ row, pairName, usd, chainId, onSupply, onLoop }: MobileMarketRowProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const morphoUrl = getMorphoMarketUrl(chainId, row.market.uniqueKey, row.collateralSymbol, row.loanSymbol);

  return (
    <div 
      className={`rounded-lg border transition-colors cursor-pointer ${
        isExpanded 
          ? 'border-primary/30 bg-base-200/40' 
          : 'border-base-300/50 bg-base-200/20 hover:bg-base-200/40'
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Token pair icons + name */}
        <TokenPairAvatars collateralSymbol={row.collateralSymbol} loanSymbol={row.loanSymbol} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm truncate" title={pairName}>{pairName}</span>
            {morphoUrl && (
              <a
                href={morphoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="opacity-40 hover:opacity-80 transition-opacity"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Stats - always visible */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="font-mono tabular-nums text-base-content/70">{usd.format(row.supplyUsd)}</span>
          <span className="font-mono tabular-nums text-success">{formatPercent(row.supplyApy01, 2)}</span>
          <span className="font-mono tabular-nums">{formatPercent(row.borrowApy01, 2)}</span>
        </div>

        {/* Chevron */}
        <ChevronDown className={`w-4 h-4 text-base-content/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded: action bar */}
      {isExpanded && (
        <div className="flex items-center gap-2 px-3 pb-2 pt-0">
          <div className="flex-1 flex items-center gap-3 text-[10px] text-base-content/50">
            <span>Util: <span className="text-base-content/70">{formatPercent(row.utilization01, 0)}</span></span>
            <span>LTV: <span className="text-base-content/70">{formatPercent(row.lltv01, 0)}</span></span>
          </div>
          <button
            className="btn btn-xs btn-primary"
            onClick={e => { e.stopPropagation(); onSupply(); }}
          >
            Supply
          </button>
          <button
            className="btn btn-xs btn-ghost"
            onClick={e => { e.stopPropagation(); onLoop(); }}
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
  marketPairs,
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

  const totalPairs = marketPairs?.size ?? 0;

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
            onChange={e => setSearch(e.currentTarget.value)}
          >
            <TextField.Slot>
              <Search width="12" height="12" />
            </TextField.Slot>

            {search ? (
              <TextField.Slot side="right">
                <IconButton
                  size="1"
                  variant="ghost"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X width="12" height="12" />
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
              <Button variant="soft" onClick={() => setSearch("")} disabled={!search}>
                Clear search
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setSortKey("tvl");
                  setSortDirection("desc");
                  setSelectedCollateral("all");
                  setSelectedDebtAsset("all");
                }}
              >
                Reset all
              </Button>
            </Flex>
          </Flex>
        </Card>
      ) : (
        <>
          {/* Mobile: Card-based layout */}
          <div className="block md:hidden space-y-2">
            {rows.slice(0, visibleCount).map(r => {
              const { market } = r;
              const pairName = `${r.collateralSymbol}/${r.loanSymbol}`;
              
              return (
                <MobileMarketRow
                  key={market.uniqueKey}
                  row={r}
                  pairName={pairName}
                  usd={usd}
                  chainId={chainId}
                  onSupply={() => handleSupply(market)}
                  onLoop={() => handleLoop(market)}
                />
              );
            })}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block">
          <Card size="2">
            <Inset side="x" my="3">
              <ScrollArea scrollbars="horizontal" type="auto">
                <Box px="3" pb="3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-base-content/70 border-b border-base-300">
                        <th className="text-left font-medium py-2.5 pl-3">Market</th>
                        <th className="text-right font-medium py-2.5 pr-4 cursor-pointer hover:text-base-content" onClick={() => handleSort("tvl")}>
                          <span className={`inline-flex items-center gap-0.5 ${sortKey === "tvl" ? "text-primary" : ""}`}>
                            TVL {sortKey === "tvl" && (sortDirection === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                          </span>
                        </th>
                        <th className="text-center font-medium py-2.5 w-16">Util</th>
                        <th className="text-right font-medium py-2.5 pr-4 cursor-pointer hover:text-base-content" onClick={() => handleSort("supplyApy")}>
                          <span className={`inline-flex items-center gap-0.5 ${sortKey === "supplyApy" ? "text-primary" : ""}`}>
                            Earn {sortKey === "supplyApy" && (sortDirection === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                          </span>
                        </th>
                        <th className="text-right font-medium py-2.5 pr-4 cursor-pointer hover:text-base-content" onClick={() => handleSort("borrowApy")}>
                          <span className={`inline-flex items-center gap-0.5 ${sortKey === "borrowApy" ? "text-primary" : ""}`}>
                            Borrow {sortKey === "borrowApy" && (sortDirection === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                          </span>
                        </th>
                        <th className="w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, visibleCount).map(r => {
                        const { market } = r;
                        const morphoUrl = getMorphoMarketUrl(
                          chainId,
                          market.uniqueKey,
                          r.collateralSymbol,
                          r.loanSymbol
                        );

                        return (
                          <tr key={market.uniqueKey} className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors">
                            <td className="py-2.5 pl-3">
                              <div className="flex items-center gap-2">
                                <TokenPairAvatars collateralSymbol={r.collateralSymbol} loanSymbol={r.loanSymbol} />
                                {morphoUrl ? (
                                  <a
                                    href={morphoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium hover:text-primary transition-colors group/link flex items-center gap-1"
                                  >
                                    {r.collateralSymbol}/{r.loanSymbol}
                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-60 transition-opacity" />
                                  </a>
                                ) : (
                                  <span className="font-medium">{r.collateralSymbol}/{r.loanSymbol}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">
                              {usd.format(r.supplyUsd)}
                            </td>
                            <td className="py-2.5 text-center">
                              <UtilizationBar value={r.utilization01} />
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-success">
                              {formatPercent(r.supplyApy01, 2)}
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">
                              {formatPercent(r.borrowApy01, 2)}
                            </td>
                            <td className="py-2.5 pr-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <Button size="1" variant="soft" onClick={() => handleSupply(market)}>
                                  Supply
                                </Button>
                                <Button size="1" variant="outline" onClick={() => handleLoop(market)}>
                                  Loop
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
          <Button variant="soft" onClick={() => setVisibleCount(v => Math.min(v + pageSize, rows.length))}>
            Show more
          </Button>
        </Flex>
      )}

      {selectedMarket && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={() => {
            depositModal.close();
            setSelectedMarket(null);
          }}
          token={{
            name: selectedMarket.collateralAsset?.symbol ?? "",
            icon: tokenNameToLogo(selectedMarket.collateralAsset?.symbol ?? ""),
            address: selectedMarket.collateralAsset?.address ?? "",
            currentRate: 0, // Collateral doesn't earn yield in Morpho (supplyApy is for lending loan asset)
            usdPrice: selectedMarket.collateralAsset?.priceUsd ?? undefined,
            decimals: selectedMarket.collateralAsset?.decimals,
          }}
          protocolName="morpho-blue"
          chainId={chainId}
          context={encodeMorphoContext({
            marketId: selectedMarket.uniqueKey,
            loanToken: selectedMarket.loanAsset.address,
            collateralToken: selectedMarket.collateralAsset?.address || "",
            oracle: selectedMarket.oracle?.address || "",
            irm: selectedMarket.irmAddress,
            lltv: BigInt(selectedMarket.lltv),
          })}
        />
      )}

      {loopMarket && loopMarket.collateralAsset && (
        <MultiplyEvmModal
          isOpen={loopModal.isOpen}
          onClose={() => {
            loopModal.close();
            setLoopMarket(null);
          }}
          protocolName="morpho-blue"
          chainId={chainId}
          collaterals={[{
            symbol: loopMarket.collateralAsset.symbol,
            address: loopMarket.collateralAsset.address as `0x${string}`,
            decimals: loopMarket.collateralAsset.decimals,
            icon: tokenNameToLogo(loopMarket.collateralAsset.symbol),
            rawBalance: 0n,
            balance: 0,
            price: loopMarket.collateralAsset.priceUsd 
              ? parseUnits(loopMarket.collateralAsset.priceUsd.toFixed(8), 8) 
              : 0n,
          }]}
          debtOptions={[{
            symbol: loopMarket.loanAsset.symbol,
            address: loopMarket.loanAsset.address as `0x${string}`,
            decimals: loopMarket.loanAsset.decimals,
            icon: tokenNameToLogo(loopMarket.loanAsset.symbol),
            rawBalance: 0n,
            balance: 0,
            price: loopMarket.loanAsset.priceUsd 
              ? parseUnits(loopMarket.loanAsset.priceUsd.toFixed(8), 8) 
              : 0n,
          }]}
          morphoContext={{
            marketId: loopMarket.uniqueKey,
            loanToken: loopMarket.loanAsset.address,
            collateralToken: loopMarket.collateralAsset.address,
            oracle: loopMarket.oracle?.address || "",
            irm: loopMarket.irmAddress,
            lltv: BigInt(loopMarket.lltv),
          }}
          maxLtvBps={BigInt(Math.floor(toNumberSafe(loopMarket.lltv) / 1e14))} // Convert from 1e18 to bps
          lltvBps={BigInt(Math.floor(toNumberSafe(loopMarket.lltv) / 1e14))}
          supplyApyMap={{
            [loopMarket.collateralAsset.address.toLowerCase()]: (() => {
              // PT tokens have a fixed yield to maturity from Pendle
              if (isPTToken(loopMarket.collateralAsset.symbol)) {
                const collateralAddr = loopMarket.collateralAsset.address.toLowerCase();
                const ptYield = yieldsByAddress.get(collateralAddr) || yieldsBySymbol.get(loopMarket.collateralAsset.symbol.toLowerCase());
                if (ptYield) return ptYield.fixedApy;
              }
              return 0; // Morpho collateral doesn't earn yield unless it's a PT token
            })(),
          }}
          borrowApyMap={{ [loopMarket.loanAsset.address.toLowerCase()]: toNumberSafe(loopMarket.state?.borrowApy) * 100 }}
          disableAssetSelection={true}
        />
      )}
    </Flex>
  );
};
