import { FC, useState } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { InterestPillRow } from "./InterestPillRow";

export type MarketCardProps = {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
  price: string;
  utilization: string;
  address: string;
  networkType: "evm" | "starknet";
  protocol: string;
};

export const MarketCard: FC<MarketCardProps> = ({
  icon,
  name,
  supplyRate,
  borrowRate,
  price,
  utilization,
  address,
  networkType,
  protocol,
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  return (
    <>
      <div className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow relative overflow-hidden">
        <div className="card-body p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Image src={icon} alt={name} width={32} height={32} className="rounded-full" />
            <div className="flex flex-col flex-1">
              <h3 className="text-lg font-semibold">{name}</h3>
              <span className="text-sm text-base-content/70">${price}</span>
            </div>
            {networkType === "starknet" && (
              <button
                className="btn btn-sm btn-primary btn-circle ml-auto"
                onClick={() => setIsDepositModalOpen(true)}
                aria-label="Deposit"
              >
                +
              </button>
            )}
          </div>
          <Image src={icon} alt={name} width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
          <InterestPillRow
            supplyRate={supplyRate}
            borrowRate={borrowRate}
            address={address}
            networkType={networkType}
            protocol={protocol}
            labels="between"
          />
          <div>
            <div className="flex justify-between text-sm text-base-content/70">
              <span>Utilization</span>
              <span>{utilization}%</span>
            </div>
            <progress className="progress w-full progress-info" value={utilization} max="100"></progress>
          </div>
        </div>
      </div>

      {networkType === "starknet" && (
        <DepositModalStark
          isOpen={isDepositModalOpen}
          onClose={() => setIsDepositModalOpen(false)}
          token={{
            name,
            icon,
            address,
            currentRate: parseFloat(supplyRate.replace("%", "")),
          }}
          protocolName={protocol}
        />
      )}
    </>
  );
};
