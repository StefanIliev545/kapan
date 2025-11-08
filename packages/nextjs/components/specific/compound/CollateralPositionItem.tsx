"use client";

import { FC, memo } from "react";
import Image from "next/image";
import { FiatBalance } from "~~/components/FiatBalance";

interface CollateralPosition {
  icon: string;
  name: string;
  balance: number;
  balanceRaw: bigint;
  usdValue: number;
  address: string;
  rawPrice: bigint;
  decimals: number;
}

interface CollateralPositionItemProps {
  position: CollateralPosition;
}

export const CollateralPositionItem: FC<CollateralPositionItemProps> = memo(({ position }) => {
  return (
    <div
      key={position.address}
      className={`bg-base-100 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border 
        ${position.balance > 0 ? "border-base-300/50" : "border-base-300/20"} 
        hover:bg-base-200/50 flex items-center overflow-hidden`}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1 p-2">
        <div className="avatar flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-base-200 p-1.5 flex items-center justify-center overflow-hidden">
            <Image
              src={position.icon}
              alt={`${position.name} icon`}
              width={20}
              height={20}
              className="object-contain max-w-full max-h-full"
            />
          </div>
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="font-medium text-sm truncate">{position.name}</span>
          <div className="flex flex-col">
            {position.balance > 0 ? (
              <>
                <span className="text-xs text-success truncate">
                  <FiatBalance
                    tokenAddress={position.address}
                    rawValue={position.balanceRaw}
                    price={position.rawPrice}
                    decimals={position.decimals}
                    tokenSymbol={position.name}
                    className=""
                    isNegative={false}
                    maxRawDecimals={4}
                  />
                </span>
              </>
            ) : (
              <span className="text-xs text-base-content/40 truncate">No balance</span>
            )}
          </div>
        </div>
      </div>
      <div className="join join-vertical">
        <button
          className="btn btn-sm btn-ghost join-item rounded-l-none rounded-r-lg"
          onClick={e => {
            e.stopPropagation();
            // Handle deposit action
          }}
        >
          <span className="text-xs">Deposit</span>
        </button>
      </div>
    </div>
  );
});
CollateralPositionItem.displayName = "CollateralPositionItem";

