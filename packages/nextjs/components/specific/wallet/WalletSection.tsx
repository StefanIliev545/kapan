"use client";

import { FC, useState, useCallback } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { useWalletTokens, type WalletToken } from "~~/hooks/useWalletTokens";
import { formatCurrencyCompact } from "~~/utils/formatNumber";
import { LoadingSpinner } from "~~/components/common/Loading";
import { is1inchSupported } from "~~/utils/chainFeatures";

// Lazy load the swap modal
const WalletSwapModal = dynamic(
  () => import("~~/components/modals/WalletSwapModal").then(m => m.WalletSwapModal),
  { ssr: false }
);

// Animation constants
const COLLAPSE_TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };
const COLLAPSE_INITIAL = { opacity: 0, height: 0 };
const COLLAPSE_ANIMATE = { opacity: 1, height: "auto" };

// CSS class constants
const TEXT_MUTED = "text-base-content/40";

interface WalletSectionProps {
  chainId?: number;
  defaultExpanded?: boolean;
}

// Static image error handler
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).src = "/logos/default.svg";
};

/**
 * Format a number with appropriate precision
 */
function formatBalance(value: number): string {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (value >= 0.0001) return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return "<0.0001";
}

/**
 * Format USD value
 */
function formatUsd(value: number): string {
  if (value < 0.01) return "<$0.01";
  return formatCurrencyCompact(value);
}

/**
 * Check if token is a Pendle PT token
 */
function isPTToken(symbol: string): boolean {
  return symbol.toLowerCase().startsWith("pt-");
}

/**
 * Check if token is a Maple syrup token
 */
function isSyrupToken(symbol: string): boolean {
  const lower = symbol.toLowerCase();
  return lower.startsWith("syrup");
}

/**
 * Token row component
 */
interface TokenRowProps {
  token: WalletToken;
  canSwap: boolean;
  onSwapClick: (token: WalletToken) => void;
}

const TokenRow: FC<TokenRowProps> = ({ token, canSwap, onSwapClick }) => {
  const hasYield = token.externalYield && token.externalYield.apy > 0;
  const isPT = isPTToken(token.symbol);
  const isSyrup = isSyrupToken(token.symbol);
  const isNativeETH = token.address === "0x0000000000000000000000000000000000000000";

  const handleSwapClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSwapClick(token);
  }, [token, onSwapClick]);

  return (
    <tr className="hover:bg-base-200/50 transition-colors">
      {/* Token */}
      <td className="py-1.5 pl-3">
        <div className="flex items-center gap-2">
          <Image
            src={token.icon}
            alt={token.symbol}
            width={20}
            height={20}
            className="rounded-full"
            onError={handleImageError}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{token.symbol}</span>
            {hasYield && (
              <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${
                isPT
                  ? "bg-info/10 text-info"
                  : isSyrup
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success"
              }`}>
                {isPT ? "Fixed " : ""}{token.externalYield!.apy.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Balance */}
      <td className="py-1.5 text-right">
        <span className="font-mono text-xs">{formatBalance(token.balanceFormatted)}</span>
      </td>

      {/* USD Value */}
      <td className="py-1.5 text-right">
        {token.usdValue > 0 ? (
          <span className="text-xs font-medium">{formatUsd(token.usdValue)}</span>
        ) : (
          <span className={`text-xs ${TEXT_MUTED}`}>-</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-1.5 pr-3 text-right">
        {canSwap && !isNativeETH && (
          <button
            onClick={handleSwapClick}
            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 gap-1"
            title="Swap token"
          >
            <ArrowsRightLeftIcon className="size-3" />
            <span className="hidden sm:inline">Swap</span>
          </button>
        )}
      </td>
    </tr>
  );
};

export const WalletSection: FC<WalletSectionProps> = ({
  chainId,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { tokens, isLoading, totalValue, tokenCount, refetch } = useWalletTokens(chainId);

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

  // Don't render if no tokens and not loading
  const shouldRender = isLoading || tokenCount > 0;

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <div className="card-surface-interactive shadow-lg">
        {/* Header - compact like other protocol views */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center gap-3 px-3 py-2 sm:gap-4 sm:px-5"
        >
          {/* Icon + Title */}
          <div className="flex items-center gap-2">
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
          <div className="via-base-300 hidden h-6 w-px bg-gradient-to-b from-transparent to-transparent sm:block" />

          {/* Stats */}
          <div className="flex flex-1 items-center gap-4 sm:gap-6">
            <div className="flex flex-col">
              <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider sm:text-[9px]">Tokens</span>
              <span className="font-mono text-xs font-bold tabular-nums">
                {isLoading ? "—" : tokenCount}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-base-content/40 text-[8px] font-medium uppercase tracking-wider sm:text-[9px]">Value</span>
              <span className="text-success font-mono text-xs font-bold tabular-nums">
                {isLoading ? "—" : formatCurrencyCompact(totalValue)}
              </span>
            </div>
          </div>

          {/* Expand icon */}
          <ChevronDownIcon
            className={`text-base-content/40 size-4 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
          />
        </button>

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
                  <table className="w-full">
                    <thead>
                      <tr className="border-base-300/50 border-b text-[10px]">
                        <th className="text-base-content/50 py-1.5 pl-3 text-left font-medium">Token</th>
                        <th className="text-base-content/50 py-1.5 text-right font-medium">Balance</th>
                        <th className="text-base-content/50 py-1.5 text-right font-medium">Value</th>
                        <th className="text-base-content/50 py-1.5 pr-3 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-base-200/50 divide-y">
                      {tokens.map((token) => (
                        <TokenRow
                          key={token.address}
                          token={token}
                          canSwap={canSwap}
                          onSwapClick={handleSwapClick}
                        />
                      ))}
                    </tbody>
                  </table>
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
