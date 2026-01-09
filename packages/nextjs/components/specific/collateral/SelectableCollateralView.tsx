import { FC } from "react";
import Image from "next/image";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

interface CollateralToken {
  symbol: string;
  balance: number;
  address: string;
  decimals: number;
  selected?: boolean;
}

interface SelectableCollateralViewProps {
  collaterals: CollateralToken[];
  onCollateralToggle: (symbol: string) => void;
}

export const SelectableCollateralView: FC<SelectableCollateralViewProps> = ({ collaterals, onCollateralToggle }) => {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {collaterals.map((token) => (
        <button
          key={token.symbol}
          onClick={() => onCollateralToggle(token.symbol)}
          className={`btn btn-sm flex h-auto items-center gap-2 py-2 normal-case ${
            token.selected ? "btn-primary" : "btn-outline"
          }`}
        >
          <div className="relative size-5 flex-shrink-0">
            <Image
              src={tokenNameToLogo(token.symbol)}
              alt={token.symbol}
              fill
              className="rounded-full object-contain"
            />
          </div>
          <span className="truncate">{token.symbol}</span>
          <span className="tabular-nums opacity-70">
            {token.balance.toFixed(token.decimals > 6 ? 4 : token.decimals)}
          </span>
        </button>
      ))}
    </div>
  );
}; 