"use client";

import { FC, ReactNode } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";
import { LimitOrderConfig, type LimitOrderResult } from "~~/components/LimitOrderConfig";
import { SlippageSelector } from "./SwapStatsGrid";

export interface LimitOrderSectionProps {
    /** Chain ID for LimitOrderConfig */
    chainId: number;
    /** Sell token info */
    sellToken: {
        symbol: string;
        decimals: number;
        address: string;
    } | null;
    /** Total amount for the order */
    totalAmount: bigint;
    /** Callback when config changes */
    onConfigChange: (config: LimitOrderResult) => void;
    /** Current limit order config (for chunk display) */
    limitOrderConfig?: LimitOrderResult | null;
    /** Whether CoW quote is loading */
    isCowQuoteLoading?: boolean;
    /** Current slippage */
    slippage?: number;
    /** Callback to set slippage */
    setSlippage?: (value: number) => void;
    /** Show slippage selector */
    showSlippage?: boolean;
    /** Show batched TX toggle */
    showBatchedToggle?: boolean;
    /** Current batched TX preference */
    useBatchedTx?: boolean;
    /** Callback to set batched TX preference */
    setUseBatchedTx?: (value: boolean) => void;
    /** Additional content to display */
    extraContent?: ReactNode;
    /** Additional class name */
    className?: string;
}

export const LimitOrderSection: FC<LimitOrderSectionProps> = ({
    chainId,
    sellToken,
    totalAmount,
    onConfigChange,
    limitOrderConfig,
    isCowQuoteLoading,
    slippage,
    setSlippage,
    showSlippage = false,
    showBatchedToggle = false,
    useBatchedTx,
    setUseBatchedTx,
    extraContent,
    className = "",
}) => {
    if (!sellToken) {
        return null;
    }

    const numChunks = limitOrderConfig?.numChunks ?? 1;

    return (
        <div className={`bg-base-200/50 space-y-2 rounded-lg p-3 ${className}`}>
            <div className="text-base-content/70 flex items-center gap-1 text-xs font-medium">
                <ClockIcon className="size-3.5" />
                Limit Order Configuration
            </div>

            <LimitOrderConfig
                chainId={chainId}
                sellToken={sellToken}
                totalAmount={totalAmount}
                onConfigChange={onConfigChange}
                showFlashLoanToggle={false}
                showChunksInput={true}
                compact
            />

            {/* Chunk Info - shown when multi-chunk */}
            {numChunks > 1 && (
                <ChunkInfo numChunks={numChunks} />
            )}

            {/* CoW Quote Loading */}
            {isCowQuoteLoading && (
                <div className="text-base-content/60 mt-2 flex items-center gap-2 text-xs">
                    <span className="loading loading-spinner loading-xs" />
                    Fetching CoW quote...
                </div>
            )}

            {/* Extra content (e.g., CoW quote info) */}
            {extraContent}

            {/* Slippage Selector */}
            {showSlippage && slippage !== undefined && setSlippage && (
                <div className="border-base-300/30 flex items-center justify-between border-t px-1 pt-2 text-xs">
                    <span className="text-base-content/70">Slippage Buffer</span>
                    <div className="flex items-center gap-2">
                        <span>{slippage}%</span>
                        <SlippageSelector slippage={slippage} setSlippage={setSlippage} />
                    </div>
                </div>
            )}

            {/* Batched TX Toggle */}
            {showBatchedToggle && setUseBatchedTx && (
                <BatchedTxToggle
                    useBatchedTx={useBatchedTx ?? false}
                    setUseBatchedTx={setUseBatchedTx}
                />
            )}
        </div>
    );
};

export interface ChunkInfoProps {
    numChunks: number;
    className?: string;
}

export const ChunkInfo: FC<ChunkInfoProps> = ({ numChunks, className = "" }) => {
    return (
        <div className={`mt-2 flex items-start gap-1.5 text-[10px] ${className}`}>
            <svg className="text-info mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <div>
                <span className="text-info font-medium">Multi-chunk: {numChunks} iterations</span>
                <p className="text-base-content/50 mt-0.5">
                    ~30 min between chunks for price discovery.
                </p>
            </div>
        </div>
    );
};

export interface BatchedTxToggleProps {
    useBatchedTx: boolean;
    setUseBatchedTx: (value: boolean) => void;
    className?: string;
}

export const BatchedTxToggle: FC<BatchedTxToggleProps> = ({
    useBatchedTx,
    setUseBatchedTx,
    className = "",
}) => {
    return (
        <div className={`border-base-300/30 mt-2 flex items-center justify-between border-t pt-2 ${className}`}>
            <div className="flex items-center gap-1.5">
                <span className="text-base-content/60 text-xs">Batched TX</span>
                <span className="text-base-content/40 text-[10px]">(EIP-5792)</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-base-content/40 text-[10px]">
                    {useBatchedTx ? "faster" : "compatible"}
                </span>
                <input
                    type="checkbox"
                    checked={useBatchedTx}
                    onChange={e => setUseBatchedTx(e.target.checked)}
                    className="toggle toggle-xs toggle-primary"
                />
            </div>
        </div>
    );
};

export interface LimitOrderInfoNoteProps {
    /** Number of chunks (1 = single transaction) */
    numChunks?: number;
    className?: string;
}

export const LimitOrderInfoNote: FC<LimitOrderInfoNoteProps> = ({
    numChunks = 1,
    className = "",
}) => {
    return (
        <div className={`border-base-300/30 text-base-content/50 mt-2 flex items-start gap-1.5 border-t pt-2 text-[10px] ${className}`}>
            <ClockIcon className="mt-0.5 size-3 shrink-0" />
            <span>
                {numChunks === 1
                    ? "Single transaction via CoW flash loan. MEV protected."
                    : `${numChunks} iterations. ~30 min between chunks. MEV protected.`
                }
            </span>
        </div>
    );
};

export default LimitOrderSection;
