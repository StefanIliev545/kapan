"use client";

import { FC } from "react";
import Image from "next/image";
import { formatTokenAmount } from "~~/utils/protocols";

export interface NostraTokenCardProps {
  /** Card label (e.g., "Debt token", "Current debt", "Target debt") */
  label: string;
  /** Token name/symbol */
  name: string;
  /** Token icon URL */
  icon: string;
  /** Token decimals for formatting */
  decimals: number;
  /** Raw balance as bigint */
  balance?: bigint;
  /** Optional subtitle to show instead of balance */
  subtitle?: string;
}

/**
 * Shared token card display used in Nostra modals.
 * Shows a labeled card with token icon, name, and balance/subtitle.
 *
 * @example
 * ```tsx
 * <NostraTokenCard
 *   label="Debt token"
 *   name={debt.name}
 *   icon={debt.icon}
 *   decimals={debt.decimals}
 *   balance={debtBalance}
 * />
 *
 * <NostraTokenCard
 *   label="Target debt"
 *   name={targetDebt.name}
 *   icon={targetDebt.icon}
 *   decimals={targetDebt.decimals}
 *   subtitle="APR adjustments handled automatically"
 * />
 * ```
 */
export const NostraTokenCard: FC<NostraTokenCardProps> = ({
  label,
  name,
  icon,
  decimals,
  balance,
  subtitle,
}) => {
  return (
    <div className="border-base-300 rounded-md border p-3">
      <div className="text-base-content/60 mb-2 text-xs uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-2">
        <Image src={icon} alt={name} width={28} height={28} className="rounded-full" />
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-base-content/60 text-xs">
            {subtitle ?? (balance !== undefined ? formatTokenAmount(balance.toString(), decimals) : "")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NostraTokenCard;
