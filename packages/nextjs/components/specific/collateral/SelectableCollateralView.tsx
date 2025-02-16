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
    <div className="flex flex-wrap gap-2 justify-center">
      {collaterals.map((token) => (
        <button
          key={token.symbol}
          onClick={() => onCollateralToggle(token.symbol)}
          className={`btn btn-sm normal-case flex items-center gap-2 h-auto py-2 ${
            token.selected ? "btn-primary" : "btn-outline"
          }`}
        >
          <div className="w-5 h-5 relative flex-shrink-0">
            <Image
              src={tokenNameToLogo(token.symbol)}
              alt={token.symbol}
              fill
              className="rounded-full object-contain"
            />
          </div>
          <span className="truncate">{token.symbol}</span>
          <span className="opacity-70 tabular-nums">
            {token.balance.toFixed(token.decimals > 6 ? 4 : token.decimals)}
          </span>
        </button>
      ))}
    </div>
  );
}; 