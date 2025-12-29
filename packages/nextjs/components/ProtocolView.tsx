import { FC, useEffect, useMemo, useState } from "react";
import { Address, encodeAbiParameters } from "viem";
import Image from "next/image";
import { BorrowPosition } from "./BorrowPosition";
import { SupplyPosition } from "./SupplyPosition";
import type { CollateralWithAmount } from "./specific/collateral/CollateralSelector";
import { BorrowModal } from "./modals/BorrowModal";
import { TokenSelectModal } from "./modals/TokenSelectModal";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { TokenSelectModalStark } from "./modals/stark/TokenSelectModalStark";
import { ExclamationTriangleIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import type { SwapAsset } from "./modals/SwapModalShell";
import formatPercentage from "~~/utils/formatPercentage";
import { formatCurrency } from "~~/utils/formatNumber";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { PositionManager } from "~~/utils/position";
import type { VesuContext } from "~~/utils/vesu";
import { CollateralSwapModal } from "./modals/CollateralSwapModal";
import { BasicCollateral } from "~~/hooks/useMovePositionData";
import { CloseWithCollateralEvmModal } from "./modals/CloseWithCollateralEvmModal";
import { DebtSwapEvmModal } from "./modals/DebtSwapEvmModal";
import { formatBps } from "~~/utils/risk";
import { MultiplyEvmModal } from "./modals/MultiplyEvmModal";
import { useAaveEMode } from "~~/hooks/useAaveEMode";
import { usePendlePTYields, isPTToken } from "~~/hooks/usePendlePTYields";


export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number; // USD value
  tokenBalance: bigint; // Raw token amount
  currentRate: number;
  tokenAddress: string;
  tokenPrice?: bigint; // Token price with 8 decimals of precision
  usdPrice?: number; // Token price in USD
  tokenDecimals?: number; // Token decimals
  tokenSymbol?: string; // Token symbol for price feed selection
  collaterals?: SwapAsset[]; // Optional collateral assets tied to the position (e.g., Compound)
  collateralView?: React.ReactNode;
  collateralValue?: number; // Optional collateral value (used by borrowed positions)
  vesuContext?: {
    deposit?: VesuContext;
    withdraw?: VesuContext;
    borrow?: VesuContext;
    repay?: VesuContext;
  };
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  protocolContext?: string;
  moveSupport?: {
    preselectedCollaterals?: CollateralWithAmount[];
    disableCollateralSelection?: boolean;
  };
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
}

interface ProtocolViewProps {
  protocolName: string;
  protocolIcon: string;
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  hideUtilization?: boolean;
  forceShowAll?: boolean; // If true, always show all assets regardless of showAll toggle
  networkType: "evm" | "starknet"; // Specify which network this protocol view is for
  disableMoveSupply?: boolean;
  readOnly?: boolean; // If true, disable all interactive actions and modals
  expandFirstPositions?: boolean; // If true, expand the first supply and borrow rows by default
  chainId?: number;
  enabledFeatures?: {
    swap?: boolean;
    move?: boolean;
  };
  ltvBps?: bigint;
  lltvBps?: bigint;
  disableMarkets?: boolean;
  inlineMarkets?: boolean;
  disableLoop?: boolean;
  /** If true, start collapsed and auto-expand when positions are found */
  autoExpandOnPositions?: boolean;
  /** Whether initial data load has completed */
  hasLoadedOnce?: boolean;
  /** Optional element to render in the header (e.g., E-Mode toggle) */
  headerElement?: React.ReactNode;
}

