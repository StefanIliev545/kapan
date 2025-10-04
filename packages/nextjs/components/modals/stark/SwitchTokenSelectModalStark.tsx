"use client";

import { FC } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";

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

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md" boxClassName="rounded-none p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">{title}</h3>
          <div className="flex items-center gap-2 text-sm text-base-content/70">
            <Image src={currentToken.icon} alt={currentToken.name} width={20} height={20} className="w-5 h-5" />
            <span>{currentToken.name}</span>
          </div>
        </div>

        <div className="space-y-2">
          {options.map(opt => (
            <button
              key={opt.address}
              className="w-full flex items-center justify-between p-2 hover:bg-base-200 rounded"
              onClick={() => onSelect(opt)}
            >
              <div className="flex items-center gap-2">
                <Image src={opt.icon} alt={opt.name} width={20} height={20} className="w-5 h-5" />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">{opt.name}</span>
                  <span className="text-[11px] text-base-content/60">{opt.symbol}</span>
                </div>
              </div>
              <div className="text-base-content/50">←</div>
              <div className="flex items-center gap-2 opacity-80">
                <Image src={currentToken.icon} alt={currentToken.name} width={16} height={16} className="w-4 h-4" />
                <span className="text-xs">{currentToken.symbol}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </BaseModal>
  );
};

export default SwitchTokenSelectModalStark;


