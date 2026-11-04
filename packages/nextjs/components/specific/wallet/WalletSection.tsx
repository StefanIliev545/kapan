"use client";
import { FC, useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon, ArrowsRightLeftIcon, ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { useWalletTokens, type WalletToken } from "~~/hooks/useWalletTokens";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { LoadingSpinner } from "~~/components/common/Loading";
import { is1inchSupported } from "~~/utils/chainFeatures";
import { TokenIcon } from "~~/components/common/TokenDisplay";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import { UsdDisplay } from "~~/components/common/AmountDisplay";
import { useGlobalState } from "~~/services/store/store";
import { useTxCompletedListenerDelayed } from "~~/hooks/common/useTxCompletedListener";
// Lazy load modals
const WalletSwapModal = dynamic(
  () => {
    return import("~~/components/modals/WalletSwapModal").then((m) => {
      return m.WalletSwapModal;
    });
  },
  {
    ssr: false,
  },
);
const BridgeModal = dynamic(
  () => {
    return import("~~/components/modals/BridgeModal").then((m) => {
      return m.BridgeModal;
    });
  },
  {
    ssr: false,
  },
);
// Animation constants
const COLLAPSE_TRANSITION = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1] as const,
};
const COLLAPSE_INITIAL = {
  opacity: 0,
  height: 0,
};
const COLLAPSE_ANIMATE = {
  opacity: 1,
  height: "auto",
};
// Chains that LI.FI supports for bridging (subset of Kapan's chains)
const BRIDGEABLE_CHAINS = new Set([1, 42161, 8453, 10, 59144]); // mainnet, arbitrum, base, optimism, linea
/** Truncate raw balance to ~half the decimal places for compact display */
function truncateBalance(value: number): string {
  if (value === 0) {
    return "0";
  }
  const abs = Math.abs(value);
  // For large values (>1000), show 1 decimal; for medium (>1), show 2; for small, show 3-4
  const maxDecimals = abs >= 1000 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: maxDecimals,
  });
}
interface WalletSectionProps {
  chainId?: number;
  defaultExpanded?: boolean;
}
interface WalletTokenCardProps {
  token: WalletToken;
  canSwap: boolean;
  canBridge: boolean;
  onSwapClick: (token: WalletToken) => void;
  onBridgeClick: (token: WalletToken) => void;
}
const WalletTokenCard: FC<WalletTokenCardProps> = ({ token, canSwap, canBridge, onSwapClick, onBridgeClick }) => {
  const showSwap = canSwap;
  const showBridge = canBridge;
  const handleSwap = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSwapClick(token);
    },
    [token, onSwapClick],
  );
  const handleBridge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBridgeClick(token);
    },
    [token, onBridgeClick],
  );
  const hasYield = token.externalYield && token.externalYield.apy > 0;
  const isPT = token.symbol.toLowerCase().startsWith("pt-");
  const isSyrup = token.symbol.toLowerCase().startsWith("syrup");
  const truncatedBalance = useMemo(() => {
    return truncateBalance(token.balanceFormatted);
  }, [token.balanceFormatted]);
  return (
    <div className="group/token hover:bg-base-200/60 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors">
      {/* Token icon */}
      <TokenIcon icon={token.icon} symbol={token.symbol} customSize={24} />

      {/* Token info: symbol + USD inline, raw balance below */}
      <div className="flex min-w-0 flex-1 flex-col" title={`${token.balanceFormatted} ${token.symbol}`}>
        <div className="flex items-baseline gap-1.5">
          <span className="min-w-0 truncate">
            <TokenSymbolDisplay symbol={token.symbol} size="xs" variant="inline" />
          </span>
          {token.source === "indexed" && <span className="text-warning text-[10px]">Unverified</span>}
          {token.valuationAvailable === false && (
            <span className="text-base-content/60 text-[10px]">Value unavailable</span>
          )}
          {token.usdValue > 0 ? (
            <UsdDisplay
              value={token.usdValue}
              className="text-base-content/60 flex-shrink-0 text-[11px] font-semibold"
            />
          ) : null}
        </div>
        <span className="text-base-content/60 font-mono text-[9px] tabular-nums leading-tight">
          {token.balanceFormatted > 0 ? truncatedBalance : "—"}
        </span>
      </div>

      {/* Yield badge */}
      {hasYield && (
        <span
          className={`shrink-0 rounded px-1 py-px text-[8px] font-semibold leading-none ${isPT ? "bg-info/10 text-info" : isSyrup ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}
        >
          {isPT ? "F " : ""}
          {token.externalYield!.apy.toFixed(1)}%
        </span>
      )}

      {/* Action buttons — icon-only by default, expand to show label on hover */}
      {(showSwap || showBridge) && (
        <div className="flex flex-shrink-0 items-center gap-px">
          {showSwap && (
            <button
              onClick={handleSwap}
              className="group/btn text-base-content/60 hover:bg-primary/15 hover:text-primary flex h-6 items-center gap-0 overflow-hidden rounded transition-all duration-200 ease-out hover:gap-1 hover:px-1.5"
              style={{
                maxWidth: "24px",
                transitionProperty: "max-width, background-color, color, gap, padding",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.maxWidth = "80px";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.maxWidth = "24px";
              }}
              aria-label={`Swap ${token.symbol}`}
            >
              <ArrowsRightLeftIcon className="size-3 shrink-0" />
              <span className="whitespace-nowrap text-[10px] font-medium opacity-0 transition-opacity duration-150 group-hover/btn:opacity-100">
                Swap
              </span>
            </button>
          )}
          {showBridge && (
            <button
              onClick={handleBridge}
              className="group/btn text-base-content/60 hover:bg-info/15 hover:text-info flex h-6 items-center gap-0 overflow-hidden rounded transition-all duration-200 ease-out hover:gap-1 hover:px-1.5"
              style={{
                maxWidth: "24px",
                transitionProperty: "max-width, background-color, color, gap, padding",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.maxWidth = "80px";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.maxWidth = "24px";
              }}
              aria-label={`Bridge ${token.symbol}`}
            >
              <ArrowsUpDownIcon className="size-3 shrink-0" />
              <span className="whitespace-nowrap text-[10px] font-medium opacity-0 transition-opacity duration-150 group-hover/btn:opacity-100">
                Bridge
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
export const WalletSection: FC<WalletSectionProps> = ({ chainId, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const {
    tokens,
    isLoading,
    isError: isDiscoveryIncomplete,
    totalValue,
    tokenCount,
    refetch,
    unresolvedHoldings = [],
    visibilityScope = String(chainId ?? 1),
    valuationAvailable = true,
  } = useWalletTokens(chainId);
  const [hidden, setHidden] = useState<Set<string>>(() => {
    return new Set();
  });
  const [revealedScope, setRevealedScope] = useState<string | null>(null);
  const identity = (address: string) => {
    return `${visibilityScope}:${address.toLowerCase()}`;
  };
  const visibleTokens = tokens.filter((token) => {
    return !hidden.has(identity(token.address));
  });
  const visibleUnresolved = unresolvedHoldings.filter((holding) => {
    return !hidden.has(identity(holding.address));
  });
  const hiddenHoldings = [...tokens, ...unresolvedHoldings].filter((holding) => {
    return hidden.has(identity(holding.address));
  });
  const isFiltered = hiddenHoldings.length > 0;
  const displayedCount = visibleTokens.length + visibleUnresolved.length;
  const displayedValue = visibleTokens.reduce((sum, token) => {
    return sum + token.usdValue;
  }, 0);
  const hasAvailableTokens = tokens.length + unresolvedHoldings.length > 0;
  const hideTotals = isLoading || !valuationAvailable || (isDiscoveryIncomplete && !hasAvailableTokens);
  const changeVisibility = (address: string, hide: boolean) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (hide) {
        next.add(identity(address));
      } else {
        next.delete(identity(address));
      }
      return next;
    });
  };
  const setProtocolTotals = useGlobalState((state) => {
    return state.setProtocolTotals;
  });
  // Refetch wallet tokens when any transaction completes (same as protocol sections)
  useTxCompletedListenerDelayed(
    useCallback(() => {
      refetch();
    }, [refetch]),
    2000,
  );
  // Report wallet value to the global portfolio balance
  useEffect(() => {
    if (isLoading || isDiscoveryIncomplete || !valuationAvailable) {
      return;
    }
    setProtocolTotals("Wallet", totalValue, 0);
  }, [isLoading, isDiscoveryIncomplete, valuationAvailable, totalValue, setProtocolTotals, chainId]);
  // Swap modal state
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapToken, setSwapToken] = useState<WalletToken | null>(null);
  // Bridge modal state
  const [bridgeModalOpen, setBridgeModalOpen] = useState(false);
  const [bridgeToken, setBridgeToken] = useState<WalletToken | null>(null);
  useEffect(() => {
    setSwapModalOpen(false);
    setSwapToken(null);
    setBridgeModalOpen(false);
    setBridgeToken(null);
  }, [visibilityScope]);
  const effectiveChainId = chainId ?? 1;
  const canSwap = is1inchSupported(effectiveChainId);
  const canBridge = BRIDGEABLE_CHAINS.has(effectiveChainId);
  // Handle swap
  const handleSwapClick = useCallback((token: WalletToken) => {
    setSwapToken(token);
    setSwapModalOpen(true);
  }, []);
  const handleSwapClose = useCallback(() => {
    setSwapModalOpen(false);
    setSwapToken(null);
  }, []);
  const handleSwapSuccess = useCallback(() => {
    refetch();
  }, [refetch]);
  // Handle bridge
  const handleBridgeClick = useCallback((token: WalletToken) => {
    setBridgeToken(token);
    setBridgeModalOpen(true);
  }, []);
  const handleBridgeClose = useCallback(() => {
    setBridgeModalOpen(false);
    setBridgeToken(null);
  }, []);
  return (
    <>
      <div className="header-surface shadow-[inset_3px_0_0_0_rgba(255,255,255,0.12)]">
        {/* Header */}
        <button
          type="button"
          aria-label="Toggle wallet holdings"
          aria-expanded={isExpanded}
          className="w-full cursor-pointer px-4 py-3 text-left sm:px-5"
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Icon + Title */}
            <div className="flex items-center gap-2.5 sm:min-w-[150px]">
              <div className="token-icon-wrapper-md">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-base-content/60 size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight sm:text-lg">Wallet</span>
            </div>

            {/* Divider */}
            <div className="via-base-300/60 hidden h-12 w-px bg-gradient-to-b from-transparent to-transparent sm:block" />

            {/* Stats */}
            <div className="flex flex-1 items-center gap-8 sm:gap-12">
              <div className="flex flex-col items-center gap-1">
                <span className="header-label">
                  {isFiltered
                    ? "Displayed balance (filtered)"
                    : isDiscoveryIncomplete
                      ? "Balance (incomplete)"
                      : "Balance"}
                </span>
                <span className="text-success header-value">
                  {hideTotals ? "—" : formatCurrencyCompact(isFiltered ? displayedValue : totalValue)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="header-label">
                  {isFiltered
                    ? "Displayed tokens (filtered)"
                    : isDiscoveryIncomplete
                      ? "Tokens (incomplete)"
                      : "Tokens"}
                </span>
                <span className="header-value">
                  {isLoading || (isDiscoveryIncomplete && !hasAvailableTokens)
                    ? "—"
                    : isFiltered
                      ? displayedCount
                      : tokenCount}
                </span>
              </div>
            </div>

            {/* Expand icon */}
            <ChevronDownIcon
              className={`text-base-content/60 size-5 transition-transform duration-300 ${isExpanded ? "" : "-rotate-90"}`}
            />
          </div>
        </button>

        {!valuationAvailable && (
          <div className="px-4 py-2 text-xs text-warning">
            Wallet valuation unavailable. Some holdings lack a current balance, decimals or price.
          </div>
        )}
        {isFiltered && (
          <div className="px-4 py-2 text-xs">
            {hiddenHoldings.length} hidden by you. Displayed statistics are filtered; portfolio aggregation uses all
            holdings.
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                setRevealedScope(revealedScope === visibilityScope ? null : visibilityScope);
              }}
            >
              {revealedScope === visibilityScope ? "Conceal hidden tokens" : "Show hidden tokens"}
            </button>
            {revealedScope === visibilityScope &&
              hiddenHoldings.map((holding) => {
                return (
                  <div key={holding.address} className="flex items-center gap-2" title={holding.address}>
                    <span>{holding.address} — Hidden by you</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        changeVisibility(holding.address, false);
                      }}
                    >
                      Restore {holding.address}
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        {isDiscoveryIncomplete && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-t border-warning/20 bg-warning/5 px-4 py-2 text-xs text-warning"
          >
            <span>
              {hasAvailableTokens
                ? "Wallet discovery is incomplete. Available tokens are shown; balances and token count may be partial."
                : "Wallet discovery is incomplete. Tokens and balances could not be fully loaded."}
            </span>
            <button type="button" className="btn btn-ghost btn-xs shrink-0" onClick={refetch} disabled={isLoading}>
              Retry
            </button>
          </div>
        )}

        {/* Collapsible Content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={COLLAPSE_INITIAL}
              animate={COLLAPSE_ANIMATE}
              exit={COLLAPSE_INITIAL}
              transition={COLLAPSE_TRANSITION}
              className="overflow-hidden"
            >
              <div className="border-base-300/50 border-t">
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : !hasAvailableTokens ? (
                  <div className="text-base-content/50 py-6 text-center text-sm">
                    {isDiscoveryIncomplete ? "Token list unavailable" : "No tokens found in wallet"}
                  </div>
                ) : (
                  <div
                    className="grid gap-x-1 gap-y-0.5 p-2"
                    style={{
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    }}
                  >
                    {visibleTokens.map((token) => {
                      return (
                        <div key={token.address}>
                          <WalletTokenCard
                            token={token}
                            canSwap={canSwap}
                            canBridge={canBridge}
                            onSwapClick={handleSwapClick}
                            onBridgeClick={handleBridgeClick}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            aria-label={`Hide ${token.symbol}`}
                            onClick={() => {
                              changeVisibility(token.address, true);
                              setSwapToken(null);
                              setBridgeToken(null);
                            }}
                          >
                            Hide
                          </button>
                        </div>
                      );
                    })}
                    {visibleUnresolved.map((holding) => {
                      return (
                        <div
                          key={holding.address}
                          className="rounded-lg bg-base-200/40 p-2 text-xs"
                          title={holding.address}
                        >
                          <div>{holding.address} — Unverified</div>
                          <div>Amount and value unavailable ({holding.reason})</div>
                          <div>
                            Raw balance: {holding.rawBalance ?? "unavailable"}
                            {holding.reason === "balance" && holding.rawBalance !== null
                              ? " (indexed, stale/unverified)"
                              : ""}
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            aria-label={`Hide ${holding.address}`}
                            onClick={() => {
                              changeVisibility(holding.address, true);
                            }}
                          >
                            Hide
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Swap Modal */}
      {swapToken && (
        <WalletSwapModal
          isOpen={swapModalOpen}
          onClose={handleSwapClose}
          chainId={effectiveChainId}
          fromToken={swapToken}
          walletTokens={visibleTokens}
          onSuccess={handleSwapSuccess}
        />
      )}

      {/* Bridge Modal (LI.FI) */}
      {bridgeToken && (
        <BridgeModal
          isOpen={bridgeModalOpen}
          onClose={handleBridgeClose}
          chainId={effectiveChainId}
          fromToken={bridgeToken.address}
        />
      )}
    </>
  );
};
export default WalletSection;
