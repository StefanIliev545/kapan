"use client";

import { FC, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useWalletTokens, type WalletToken } from "~~/hooks/useWalletTokens";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { LoadingSpinner } from "~~/components/common/Loading";
import { is1inchSupported } from "~~/utils/chainFeatures";
import { TokenIcon } from "~~/components/common/TokenDisplay";
import { UsdDisplay } from "~~/components/common/AmountDisplay";
import { useGlobalState } from "~~/services/store/store";

// Lazy load the swap modal
const WalletSwapModal = dynamic(
  () => import("~~/components/modals/WalletSwapModal").then(m => m.WalletSwapModal),
  { ssr: false }
);

// Animation constants
const COLLAPSE_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };
const COLLAPSE_INITIAL = { opacity: 0, height: 0 };
const COLLAPSE_ANIMATE = { opacity: 1, height: "auto" };

interface WalletSectionProps {
  chainId?: number;
  defaultExpanded?: boolean;
}

interface WalletTokenCardProps {
  token: WalletToken;
  canSwap: boolean;
  onSwapClick: (token: WalletToken) => void;
}

const WalletTokenCard: FC<WalletTokenCardProps> = ({ token, canSwap, onSwapClick }) => {
  const isNativeETH = token.address === "0x0000000000000000000000000000000000000000";
  const showSwap = canSwap && !isNativeETH;

  const handleClick = useCallback(() => {
    if (showSwap) onSwapClick(token);
  }, [showSwap, token, onSwapClick]);

  const hasYield = token.externalYield && token.externalYield.apy > 0;
  const isPT = token.symbol.toLowerCase().startsWith("pt-");
  const isSyrup = token.symbol.toLowerCase().startsWith("syrup");

  return (
    <div
      onClick={handleClick}
      className={`group bg-base-100 border-base-300/50 hover:border-base-content/15 hover:bg-base-200/60 flex items-center gap-2 overflow-hidden rounded-lg border p-2 transition-all ${showSwap ? "cursor-pointer" : ""}`}
    >
      {/* Icon */}
      <TokenIcon icon={token.icon} symbol={token.symbol} customSize={24} />

      {/* Symbol + yield badge */}
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-sm font-medium">{token.symbol}</span>
        {hasYield && (
          <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold leading-none ${
            isPT ? "bg-info/10 text-info"
              : isSyrup ? "bg-warning/10 text-warning"
              : "bg-success/10 text-success"
          }`}>
            {isPT ? "F " : ""}{token.externalYield!.apy.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Swap label — fades in on hover */}
      {showSwap && (
        <span className="text-primary shrink-0 text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
          Swap
        </span>
      )}

      {/* USD value — always visible, tooltip shows token balance */}
      <div className="shrink-0" title={`${token.balanceFormatted} ${token.symbol}`}>
        {token.usdValue > 0 ? (
          <UsdDisplay value={token.usdValue} className="text-[11px] text-base-content/50" />
        ) : (
          <span className="text-[11px] text-base-content/30">-</span>
        )}
      </div>
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

  const effectiveChainId = chainId ?? 1;
  const canSwap = is1inchSupported(effectiveChainId);

  // Handle swap button click
  const handleSwapClick = useCallback((token: WalletToken) => {
    setSwapToken(token);
    setSwapModalOpen(true);
  }, []);

  // Handle swap modal close
  const handleSwapClose = useCallback(() => {
    setSwapModalOpen(false);
    setSwapToken(null);
  }, []);

  // Handle swap success - refresh balances
  const handleSwapSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <>
      <div className="card-surface-interactive border-t-primary/40 border-t-[3px] shadow-lg sm:border-t-0 sm:border-l-[3px] sm:border-l-primary/40" onClick={() => setIsExpanded(!isExpanded)}>
        {/* Header - matches BaseProtocolHeader structure */}
        <div className="card-body px-3 py-1.5 sm:px-5 sm:py-2">
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
                  <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 md:grid-cols-4">
                    {tokens.map((token) => (
                      <WalletTokenCard
                        key={token.address}
                        token={token}
                        canSwap={canSwap}
                        onSwapClick={handleSwapClick}
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
    </>
  );
};

export default WalletSection;