// Health status indicator component that shows utilization percentage
const HealthStatus: FC<{ utilizationPercentage: number; mobileLabel?: string }> = ({ utilizationPercentage, mobileLabel = "LTV" }) => {
  // Determine color based on utilization percentage
  const getColorClasses = () => {
    if (utilizationPercentage < 50) return { bar: "bg-success", text: "text-success", glow: "shadow-success/30" };
    if (utilizationPercentage < 70) return { bar: "bg-warning", text: "text-warning", glow: "shadow-warning/30" };
    return { bar: "bg-error", text: "text-error", glow: "shadow-error/30" };
  };
  const colors = getColorClasses();

  return (
    <>
      {/* Desktop: bar + percentage */}
      <div className="hidden sm:flex items-center gap-2.5">
        <div className="w-24 h-1.5 bg-base-300/60 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full transition-all duration-500 shadow-sm ${colors.glow}`}
            style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-mono font-semibold tabular-nums ${colors.text}`}>
          {utilizationPercentage.toFixed(0)}%
        </span>
      </div>
      {/* Mobile: just percentage */}
      <span className={`sm:hidden text-sm font-mono font-bold tabular-nums ${colors.text}`}>
        {utilizationPercentage.toFixed(0)}%
      </span>
    </>
  );
};

export const ProtocolView: FC<ProtocolViewProps> = ({
  protocolName,
  protocolIcon,
  suppliedPositions,
  borrowedPositions,
  hideUtilization = false,
  forceShowAll = false,
  networkType,
  disableMoveSupply = false,
  readOnly = false,
  expandFirstPositions = true,
  chainId,
  enabledFeatures = { swap: false, move: true },
  ltvBps = 0n,
  lltvBps = 0n,
  disableMarkets = false,
  inlineMarkets = false,
  disableLoop = false,
  autoExpandOnPositions = false,
  hasLoadedOnce = true,
  headerElement,
}) => {
  const [isMarketsOpen, setIsMarketsOpen] = useState(false);
  const [isTokenSelectModalOpen, setIsTokenSelectModalOpen] = useState(false);
  const [isTokenBorrowModalOpen, setIsTokenBorrowModalOpen] = useState(false);
  const [isTokenBorrowSelectModalOpen, setIsTokenBorrowSelectModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ProtocolPosition | null>(null);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [selectedSwapPosition, setSelectedSwapPosition] = useState<ProtocolPosition | null>(null);
  const [isMultiplyModalOpen, setIsMultiplyModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedClosePosition, setSelectedClosePosition] = useState<ProtocolPosition | null>(null);
  const [isDebtSwapModalOpen, setIsDebtSwapModalOpen] = useState(false);
  const [selectedDebtSwapPosition, setSelectedDebtSwapPosition] = useState<ProtocolPosition | null>(null);
  // Start collapsed if autoExpandOnPositions is enabled
  const [isCollapsed, setIsCollapsed] = useState(autoExpandOnPositions);

  // Reset collapsed state when chainId changes (network switch)
  useEffect(() => {
    if (autoExpandOnPositions) {
      setIsCollapsed(true); // Reset to collapsed, will expand when positions load
    }
  }, [chainId, autoExpandOnPositions]);

  const handleSwap = (position: ProtocolPosition) => {
    if (readOnly) return;
    setSelectedSwapPosition(position);
    setIsSwapModalOpen(true);
  };
  const handleCloseWithCollateral = (position: ProtocolPosition) => {
    if (readOnly) return;
    setSelectedClosePosition(position);
    setIsCloseModalOpen(true);
  };
  const handleDebtSwap = (position: ProtocolPosition) => {
    if (readOnly) return;
    setSelectedDebtSwapPosition(position);
    setIsDebtSwapModalOpen(true);
  };

  // E-Mode handling for Aave - fetch user's E-Mode and filter assets
  const isAaveProtocol = protocolName.toLowerCase().includes("aave");
  const { userEMode } = useAaveEMode(isAaveProtocol && chainId ? chainId : undefined);

  // Fetch PT token yields from Pendle
  const { yieldsByAddress, yieldsBySymbol } = usePendlePTYields(chainId);

  // Determine if user has any positions with balance
  const hasPositions = useMemo(() => {
    const hasSupply = suppliedPositions.some(p => p.balance > 0);
    const hasBorrow = borrowedPositions.some(p => p.balance < 0 || (p.collateralValue ?? 0) > 0);
    return hasSupply || hasBorrow;
  }, [suppliedPositions, borrowedPositions]);

  // Auto-expand when positions are found (Option B: start collapsed, expand on positions)
  useEffect(() => {
    if (!autoExpandOnPositions) return;
    if (!hasLoadedOnce) return; // Wait for initial load to complete
    
    if (hasPositions) {
      setIsCollapsed(false); // Expand when positions exist
    } else {
      setIsCollapsed(true); // Stay/become collapsed when no positions
    }
  }, [autoExpandOnPositions, hasLoadedOnce, hasPositions]);
  

  // Helper to filter assets by E-Mode compatibility (heuristic based on label)
  const filterByEMode = useMemo(() => {
    if (!userEMode || userEMode.id === 0) return (assets: SwapAsset[]) => assets;
    
    const label = userEMode.label.toLowerCase();
    
    return (assets: SwapAsset[]) => {
      // Pendle E-Mode: show PT tokens and their underlying
      if (label.includes("pendle")) {
        return assets.filter(a => {
          const sym = a.symbol.toLowerCase();
          return sym.startsWith("pt-") || sym.includes("usde") || sym.includes("susde");
        });
      }
      
      // ETH correlated E-Mode: show ETH derivatives
      if (label.includes("eth")) {
        return assets.filter(a => {
          const sym = a.symbol.toLowerCase();
          return sym.includes("eth") || sym.includes("wsteth") || sym.includes("reth") || sym.includes("cbeth");
        });
      }
      
      // Stablecoin E-Mode: show USD stables
      if (label.includes("stable") || label.includes("usd")) {
        return assets.filter(a => {
          const sym = a.symbol.toLowerCase();
          return sym.includes("usd") || sym.includes("dai") || sym.includes("frax") || sym.includes("lusd");
        });
      }
      
      // Default: show all
      return assets;
    };
  }, [userEMode]);

  // Convert suppliedPositions to BasicCollateral for the modal
  const availableCollaterals = useMemo(() => {
    const all = suppliedPositions.map(p => ({
      symbol: p.name,
      address: p.tokenAddress,
      decimals: p.tokenDecimals || 18,
      rawBalance: p.tokenBalance,
      balance: p.balance,
      icon: p.icon,
      usdValue: p.balance,
      price: p.tokenPrice,
    }));
    // Apply E-Mode filter for Aave
    return isAaveProtocol ? filterByEMode(all) : all;
  }, [suppliedPositions, isAaveProtocol, filterByEMode]);

  const debtOptions = useMemo(() => {
    const mapped = borrowedPositions.map(p => ({
      symbol: p.name,
      address: p.tokenAddress,
      decimals: p.tokenDecimals || 18,
      rawBalance: p.tokenBalance,
      balance: p.balance,
      icon: p.icon,
      usdValue: p.balance,
      price: p.tokenPrice,
    }));

    const result = mapped.length > 0 ? mapped : availableCollaterals;
    // Apply E-Mode filter for Aave
    return isAaveProtocol ? filterByEMode(result) : result;
  }, [availableCollaterals, borrowedPositions, isAaveProtocol, filterByEMode]);

  // APY maps for multiply modal
  // For PT tokens, use fixed yield from Pendle instead of lending APY
  const supplyApyMap = useMemo(() => {
    const map: Record<string, number> = {};
    suppliedPositions.forEach(p => {
      const addrLower = p.tokenAddress.toLowerCase();
      
      // Check if this is a PT token and we have yield data
      if (isPTToken(p.name)) {
        // Try to find yield by address first, then by symbol
        const ptYield = yieldsByAddress.get(addrLower) || yieldsBySymbol.get(p.name.toLowerCase());
        if (ptYield) {
          map[addrLower] = ptYield.fixedApy;
          return;
        }
      }
      
      // Default to lending APY
      map[addrLower] = p.currentRate;
    });
    return map;
  }, [suppliedPositions, yieldsByAddress, yieldsBySymbol]);

  const borrowApyMap = useMemo(() => {
    const map: Record<string, number> = {};
    borrowedPositions.forEach(p => { map[p.tokenAddress.toLowerCase()] = Math.abs(p.currentRate); });
    return map;
  }, [borrowedPositions]);

  // Calculate net balance.
  const netBalance = useMemo(() => {
    const totalSupplied = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);

    // Include collateral values in total balance calculation
    let totalBorrowed = 0;
    let totalCollateral = 0;

    borrowedPositions.forEach(pos => {
      // Add up the absolute borrowed value
      totalBorrowed += Math.abs(pos.balance);

      // Add up the collateral value if available
      if (pos.collateralValue) {
        totalCollateral += pos.collateralValue;
      }
    });

    // Net balance = supplied + collateral - borrowed
    return totalSupplied + totalCollateral - totalBorrowed;
  }, [suppliedPositions, borrowedPositions]);

  const { utilizationPercentage, currentLtvBps } = useMemo(() => {
    const suppliedTotal = suppliedPositions.reduce((acc, pos) => acc + pos.balance, 0);
    const collateralTotal = borrowedPositions.reduce((acc, pos) => acc + (pos.collateralValue || 0), 0);
    const totalSupplied = suppliedTotal + collateralTotal;
    const totalBorrowed = borrowedPositions.reduce((acc, pos) => acc + Math.abs(pos.balance), 0);
    const baseLtv = totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0;
    const currentBps = totalSupplied > 0 ? BigInt(Math.round((totalBorrowed / totalSupplied) * 10000)) : 0n;

    const thresholdBps = lltvBps > 0n ? lltvBps : ltvBps;
    if (thresholdBps > 0n) {
      const usageBps = Number((currentBps * 10000n) / thresholdBps) / 100;
      return { utilizationPercentage: Math.min(usageBps, 100), currentLtvBps: currentBps };
    }

    return { utilizationPercentage: baseLtv, currentLtvBps: currentBps };
  }, [borrowedPositions, suppliedPositions, lltvBps, ltvBps]);

  const currentLtvLabel = useMemo(() => (currentLtvBps > 0n ? `${formatBps(currentLtvBps)}%` : undefined), [currentLtvBps]);

  const positionManager = useMemo(
    () => PositionManager.fromPositions(suppliedPositions, borrowedPositions, Number(ltvBps)),
    [suppliedPositions, borrowedPositions, ltvBps],
  );

  // Create supplied positions with PT yields applied for net yield calculation
  const suppliedPositionsWithPTYields = useMemo(() => {
    return suppliedPositions.map(p => {
      if (isPTToken(p.name)) {
        const ptYield = yieldsByAddress.get(p.tokenAddress.toLowerCase()) || yieldsBySymbol.get(p.name.toLowerCase());
        if (ptYield) {
          return { ...p, currentRate: ptYield.fixedApy };
        }
      }
      return p;
    });
  }, [suppliedPositions, yieldsByAddress, yieldsBySymbol]);

  const { netYield30d, netApyPercent } = useMemo(
    () =>
      calculateNetYieldMetrics(suppliedPositionsWithPTYields, borrowedPositions, {
        netBalanceOverride: netBalance,
      }),
    [suppliedPositionsWithPTYields, borrowedPositions, netBalance],
  );

  const formatSignedPercentage = (value: number) => {
    const formatted = formatPercentage(Math.abs(value));
    return `${value >= 0 ? "" : "-"}${formatted}%`;
  };

  // Keep Markets section closed when forceShowAll is active to avoid auto-mounting extra hooks
  useEffect(() => {
    if (forceShowAll) {
      setIsMarketsOpen(false);
    }
  }, [forceShowAll]);

  // Use effective showAll state (component state OR forced from props)
  const effectiveShowAll = isMarketsOpen || forceShowAll;

  const loopingDisabled = disableLoop || protocolName.toLowerCase().includes("compound");

  // Filter positions based on wheter user has balance.
  // If inlineMarkets is true (e.g. Compound), clicking "Markets" (isMarketsOpen) should reveal all assets in these lists.
  // Otherwise (Aave), clicking "Markets" opens a separate section, so we keep these lists filtered to user positions.
  const showAllInLists = forceShowAll || (inlineMarkets && isMarketsOpen);

  const filteredSuppliedPositions = (showAllInLists ? suppliedPositions : suppliedPositions.filter(p => p.balance > 0)).map(p => {
    // Override currentRate with PT fixed yield if available
    let currentRate = p.currentRate;
    if (isPTToken(p.name)) {
      const ptYield = yieldsByAddress.get(p.tokenAddress.toLowerCase()) || yieldsBySymbol.get(p.name.toLowerCase());
      if (ptYield) {
        currentRate = ptYield.fixedApy;
      }
    }
    
    return readOnly
      ? {
        ...p,
        currentRate,
        actionsDisabled: true,
        moveSupport: p.moveSupport ? { ...p.moveSupport, disableCollateralSelection: true } : undefined,
      }
      : { ...p, currentRate };
  });

  // For borrowed positions:
  const filteredBorrowedPositions = (showAllInLists
    ? borrowedPositions
    : borrowedPositions.filter(p => p.balance < 0 || (p.collateralValue ?? 0) > 0)).map(p =>
      readOnly
        ? {
          ...p,
          actionsDisabled: true,
          moveSupport: p.moveSupport ? { ...p.moveSupport, disableCollateralSelection: true } : undefined,
        }
        : p,
    );

  // Assuming tokenNameToLogo is defined elsewhere, we use a fallback here.
  // const getProtocolLogo = (protocol: string) => `/logos/${protocol.toLowerCase()}-logo.svg`;

  // Handle opening the token select modal for supply
  const handleAddSupply = () => {
    if (readOnly) return;
    setIsTokenSelectModalOpen(true);
  };

  const handleOpenMultiply = () => {
    if (readOnly) return;
    setIsMultiplyModalOpen(true);
  };

  // Handle closing the token select modal for supply
  const handleCloseTokenSelectModal = () => {
    setIsTokenSelectModalOpen(false);
  };

  // Handle opening the token select modal for borrowing
  const handleAddBorrow = () => {
    if (readOnly) return;
    setIsTokenBorrowSelectModalOpen(true);
  };

  // Handle closing the token select modal for borrowing
  const handleCloseBorrowSelectModal = () => {
    setIsTokenBorrowSelectModalOpen(false);
  };

  // Handle opening the borrow modal directly (obsolete, but keeping for reference)
  // const handleOpenBorrowModal = () => setIsTokenBorrowModalOpen(true);

  // Handle closing the borrow modal
  const handleCloseBorrowModal = () => {
    setIsTokenBorrowModalOpen(false);
    setSelectedToken(null);
  };

  // Get all possible supply positions by using showAll setting
  // This ensures we include all tokens, even those with zero balance
  const allSupplyPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (effectiveShowAll) return suppliedPositions;

    // Otherwise, temporarily get all positions for the token modal
    return suppliedPositions;
  }, [suppliedPositions, effectiveShowAll]);

  // Get all possible borrow positions by using showAll setting
  const allBorrowPositions = useMemo(() => {
    // If we're showing all anyway, use that
    if (effectiveShowAll) return borrowedPositions;

    // Otherwise, temporarily get all positions for the token modal
    return borrowedPositions;
  }, [borrowedPositions, effectiveShowAll]);

  // Handle supply token selection for Starknet
  // Starknet deposit selection handled within TokenSelectModalStark in this view

  // Handle deposit modal close
  // const handleCloseDepositModal = () => undefined;

  return (
    <div className={`w-full flex flex-col hide-scrollbar ${isCollapsed ? 'p-1' : 'p-3 space-y-2'}`}>
      {/* Protocol Header Card */}
      <div
        className="card bg-base-200/40 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl border border-base-300/50 cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="card-body px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {/* Protocol name + icon */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-2 flex items-center justify-center shadow-sm ring-1 ring-base-300/30">
                <Image
                  src={protocolIcon}
                  alt={`${protocolName} icon`}
                  width={24}
                  height={24}
                  className="object-contain drop-shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Protocol</span>
                <span className="text-base font-bold tracking-tight">{protocolName}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-10 bg-gradient-to-b from-transparent via-base-300 to-transparent" />

            {/* Stats - spread evenly across available space */}
            <div className="flex-1 flex flex-wrap items-center justify-around gap-y-3">
              {/* Net Balance */}
              <div className="group flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Balance</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${netBalance >= 0 ? "text-success" : "text-error"}`}>
                  {formatCurrency(netBalance)}
                </span>
              </div>

              {/* 30D Yield - hidden on very narrow screens */}
              <div className="hidden min-[480px]:flex group flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">30D Yield</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${netYield30d >= 0 ? "text-success" : "text-error"}`}>
                  {formatCurrency(netYield30d)}
                </span>
              </div>

              {/* Net APY - hidden on very narrow screens */}
              <div className="hidden min-[400px]:flex group flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Net APY</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${netApyPercent == null ? "text-base-content/40" : netApyPercent >= 0 ? "text-success" : "text-error"}`}>
                  {netApyPercent == null ? "—" : formatSignedPercentage(netApyPercent)}
                </span>
              </div>

              {/* Utilization */}
              {!hideUtilization && (
                <div className="group/util flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                  <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">
                    <span className="hidden sm:inline">Utilization</span>
                    <span className="sm:hidden">LTV</span>
                  </span>
                  {/* Default: show bar */}
                  <div className="group-hover/util:hidden">
                    <HealthStatus utilizationPercentage={utilizationPercentage} />
                  </div>
                  {/* On hover: show Current and LLTV breakdown */}
                  <div className="hidden group-hover/util:flex items-center gap-2 text-xs font-mono tabular-nums">
                    {currentLtvBps > 0n || lltvBps > 0n ? (
                      <>
                        <span className="text-base-content/70">
                          <span className="text-[10px] text-base-content/50">Current </span>
                          {currentLtvLabel || "0%"}
                        </span>
                        {lltvBps > 0n && (
                          <>
                            <span className="text-base-content/30">•</span>
                            <span className="text-base-content/70">
                              <span className="text-[10px] text-base-content/50">LLTV </span>
                              {formatBps(lltvBps)}%
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-base-content/50">—</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Header Element (e.g., E-Mode toggle) - hidden on mobile, shown in separate row */}
            {headerElement && (
              <div 
                className="hidden md:flex items-center"
                onClick={e => e.stopPropagation()}
              >
                {headerElement}
              </div>
            )}

            {/* Markets Toggle + Collapse */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-base-300/50">
              {!forceShowAll && !disableMarkets && (
                <button
                  className="btn btn-sm btn-ghost gap-1.5"
                  type="button"
                  onClick={e => { e.stopPropagation(); setIsMarketsOpen(!isMarketsOpen); }}
                >
                  <span className="text-[10px] uppercase tracking-widest font-semibold">Markets</span>
                  {isMarketsOpen ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                </button>
              )}
              {forceShowAll && !readOnly && (
                <span className="text-[11px] text-primary/80 font-medium">Connect wallet</span>
              )}
              <ChevronDownIcon
                className={`w-5 h-5 text-base-content/40 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </div>
          </div>

          {/* Header Element - Mobile row (shown below stats on small screens) */}
          {headerElement && (
            <div 
              className="md:hidden flex items-center justify-start pt-2 mt-2 border-t border-base-300/30"
              onClick={e => e.stopPropagation()}
            >
              {headerElement}
            </div>
          )}
        </div>
      </div>

      {/* Markets Section - expandable (only if not inlineMarkets) */}
      {isMarketsOpen && !isCollapsed && !disableMarkets && !inlineMarkets && (
        <div className="card bg-base-200/40 shadow-md rounded-xl border border-base-300/50">
          <div className="card-body p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Suppliable Assets */}
              {suppliedPositions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
                      Suppliable assets
                    </div>
                    {!readOnly && (
                      <button
                        className="btn btn-xs btn-outline"
                        type="button"
                        onClick={handleAddSupply}
                      >
                        Deposit
                      </button>
                    )}
                  </div>
                  {suppliedPositions.map(position => {
                    // Override currentRate with PT fixed yield if available
                    let currentRate = position.currentRate;
                    if (isPTToken(position.name)) {
                      const ptYield = yieldsByAddress.get(position.tokenAddress.toLowerCase()) || yieldsBySymbol.get(position.name.toLowerCase());
                      if (ptYield) currentRate = ptYield.fixedApy;
                    }
                    return (
                      <SupplyPosition
                        key={`market-supply-${position.tokenAddress}`}
                        {...position}
                        currentRate={currentRate}
                        protocolName={protocolName}
                        networkType={networkType}
                        chainId={chainId}
                        hideBalanceColumn
                        availableActions={{ deposit: false, withdraw: false, move: false, swap: false }}
                        showInfoDropdown={false}
                      />
                    );
                  })}
                </div>
              )}

              {/* Borrowable Assets */}
              {borrowedPositions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
                      Borrowable assets
                    </div>
                    {!readOnly && filteredSuppliedPositions.length > 0 && (
                      <button
                        className="btn btn-xs btn-outline"
                        type="button"
                        onClick={handleAddBorrow}
                      >
                        Borrow
                      </button>
                    )}
                  </div>
                  {borrowedPositions.map(position => (
                    <BorrowPosition
                      key={`market-borrow-${position.tokenAddress}`}
                      {...position}
                      protocolName={protocolName}
                      networkType={networkType}
                      chainId={chainId}
                      hideBalanceColumn
                      availableActions={{ borrow: false, repay: false, move: false, close: false, swap: false }}
                      showInfoDropdown={false}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Positions Container - collapsible */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Supplied Assets */}
          <div className="h-full">
            <div className="card bg-base-200/40 shadow-md hover:shadow-lg transition-all duration-300 h-full rounded-xl border border-base-300/50">
              <div className="card-body p-4 flex flex-col">
                <div className="flex items-center justify-between pb-3 mb-1 border-b border-base-200/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-success" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-base-content/60">Supplied</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success">
                    <span className="text-xs font-mono font-bold">{filteredSuppliedPositions.length}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">{filteredSuppliedPositions.length === 1 ? "asset" : "assets"}</span>
                  </div>
                </div>
                {filteredSuppliedPositions.length > 0 ? (
                  <div className="flex flex-col flex-1 pt-2">
                    <div className="space-y-3">
                      {filteredSuppliedPositions.map((position, index) => (
                        <div key={`supplied-${position.name}-${index}`} className="min-h-[60px]">
                          <SupplyPosition
                            {...position}
                            protocolName={protocolName}
                            networkType={networkType}
                            chainId={chainId}
                            position={positionManager}
                            disableMove={disableMoveSupply || readOnly}
                            availableActions={readOnly ? { deposit: true, withdraw: true, move: true, swap: true } : { deposit: true, withdraw: true, move: enabledFeatures.move ?? true, swap: enabledFeatures.swap ?? false }}
                            onSwap={() => handleSwap(position)}
                            suppressDisabledMessage
                            defaultExpanded={expandFirstPositions && index === 0}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Primary actions pinned to bottom */}
                    {!readOnly && (
                      <div className="mt-auto pt-4 flex flex-col gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            className="group w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dashed border-base-300 hover:border-primary/50 bg-base-200/30 hover:bg-primary/5 text-base-content/60 hover:text-primary transition-all duration-200"
                            onClick={handleAddSupply}
                          >
                            <PlusIcon className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                            <span className="text-xs font-medium uppercase tracking-wider">Add Supply</span>
                          </button>

                          {/* Disable looping for Compound - needs fix for market context */}
                          {!loopingDisabled && (
                            <button
                              className="group w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dashed border-base-300 hover:border-secondary/50 bg-base-200/30 hover:bg-secondary/5 text-base-content/60 hover:text-secondary transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={handleOpenMultiply}
                              disabled={availableCollaterals.length === 0 || debtOptions.length === 0}
                              title={
                                availableCollaterals.length === 0 || debtOptions.length === 0
                                  ? "Supply collateral and have a debt option to build a loop"
                                  : "Build a flash-loan loop"
                              }
                            >
                              <PlusIcon className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                              <span className="text-xs font-medium uppercase tracking-wider">Add Loop</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 items-center justify-center text-base-content/50 text-center p-6 bg-base-200/30 rounded-xl mt-2 border border-dashed border-base-300">
                    <ExclamationTriangleIcon className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">{effectiveShowAll ? "No available assets" : "No supplied assets"}</p>
                    {!readOnly && (
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          className="group flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-200"
                          onClick={handleAddSupply}
                        >
                          <PlusIcon className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                          <span className="text-xs font-medium uppercase tracking-wider">Supply Assets</span>
                        </button>
                        
                        {/* Disable looping for Compound - needs fix for market context */}
                        {!protocolName.toLowerCase().includes("compound") && (
                          <button
                            className="group flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleOpenMultiply}
                            disabled={availableCollaterals.length === 0 || debtOptions.length === 0}
                            title={
                              availableCollaterals.length === 0 || debtOptions.length === 0
                                ? "Supply collateral and have a debt option to build a loop"
                                : "Build a flash-loan loop"
                            }
                          >
                            <PlusIcon className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                            <span className="text-xs font-medium uppercase tracking-wider">Add Loop</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Borrowed Assets */}
          <div className="h-full">
            <div className="card bg-base-200/40 shadow-md hover:shadow-lg transition-all duration-300 h-full rounded-xl border border-base-300/50">
              <div className="card-body p-4 flex flex-col">
                <div className="flex items-center justify-between pb-3 mb-1 border-b border-base-200/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-error" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-base-content/60">Borrowed</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-error/10 text-error">
                    <span className="text-xs font-mono font-bold">{filteredBorrowedPositions.length}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">{filteredBorrowedPositions.length === 1 ? "asset" : "assets"}</span>
                  </div>
                </div>
                {filteredBorrowedPositions.length > 0 ? (
                  <div className="flex flex-col flex-1 pt-2">
                    <div className="space-y-3">
                      {filteredBorrowedPositions.map((position, index) => (
                        <div key={`borrowed-${position.name}-${index}`} className="min-h-[60px]">
                          <BorrowPosition
                            {...position}
                            protocolName={protocolName}
                            networkType={networkType}
                            chainId={chainId}
                            position={positionManager}
                            availableAssets={position.collaterals || availableCollaterals}
                            availableActions={readOnly ? { borrow: true, repay: true, move: true, close: false, swap: false } : { borrow: true, repay: true, move: enabledFeatures.move ?? true, close: true, swap: enabledFeatures.swap ?? true }}
                            onClosePosition={() => handleCloseWithCollateral(position)}
                            onSwap={() => handleDebtSwap(position)}
                            suppressDisabledMessage
                            defaultExpanded={expandFirstPositions && index === 0}
                          />
                        </div>
                      ))}
                    </div>

                    {/* "Add Borrow" button - pinned to bottom with gap */}
                    {!readOnly && (
                      <div className="mt-auto pt-4">
                        <button
                          className={`group w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dashed transition-all duration-200 ${filteredSuppliedPositions.length > 0
                            ? "border-base-300 hover:border-primary/50 bg-base-200/30 hover:bg-primary/5 text-base-content/60 hover:text-primary"
                            : "border-base-300/50 bg-base-200/20 text-base-content/30 cursor-not-allowed"
                            }`}
                          onClick={handleAddBorrow}
                          disabled={filteredSuppliedPositions.length === 0}
                          title={filteredSuppliedPositions.length === 0 ? "Supply assets first to enable borrowing" : undefined}
                        >
                          <PlusIcon className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                          <span className="text-xs font-medium uppercase tracking-wider">Borrow</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 items-center justify-center text-base-content/50 text-center p-6 bg-base-200/30 rounded-xl mt-2 border border-dashed border-base-300">
                    <ExclamationTriangleIcon className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">{effectiveShowAll ? "No available assets" : "No borrowed assets"}</p>
                    {!readOnly && (
                      <button
                        className={`group mt-4 flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-all duration-200 ${filteredSuppliedPositions.length > 0
                          ? "bg-primary/10 hover:bg-primary/20 text-primary"
                          : "bg-base-200/30 text-base-content/30 cursor-not-allowed"
                          }`}
                        onClick={handleAddBorrow}
                        disabled={filteredSuppliedPositions.length === 0}
                        title={filteredSuppliedPositions.length === 0 ? "Supply assets first to enable borrowing" : undefined}
                      >
                        <PlusIcon className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
                        <span className="text-xs font-medium uppercase tracking-wider">Borrow Assets</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals - Conditional based on network type */}
      {!readOnly && networkType === "starknet" ? (
        <>
          {/* Supply Token Select - unified Stark modal */}
          <TokenSelectModalStark
            isOpen={isTokenSelectModalOpen}
            onClose={handleCloseTokenSelectModal}
            tokens={allSupplyPositions.map(pos => ({
              address: BigInt(pos.tokenAddress),
              symbol: BigInt("0x" + Buffer.from(pos.name).toString("hex")),
              decimals: pos.tokenDecimals || 18,
              rate_accumulator: 0n,
              utilization: 0n,
              fee_rate: BigInt(Math.floor(((pos.currentRate / 100) * 1e18) / (365 * 24 * 60 * 60))),
              price: { value: BigInt(pos.tokenPrice || 0), is_valid: true },
              total_nominal_debt: pos.tokenBalance ?? 0n,
              last_rate_accumulator: 0n,
              reserve: 0n,
              scale: 0n,
              borrowAPR: pos.currentRate,
              supplyAPY: pos.currentRate,
            }))}
            protocolName={protocolName}
            position={positionManager}
            action="deposit"
          />

          {/* Token Select Modal for Borrow - Starknet */}
          <TokenSelectModalStark
            isOpen={isTokenBorrowSelectModalOpen}
            onClose={handleCloseBorrowSelectModal}
            tokens={allBorrowPositions.map(pos => ({
              address: BigInt(pos.tokenAddress),
              symbol: BigInt("0x" + Buffer.from(pos.name).toString("hex")), // Convert name to felt format
              decimals: pos.tokenDecimals || 18,
              rate_accumulator: BigInt(0),
              utilization: BigInt(0),
              fee_rate: BigInt(Math.floor(((pos.currentRate / 100) * 1e18) / (365 * 24 * 60 * 60))), // Convert APR percentage to per-second rate
              price: {
                value: BigInt(pos.tokenPrice || 0),
                is_valid: true,
              },
              total_nominal_debt: pos.tokenBalance ?? 0n,
              last_rate_accumulator: BigInt(0),
              reserve: BigInt(0),
              scale: BigInt(0),
              borrowAPR: pos.currentRate,
              supplyAPY: pos.currentRate * 0.7, // Approximate supply APY as 70% of borrow APR
            }))}
            protocolName={protocolName}
            position={positionManager}
          />

          {/* Deposit handled by TokenSelectModalStark after selection */}

          {/* Borrow Modal for Starknet */}
          {isTokenBorrowModalOpen && (
            <BorrowModalStark
              isOpen={isTokenBorrowModalOpen}
              onClose={handleCloseBorrowModal}
              token={
                selectedToken
                  ? {
                    name: selectedToken.name,
                    icon: selectedToken.icon,
                    currentRate: selectedToken.currentRate,
                    address: selectedToken.tokenAddress,
                    usdPrice: selectedToken.usdPrice ?? (selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0),
                  }
                  : {
                    name: borrowedPositions[0]?.name || "",
                    icon: borrowedPositions[0]?.icon || "",
                    currentRate: borrowedPositions[0]?.currentRate || 0,
                    address: borrowedPositions[0]?.tokenAddress || "",
                    usdPrice: borrowedPositions[0]?.usdPrice
                      ?? (borrowedPositions[0]?.tokenPrice ? Number(borrowedPositions[0]?.tokenPrice) / 1e8 : 0),
                  }
              }
              protocolName={protocolName}
              currentDebt={
                selectedToken
                  ? Number(selectedToken.tokenBalance) / 10 ** (selectedToken.tokenDecimals || 18)
                  : borrowedPositions[0]
                    ? Number(borrowedPositions[0].tokenBalance) / 10 ** (borrowedPositions[0].tokenDecimals || 18)
                    : 0
              }
              position={positionManager}
              vesuContext={
                selectedToken?.vesuContext?.borrow ?? borrowedPositions[0]?.vesuContext?.borrow
              }
            />
          )}

          {/* Close With Collateral (EVM) */}
          {isCloseModalOpen && selectedClosePosition && (
            <CloseWithCollateralEvmModal
              isOpen={isCloseModalOpen}
              onClose={() => { setIsCloseModalOpen(false); setSelectedClosePosition(null); }}
              protocolName={protocolName}
              chainId={chainId || 1}
              debtToken={selectedClosePosition.tokenAddress as Address}
              debtName={selectedClosePosition.name}
              debtIcon={selectedClosePosition.icon}
              debtDecimals={selectedClosePosition.tokenDecimals || 18}
              debtPrice={selectedClosePosition.tokenPrice}
              debtBalance={selectedClosePosition.tokenBalance}
              availableCollaterals={selectedClosePosition.collaterals || availableCollaterals}
              context={
                protocolName.toLowerCase().includes("compound")
                  ? encodeAbiParameters([{ type: "address" }], [selectedClosePosition.tokenAddress as Address]) as `0x${string}`
                  : selectedClosePosition.protocolContext
              }
            />
          )}

          {/* Debt Swap (EVM) */}
          {isDebtSwapModalOpen && selectedDebtSwapPosition && (
            <DebtSwapEvmModal
              isOpen={isDebtSwapModalOpen}
              onClose={() => { setIsDebtSwapModalOpen(false); setSelectedDebtSwapPosition(null); }}
              protocolName={protocolName}
              chainId={chainId || 1}
              debtFromToken={selectedDebtSwapPosition.tokenAddress as Address}
              debtFromName={selectedDebtSwapPosition.name}
              debtFromIcon={selectedDebtSwapPosition.icon}
              debtFromDecimals={selectedDebtSwapPosition.tokenDecimals || 18}
              debtFromPrice={selectedDebtSwapPosition.tokenPrice}
              currentDebtBalance={selectedDebtSwapPosition.tokenBalance}
              availableAssets={selectedDebtSwapPosition.collaterals || availableCollaterals}
              context={
                protocolName.toLowerCase().includes("compound")
                  ? encodeAbiParameters([{ type: "address" }], [selectedDebtSwapPosition.tokenAddress as Address]) as `0x${string}`
                  : selectedDebtSwapPosition.protocolContext
              }
            />
          )}
        </>
      ) : !readOnly ? (
        <>
          {/* Token Select Modal for Supply - EVM */}
          <TokenSelectModal
            isOpen={isTokenSelectModalOpen}
            onClose={handleCloseTokenSelectModal}
            tokens={allSupplyPositions}
            protocolName={protocolName}
            isBorrow={false}
            position={positionManager}
            chainId={chainId}
          />

          {/* Token Select Modal for Borrow - EVM */}
          <TokenSelectModal
            isOpen={isTokenBorrowSelectModalOpen}
            onClose={handleCloseBorrowSelectModal}
            tokens={allBorrowPositions}
            protocolName={protocolName}
            isBorrow={true}
            position={positionManager}
            chainId={chainId}
          />

          {/* Collateral Swap Modal */}
          {isSwapModalOpen && selectedSwapPosition && (
            <CollateralSwapModal
              isOpen={isSwapModalOpen}
              onClose={() => setIsSwapModalOpen(false)}
              protocolName={protocolName}
              availableAssets={availableCollaterals}
              initialFromTokenAddress={selectedSwapPosition.tokenAddress}
              chainId={chainId || 1}
              position={{
                name: selectedSwapPosition.name,
                tokenAddress: selectedSwapPosition.tokenAddress,
                decimals: selectedSwapPosition.tokenDecimals || 18,
                balance: selectedSwapPosition.balance,
                type: "supply"
              }}
            />
          )}

          {isMultiplyModalOpen && (
            <MultiplyEvmModal
              isOpen={isMultiplyModalOpen}
              onClose={() => setIsMultiplyModalOpen(false)}
              protocolName={protocolName}
              chainId={chainId || 1}
              collaterals={availableCollaterals}
              debtOptions={debtOptions}
              market={protocolName.toLowerCase().includes("compound") ? (availableCollaterals[0]?.address as Address) : undefined}
              maxLtvBps={ltvBps > 0n ? ltvBps : 8000n}
              lltvBps={lltvBps > 0n ? lltvBps : 8500n}
              supplyApyMap={supplyApyMap}
              borrowApyMap={borrowApyMap}
              eMode={isAaveProtocol ? userEMode : undefined}
            />
          )}

          {/* Borrow Modal - EVM */}
          {isTokenBorrowModalOpen && (
            <BorrowModal
              isOpen={isTokenBorrowModalOpen}
              onClose={handleCloseBorrowModal}
              token={
                selectedToken
                  ? {
                    name: selectedToken.name,
                    icon: selectedToken.icon,
                    address: selectedToken.tokenAddress,
                    currentRate: selectedToken.currentRate,
                    usdPrice: selectedToken.usdPrice ?? (selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0),
                  }
                  : {
                    name: borrowedPositions[0]?.name || "",
                    icon: borrowedPositions[0]?.icon || "",
                    address: borrowedPositions[0]?.tokenAddress || "",
                    currentRate: borrowedPositions[0]?.currentRate || 0,
                    usdPrice: borrowedPositions[0]?.usdPrice
                      ?? (borrowedPositions[0]?.tokenPrice ? Number(borrowedPositions[0]?.tokenPrice) / 1e8 : 0),
                  }
              }
              protocolName={protocolName}
              currentDebt={
                selectedToken
                  ? Number(selectedToken.tokenBalance) / 10 ** (selectedToken.tokenDecimals || 18)
                  : borrowedPositions[0]
                    ? Number(borrowedPositions[0].tokenBalance) / 10 ** (borrowedPositions[0].tokenDecimals || 18)
                    : 0
              }
              position={positionManager}
              chainId={chainId}
            />
          )}
        </>
      ) : null}
    </div>
  );
};

// Added display name to fix linting issue
HealthStatus.displayName = "HealthStatus";
ProtocolView.displayName = "ProtocolView";

export const ExampleProtocolView: FC = () => {
  const exampleSuppliedPositions: ProtocolPosition[] = [
    {
      icon: "/logos/ethereum-logo.svg",
      name: "ETH",
      balance: 5000.75,
      tokenBalance: BigInt(2.5 * 10 ** 18),
      currentRate: 2.8,
      tokenAddress: "0x0000000000000000000000000000000000000000",
    },
  ];

  const exampleBorrowedPositions: ProtocolPosition[] = [
    {
      icon: "/logos/dai-logo.svg",
      name: "DAI",
      balance: -2500.25,
      tokenBalance: BigInt(2500.25 * 10 ** 18),
      currentRate: 4.2,
      tokenAddress: "0x0000000000000000000000000000000000000000",
    },
    {
      icon: "/logos/usdc-logo.svg",
      name: "USDC",
      balance: -1000.5,
      tokenBalance: BigInt(1000.5 * 10 ** 6), // USDC has 6 decimals
      currentRate: 3.5,
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    },
  ];

  return (
    <ProtocolView
      protocolName="Aave V3"
      protocolIcon="/logos/aave-logo.svg"
      ltvBps={6500n}
      lltvBps={8000n}
      suppliedPositions={exampleSuppliedPositions}
      borrowedPositions={exampleBorrowedPositions}
      networkType="evm"
    />
  );
};

ExampleProtocolView.displayName = "ExampleProtocolView";
