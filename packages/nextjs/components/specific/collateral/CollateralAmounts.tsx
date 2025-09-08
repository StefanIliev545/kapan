import React, { FC } from "react";
import Image from "next/image";
import { FiX } from "react-icons/fi";
import { formatUnits, parseUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import type { CollateralWithAmount } from "./CollateralSelector";

interface CollateralAmountsProps {
  collaterals: CollateralWithAmount[];
  onChange: (updated: CollateralWithAmount[]) => void;
  selectedProtocol?: string;
}

export const CollateralAmounts: FC<CollateralAmountsProps> = ({ collaterals, onChange, selectedProtocol }) => {
  const handleAmountChange = (token: string, amountStr: string, decimals: number) => {
    const updated = collaterals.map(c => {
      if (c.token !== token) return c;
      try {
        const amount = parseUnits(amountStr || "0", decimals);
        return { ...c, amount, inputValue: amountStr };
      } catch {
        return { ...c, amount: 0n, inputValue: amountStr };
      }
    });
    onChange(updated);
  };

  const handleSetMax = (token: string, maxAmount: bigint, decimals: number) => {
    const maxStr = formatUnits(maxAmount, decimals);
    const updated = collaterals.map(c =>
      c.token === token ? { ...c, amount: maxAmount, inputValue: maxStr } : c,
    );
    onChange(updated);
  };

  const handleRemove = (token: string) => {
    onChange(collaterals.filter(c => c.token !== token));
  };

  if (collaterals.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-base-content/80">Collateral Transfer Amounts</label>
      <div className="bg-base-200/40 p-4 rounded-lg space-y-3">
        {collaterals.map(c => {
          const displayAmount = c.inputValue ?? (c.amount === 0n ? "" : formatUnits(c.amount, c.decimals));
          const maxAmountStr = formatUnits(c.maxAmount, c.decimals);
          const maxAmount = parseUnits(maxAmountStr, c.decimals);
          const isSupported = c.supported;
          return (
            <div key={c.token} className={`flex items-center gap-3 py-2.5 px-3 rounded-md bg-base-100 border border-base-300/50 shadow-sm ${!isSupported ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2 w-[160px] flex-shrink-0">
                <div className="w-7 h-7 relative flex-shrink-0">
                  <Image src={tokenNameToLogo(c.symbol)} alt={c.symbol} fill className={`rounded-full object-contain ${!isSupported ? 'grayscale' : ''}`}/>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium truncate">{c.symbol}</span>
                  <span className="text-xs text-base-content/60">Available: {maxAmountStr}</span>
                  {!isSupported && (
                    <span className="text-xs text-error/80">Not supported in {selectedProtocol}</span>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <div className={`flex items-center bg-base-200/60 rounded-lg border border-base-300 transition-all ${!isSupported ? 'opacity-50' : ''}`}>
                  <input
                    type="text"
                    value={displayAmount}
                    onChange={e => handleAmountChange(c.token, e.target.value, c.decimals)}
                    className="flex-1 bg-transparent border-none focus:outline-none px-3 py-2 h-10 text-base-content"
                    placeholder="0.00"
                    disabled={!isSupported}
                  />
                  <button
                    className={`mr-2 px-2 py-0.5 text-xs font-medium bg-base-300 hover:bg-primary hover:text-white rounded ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => handleSetMax(c.token, c.maxAmount, c.decimals)}
                    disabled={!isSupported}
                  >
                    MAX
                  </button>
                </div>
              </div>
              <div className="flex-shrink-0">
                <button
                  className="btn btn-ghost btn-sm text-base-content/70 p-1 h-8 w-8 flex items-center justify-center hover:bg-error/10 hover:text-error"
                  onClick={() => handleRemove(c.token)}
                  title="Remove collateral"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CollateralAmounts;
