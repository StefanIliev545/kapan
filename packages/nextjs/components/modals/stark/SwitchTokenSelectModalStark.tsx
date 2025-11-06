"use client";

import { FC } from "react";
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
    if (!t) return t;
    const rawName = t.name || "";
    const name = rawName && rawName.trim().length > 0 ? rawName : getTokenNameFallback(t.address) ?? rawName;
    const symbol = (t.symbol && t.symbol.trim().length > 0) ? t.symbol : name;
    const icon = tokenNameToLogo((name || symbol || "").toLowerCase());
    return { ...t, name, symbol, icon };
  };

  const current = resolveDisplay(currentToken);
  const showScrollHint = options.length > 8;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">{title}</h3>
          <div className="flex items-center gap-2 text-xs text-base-content/70">
            <span className="opacity-70">Current</span>
            <Image src={current.icon} alt={current.name} width={16} height={16} className="w-4 h-4" />
            <span className="font-medium">{current.symbol}</span>
          </div>
        </div>

        <div className="relative">
          <div className="border border-base-300 divide-y divide-base-300 rounded-none max-h-80 overflow-y-auto" aria-label="Scrollable token options list">
            {options.map(opt => { const o = resolveDisplay(opt); return (
              <button
                key={o.address}
                className="w-full flex items-center justify-between p-3 hover:bg-base-200/60 transition-colors"
                onClick={() => onSelect(o)}
              >
                <div className="flex items-center gap-2 opacity-80">
                  <Image src={current.icon} alt={current.name} width={16} height={16} className="w-4 h-4" />
                  <span className="text-xs">{current.symbol}</span>
                </div>
                <div className="mx-3 text-base-content/50">→</div>
                <div className="flex items-center gap-2 min-w-0">
                  <Image src={o.icon} alt={o.name} width={16} height={16} className="w-4 h-4" />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-medium truncate">{o.name}</span>
                    <span className="text-[11px] text-base-content/60 truncate">{o.symbol}</span>
                  </div>
                </div>
              </button>
            ); })}
          </div>
          {showScrollHint && (
            <>
              <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-base-100 to-transparent" />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-base-100 to-transparent" />
            </>
          )}
        </div>

        {showScrollHint && (
          <div className="text-[11px] text-base-content/60 text-center">Scroll to see more options</div>
        )}
      </div>
    </BaseModal>
  );
};

export default SwitchTokenSelectModalStark;


