"use client";

import { FC, useState, useCallback, useEffect } from "react";
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

// Lazy load modals
const WalletSwapModal = dynamic(
  () => import("~~/components/modals/WalletSwapModal").then(m => m.WalletSwapModal),
  { ssr: false }
);
const BridgeModal = dynamic(
  () => import("~~/components/modals/BridgeModal").then(m => m.BridgeModal),
  { ssr: false }
);

// Animation constants
const COLLAPSE_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };
const COLLAPSE_INITIAL = { opacity: 0, height: 0 };
const COLLAPSE_ANIMATE = { opacity: 1, height: "auto" };

// Chains that LI.FI supports for bridging (subset of Kapan's chains)
const BRIDGEABLE_CHAINS = new Set([1, 42161, 8453, 10, 59144]); // mainnet, arbitrum, base, optimism, linea

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
  const isNativeETH = token.address === "0x0000000000000000000000000000000000000000";
  const showSwap = canSwap && !isNativeETH;
  // Native ETH can be bridged but uses a special address in LI.FI
  const showBridge = canBridge;
  const showActions = showSwap || showBridge;

  const handleSwap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSwapClick(token);
  }, [token, onSwapClick]);

  const handleBridge = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onBridgeClick(token);
  }, [token, onBridgeClick]);

  const hasYield = token.externalYield && token.externalYield.apy > 0;
  const isPT = token.symbol.toLowerCase().startsWith("pt-");
  const isSyrup = token.symbol.toLowerCase().startsWith("syrup");

  return (
    <div className={`group relative overflow-hidden rounded-xl border border-base-300/50 bg-base-100 px-3.5 py-3 transition-colors hover:border-base-content/10 ${showActions ? "cursor-pointer" : ""}`}>
      {/* Card content — blurs on hover when actions available */}
      <div className={`flex flex-col gap-2.5 transition-all duration-200 ${showActions ? "group-hover:opacity-20 group-hover:blur-[3px]" : ""}`}>
        {/* Row 1: Icon + Symbol */}
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenIcon icon={token.icon} symbol={token.symbol} customSize={28} />
          <div className="min-w-0 flex-1">
            <TokenSymbolDisplay symbol={token.symbol} size="sm" variant="inline" />
          </div>
        </div>

        {/* Row 2: USD value + raw balance + yield badge */}
        <div className="flex min-w-0 items-center gap-2 pl-[38px]">
          <div className="min-w-0 truncate" title={`${token.balanceFormatted} ${token.symbol}`}>
            {token.usdValue > 0 ? (
              <span className="flex items-baseline gap-1.5">
                <UsdDisplay value={token.usdValue} className="text-sm font-semibold text-base-content" />
                <span className="text-base-content/35 text-xs">{token.balanceFormatted}</span>
              </span>
            ) : (
              <span className="text-sm text-base-content/50">{token.balanceFormatted > 0 ? token.balanceFormatted : "-"}</span>
            )}
          </div>

          <div className="flex-1" />

          {hasYield && (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
              isPT ? "bg-info/10 text-info"
                : isSyrup ? "bg-warning/10 text-warning"
                : "bg-success/10 text-success"
            }`}>
              {isPT ? "F " : ""}{token.externalYield!.apy.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Action overlay — appears on hover */}
      {showActions && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {showSwap && (
            <button
              onClick={handleSwap}
              className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3.5 py-2 text-primary transition-colors hover:bg-primary/20"
            >
              <ArrowsRightLeftIcon className="size-4" />
              <span className="text-sm font-semibold">Swap</span>
            </button>
          )}
          {showBridge && (
            <button
              onClick={handleBridge}
              className="flex items-center gap-1.5 rounded-lg bg-info/10 px-3.5 py-2 text-info transition-colors hover:bg-info/20"
            >
              <ArrowsUpDownIcon className="size-4" />
              <span className="text-sm font-semibold">Bridge</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const WalletSection: FC<WalletSectionProps> = ({
  chainId,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { tokens, isLoading, totalValue, tokenCount, refetch } = useWalletTokens(chainId);
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  // Report wallet value to the global portfolio balance
  useEffect(() => {
    if (isLoading) return;
    setProtocolTotals("Wallet", totalValue, 0);
  }, [isLoading, totalValue, setProtocolTotals, chainId]);

  // Swap modal state
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapToken, setSwapToken] = useState<WalletToken | null>(null);

  // Bridge modal state
  const [bridgeModalOpen, setBridgeModalOpen] = useState(false);
  const [bridgeToken, setBridgeToken] = useState<WalletToken | null>(null);

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
      <div className="card-surface-interactive border-t-primary/40 border-t-[3px] shadow-lg sm:border-t-0 sm:border-l-[3px] sm:border-l-primary/40">
        {/* Header - matches BaseProtocolHeader structure */}
        <div className="card-body cursor-pointer px-3 py-1.5 sm:px-5 sm:py-2" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Icon + Title — same fixed width as protocol headers */}
            <div className="flex items-center gap-2 sm:min-w-[130px]">
              <div className="bg-base-300/50 flex size-6 items-center justify-center rounded-md">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-base-content/70 size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <span className="text-sm font-bold">Wallet</span>
            </div>

            {/* Divider */}
            <div className="via-base-300 hidden h-8 w-px bg-gradient-to-b from-transparent to-transparent sm:block" />

            {/* Stats — Balance first, then Tokens */}
            <div className="flex flex-1 items-center gap-6 sm:gap-10">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider sm:text-[9px]">Balance</span>
                <span className="text-success font-mono text-[11px] font-bold tabular-nums">
                  {isLoading ? "—" : formatCurrencyCompact(totalValue)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider sm:text-[9px]">Tokens</span>
                <span className="font-mono text-[11px] font-bold tabular-nums">
                  {isLoading ? "—" : tokenCount}
                </span>
              </div>
            </div>

            {/* Expand icon */}
            <ChevronDownIcon
              className={`text-base-content/40 size-4 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
            />
          </div>
        </div>

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
                ) : tokens.length === 0 ? (
                  <div className="text-base-content/50 py-6 text-center text-sm">
                    No tokens found in wallet
                  </div>
                ) : (
                  <div className="grid gap-2.5 p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                    {tokens.map((token) => (
                      <WalletTokenCard
                        key={token.address}
                        token={token}
                        canSwap={canSwap}
                        canBridge={canBridge}
                        onSwapClick={handleSwapClick}
                        onBridgeClick={handleBridgeClick}
                      />
                    ))}
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
          walletTokens={tokens}
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
