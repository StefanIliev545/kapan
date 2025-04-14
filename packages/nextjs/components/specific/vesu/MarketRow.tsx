import { FC } from "react";
import Image from "next/image";

interface MarketRowProps {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
}

export const MarketRow: FC<MarketRowProps> = ({ icon, name, supplyRate, borrowRate }) => {
  return (
    <div className="flex items-center justify-between py-2 px-4 hover:bg-base-200/50 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <Image
          src={icon}
          alt={name}
          width={24}
          height={24}
          className="rounded-full"
        />
        <span className="font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-sm text-base-content/70">Supply APY</div>
          <div className="font-medium text-success">{supplyRate}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-base-content/70">Borrow APY</div>
          <div className="font-medium text-error">{borrowRate}</div>
        </div>
      </div>
    </div>
  );
}; 