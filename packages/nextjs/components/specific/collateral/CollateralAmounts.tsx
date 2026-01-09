import React, { FC } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import type { CollateralWithAmount } from "./CollateralSelector";

interface CollateralAmountsProps {
  collaterals: CollateralWithAmount[];
  onChange: (updated: CollateralWithAmount[]) => void;
  selectedProtocol?: string;
  onMaxClick?: (token: string, isMax: boolean) => void;
}

export const CollateralAmounts: FC<CollateralAmountsProps> = ({
  collaterals,
  onChange,
  selectedProtocol,
  onMaxClick,
}) => {
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
    onMaxClick?.(token, false);
  };

  const handleSetMax = (token: string, maxAmount: bigint, decimals: number) => {
    const maxStr = formatUnits(maxAmount, decimals);
    const updated = collaterals.map(c =>
      c.token === token ? { ...c, amount: maxAmount, inputValue: maxStr } : c,
    );
    onChange(updated);
    onMaxClick?.(token, true);
  };

  if (collaterals.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="block text-center text-lg font-semibold">Collateral</label>
      <div className="max-h-48 space-y-4 overflow-y-auto pr-1">
        {collaterals.map(c => {
          const displayAmount = c.inputValue ?? (c.amount === 0n ? "" : formatUnits(c.amount, c.decimals));
          const isSupported = c.supported;
          return (
            <div
              key={c.token}
              className={`flex items-center gap-2 ${!isSupported ? 'opacity-60' : ''}`}
            >
              <div className="flex w-32 shrink-0 items-center gap-2">
                <div className="relative size-6">
                  <Image
                    src={tokenNameToLogo(c.symbol)}
                    alt={c.symbol}
                    fill
                    className={`rounded-full object-contain ${!isSupported ? 'grayscale' : ''}`}
                  />
                </div>
                <span className="truncate font-medium">{c.symbol}</span>
              </div>
              <input
                type="text"
                value={displayAmount}
                onChange={e => handleAmountChange(c.token, e.target.value, c.decimals)}
                className="border-base-300 focus:border-primary flex-1 border-b-2 bg-transparent px-2 py-1 text-right"
                placeholder="0.00"
                disabled={!isSupported}
              />
              <button
                className={`px-2 py-1 text-xs font-medium ${!isSupported ? 'cursor-not-allowed opacity-50' : ''}`}
                onClick={() => handleSetMax(c.token, c.maxAmount, c.decimals)}
                disabled={!isSupported}
              >
                MAX
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CollateralAmounts;
