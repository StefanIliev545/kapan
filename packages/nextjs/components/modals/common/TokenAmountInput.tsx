"use client";

import { type FC, useCallback } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import type { SwapAsset } from "../SwapModalShell";

export interface TokenAmountInputProps {
    /** Label for the section (e.g., "Swap From", "Debt to Repay") */
    label: string;
    /** Selected token */
    selectedToken: SwapAsset | null;
    /** All available tokens for selection */
    availableTokens: SwapAsset[];
    /** Callback when token changes */
    onTokenChange?: (token: SwapAsset) => void;
    /** Whether the token selector is read-only */
    readOnly?: boolean;
    /** Amount value */
    amount: string;
    /** Callback when amount changes */
    onAmountChange?: (value: string) => void;
    /** Whether this is an output field (read-only amount) */
    isOutput?: boolean;
    /** Loading state for output */
    isLoading?: boolean;
    /** USD value to display */
    usdValue?: number;
    /** Show MAX button */
    showMax?: boolean;
    /** Callback when MAX is clicked */
    onMaxClick?: () => void;
    /** Show available balance */
    showBalance?: boolean;
}

export const TokenAmountInput: FC<TokenAmountInputProps> = ({
    label,
    selectedToken,
    availableTokens,
    onTokenChange,
    readOnly = false,
    amount,
    onAmountChange,
    isOutput = false,
    isLoading = false,
    usdValue,
    showMax = false,
    onMaxClick,
    showBalance = true,
}) => {
    const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (onAmountChange) {
            onAmountChange(e.target.value);
        }
    }, [onAmountChange]);

    const handleTokenChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const token = availableTokens.find(t => t.symbol === e.target.value);
        if (token && onTokenChange) {
            onTokenChange(token);
        }
    }, [availableTokens, onTokenChange]);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-base-content/80 text-sm">{label}</span>
                {showBalance && selectedToken && (
                    <span className="text-base-content/60 text-xs">
                        Available: {formatUnits(selectedToken.rawBalance, selectedToken.decimals)}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-3">
                {selectedToken && (
                    <div className="relative size-8 flex-shrink-0">
                        <Image
                            src={selectedToken.icon}
                            alt={selectedToken.symbol}
                            fill
                            className="rounded-full object-contain"
                        />
                    </div>
                )}

                {/* Token Selector */}
                {readOnly || availableTokens.length <= 1 ? (
                    <div className="min-w-[100px] font-medium">
                        {selectedToken?.symbol || "-"}
                    </div>
                ) : (
                    <div className="relative min-w-[100px]">
                        <select
                            className="select select-ghost select-sm w-full max-w-xs pl-0 font-medium focus:outline-none"
                            value={selectedToken?.symbol || ""}
                            onChange={handleTokenChange}
                        >
                            {availableTokens.map(t => (
                                <option key={t.address} value={t.symbol}>
                                    {t.symbol}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Amount Input / Output */}
                <div className="relative flex-1">
                    {isOutput ? (
                        <div className="border-base-300 flex min-h-[32px] w-full items-center justify-end border-0 border-b-2 bg-transparent px-2 py-1 text-right font-medium outline-none">
                            {isLoading ? (
                                <span className="loading loading-dots loading-xs" />
                            ) : (
                                Number.parseFloat(amount || "0").toFixed(6)
                            )}
                        </div>
                    ) : (
                        <>
                            <input
                                type="number"
                                value={amount}
                                onChange={handleAmountChange}
                                placeholder="0.00"
                                className="border-base-300 w-full border-0 border-b-2 bg-transparent px-2 py-1 pr-16 text-right font-medium outline-none"
                            />
                            {showMax && onMaxClick && (
                                <button
                                    onClick={onMaxClick}
                                    className="text-primary hover:text-primary-focus absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold"
                                >
                                    MAX
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* USD Value */}
            {usdValue !== undefined && (
                <div className="flex justify-end">
                    <span className="text-base-content/60 text-xs">
                        {"\u2248"} ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            )}
        </div>
    );
};

export default TokenAmountInput;
