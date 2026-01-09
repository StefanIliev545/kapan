"use client";

import { FC } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";

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
    /** Size variant */
    size?: "xs" | "sm";
    /** Additional class name */
    className?: string;
}

export const ExecutionTypeToggle: FC<ExecutionTypeToggleProps> = ({
    value,
    onChange,
    limitAvailable = true,
    limitReady = true,
    limitDisabledReason,
    size = "xs",
    className = "",
}) => {
    if (!limitAvailable) {
        return null;
    }

    const buttonClass = `btn btn-${size} flex-1`;
    const isLimitDisabled = !limitReady;

    return (
        <div className={`bg-base-200 mx-auto flex w-fit gap-1 rounded-lg p-1 ${className}`}>
            <button
                onClick={() => onChange("market")}
                className={`${buttonClass} ${value === "market" ? "btn-primary" : "btn-ghost"}`}
            >
                Market
            </button>
            <button
                onClick={() => onChange("limit")}
                className={`${buttonClass} ${value === "limit" ? "btn-primary" : "btn-ghost"}`}
                disabled={isLimitDisabled}
                title={isLimitDisabled ? limitDisabledReason : "Execute via CoW Protocol limit order"}
            >
                <ClockIcon className="mr-1 size-3" />
                Limit
            </button>
        </div>
    );
};

export default ExecutionTypeToggle;
