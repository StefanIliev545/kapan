"use client";

import { FC, useCallback } from "react";

export type ExecutionType = "market" | "limit";

export interface ExecutionTypeToggleProps {
    /** Current execution type */
    value: ExecutionType;
    /** Callback when execution type changes */
    onChange: (type: ExecutionType) => void;
    /** Whether limit orders are available (e.g., CoW protocol supported) */
    limitAvailable?: boolean;
    /** Whether limit order is ready (contracts deployed, etc.) */
    limitReady?: boolean;
    /** Optional tooltip for disabled limit button */
    limitDisabledReason?: string;
    /** Additional class name */
    className?: string;
}

export const ExecutionTypeToggle: FC<ExecutionTypeToggleProps> = ({
    value,
    onChange,
    limitAvailable = true,
    limitReady = true,
    limitDisabledReason,
    className = "",
}) => {
    const handleMarketClick = useCallback(() => {
        onChange("market");
    }, [onChange]);

    const handleLimitClick = useCallback(() => {
        onChange("limit");
    }, [onChange]);

    if (!limitAvailable) {
        return null;
    }

    const isLimitDisabled = !limitReady;

    return (
        <div className={`bg-base-200/60 mx-auto flex w-fit gap-0.5 rounded-lg p-0.5 ${className}`}>
            <button
                onClick={handleMarketClick}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                    value === "market"
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/60 hover:text-base-content"
                }`}
            >
                Market
            </button>
            <button
                onClick={handleLimitClick}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                    value === "limit"
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/60 hover:text-base-content"
                } ${isLimitDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                disabled={isLimitDisabled}
                title={isLimitDisabled ? limitDisabledReason : "Execute via CoW Protocol limit order"}
            >
                Limit
            </button>
        </div>
    );
};

export default ExecutionTypeToggle;
