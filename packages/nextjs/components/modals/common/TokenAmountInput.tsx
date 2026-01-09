"use client";

import { FC } from "react";
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
    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (onAmountChange) {
            onAmountChange(e.target.value);
        }
    };

    const handleTokenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const token = availableTokens.find(t => t.symbol === e.target.value);
        if (token && onTokenChange) {
            onTokenChange(token);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm text-base-content/80">{label}</span>
                {showBalance && selectedToken && (
                    <span className="text-xs text-base-content/60">
                        Available: {formatUnits(selectedToken.rawBalance, selectedToken.decimals)}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-3">
                {selectedToken && (
                    <div className="w-8 h-8 relative flex-shrink-0">
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
                    <div className="font-medium min-w-[100px]">
                        {selectedToken?.symbol || "-"}
                    </div>
                ) : (
                    <div className="relative min-w-[100px]">
                        <select
                            className="select select-ghost select-sm w-full max-w-xs font-medium pl-0 focus:outline-none"
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
                        <div className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 outline-none font-medium text-right min-h-[32px] flex items-center justify-end">
                            {isLoading ? (
                                <span className="loading loading-dots loading-xs"></span>
                            ) : (
                                parseFloat(amount || "0").toFixed(6)
                            )}
                        </div>
                    ) : (
                        <>
                            <input
                                type="number"
                                value={amount}
                                onChange={handleAmountChange}
                                placeholder="0.00"
                                className="w-full bg-transparent border-0 border-b-2 border-base-300 px-2 py-1 pr-16 outline-none font-medium text-right"
                            />
                            {showMax && onMaxClick && (
                                <button
                                    onClick={onMaxClick}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 text-primary text-xs font-bold hover:text-primary-focus"
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
                    <span className="text-xs text-base-content/60">
                        {"\u2248"} ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            )}
        </div>
    );
};

export default TokenAmountInput;
