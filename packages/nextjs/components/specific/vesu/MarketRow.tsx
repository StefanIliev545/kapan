import { FC, useState } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/DepositModalStark";

type MarketRowProps = {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
  price: string;
  utilization: string;
  address: string; // Add token address
};

export const MarketRow: FC<MarketRowProps> = ({ 
  icon, 
  name, 
  supplyRate, 
  borrowRate, 
  price, 
  utilization,
  address 
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between py-2 px-4 hover:bg-base-200/50 rounded-lg transition-colors">
        <div className="flex items-center gap-3 w-1/5">
          <Image
            src={icon}
            alt={name}
            width={24}
            height={24}
            className="rounded-full"
          />
          <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center justify-between w-4/5">
          <div className="flex flex-col items-center w-1/4">
            <div className="text-sm text-base-content/70">Price</div>
            <div className="font-medium">${price}</div>
          </div>
          <div className="flex flex-col items-center w-1/4">
            <div className="text-sm text-base-content/70">Utilization</div>
            <div className="font-medium">{utilization}%</div>
          </div>
          <div className="flex flex-col items-center w-1/4">
            <div className="text-sm text-base-content/70">Supply APY</div>
            <div className="font-medium text-success">{supplyRate}</div>
          </div>
          <div className="flex flex-col items-center w-1/4">
            <div className="text-sm text-base-content/70">Borrow APR</div>
            <div className="font-medium text-error">{borrowRate}</div>
          </div>
          <button 
            className="btn btn-sm btn-primary ml-4"
            onClick={() => setIsDepositModalOpen(true)}
          >
            Deposit
          </button>
        </div>
      </div>

      <DepositModalStark
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        token={{
          name,
          icon,
          address,
          currentRate: parseFloat(supplyRate.replace('%', '')),
        }}
        protocolName="Vesu"
      />
    </>
  );
}; 