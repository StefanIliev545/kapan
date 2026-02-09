"use client";

import { FC, useCallback } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";

export type SwitchKind = "debt" | "collateral";

export interface TokenOption {
  address: string;
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
}

interface SwitchTokenSelectModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  kind: SwitchKind;
  currentToken: TokenOption; // the fixed token (on the right)
  options: TokenOption[];
  onSelect: (token: TokenOption) => void;
}

export const SwitchTokenSelectModalStark: FC<SwitchTokenSelectModalStarkProps> = ({ isOpen, onClose, kind, currentToken, options, onSelect }) => {
  const title = kind === "debt" ? "Swap Debt" : "Swap Collateral";

  const resolveDisplay = (t: TokenOption): TokenOption => {
    if (!t) {
      return t;
    }
    const rawName = t.name || "";
    const name = rawName && rawName.trim().length > 0 ? rawName : getTokenNameFallback(t.address) ?? rawName;
    const symbol = (t.symbol && t.symbol.trim().length > 0) ? t.symbol : name;
    const icon = tokenNameToLogo((name || symbol || "").toLowerCase());
    return { ...t, name, symbol, icon };
  };

  const current = resolveDisplay(currentToken);
  const showScrollHint = options.length > 8;

  // Factory for token select handlers
  const createSelectHandler = useCallback(
    (token: TokenOption) => () => onSelect(token),
    [onSelect],
  );

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">{title}</h3>
          <div className="text-base-content/70 flex items-center gap-2 text-xs">
            <span className="opacity-70">Current</span>
            <Image src={current.icon} alt={current.name} width={16} height={16} className="size-4" />
            <span className="font-medium">{current.symbol}</span>
          </div>
        </div>

        <div className="relative">
          <div className="border-base-300 divide-base-300 max-h-80 divide-y overflow-y-auto rounded-none border" aria-label="Scrollable token options list">
            {options.map(opt => { const o = resolveDisplay(opt); return (
              <button
                key={o.address}
                className="hover:bg-base-200/60 flex w-full items-center justify-between p-3 transition-colors"
                onClick={createSelectHandler(o)}
              >
                <div className="flex items-center gap-2 opacity-80">
                  <Image src={current.icon} alt={current.name} width={16} height={16} className="size-4" />
                  <span className="text-xs">{current.symbol}</span>
                </div>
                <div className="text-base-content/50 mx-3">→</div>
                <div className="flex min-w-0 items-center gap-2">
                  <Image src={o.icon} alt={o.name} width={16} height={16} className="size-4" />
                  <div className="flex min-w-0 flex-col items-start">
                    <span className="truncate text-sm font-medium">{o.name}</span>
                    <span className="text-base-content/60 truncate text-[11px]">{o.symbol}</span>
                  </div>
                </div>
              </button>
            ); })}
          </div>
          {showScrollHint && (
            <>
              <div className="from-base-100 pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b to-transparent" />
              <div className="from-base-100 pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t to-transparent" />
            </>
          )}
        </div>

        {showScrollHint && (
          <div className="text-base-content/60 text-center text-[11px]">Scroll to see more options</div>
        )}
      </div>
    </BaseModal>
  );
};

export default SwitchTokenSelectModalStark;


