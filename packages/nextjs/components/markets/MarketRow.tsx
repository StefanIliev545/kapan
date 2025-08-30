import { FC, useState } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { InterestPillRow } from "./InterestPillRow";

type MarketRowProps = {
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

export const MarketRow: FC<MarketRowProps> = ({
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
      <div className="p-4 bg-base-100 hover:bg-base-200 rounded-lg transition-colors">
        {/* Large screen view */}
        <div className="hidden lg:flex items-center justify-between">
          <div className="flex items-center gap-3 w-1/5">
            <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
            <span className="font-medium">{name}</span>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center w-1/5">
              <div className="text-sm text-base-content/70">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div className="flex flex-col items-center w-1/5">
              <div className="text-sm text-base-content/70">Utilization</div>
              <div className="font-medium">{utilization}%</div>
            </div>
            <div className="w-2/5">
              <InterestPillRow
                supplyRate={supplyRate}
                borrowRate={borrowRate}
                address={address}
                networkType={networkType}
                protocol={protocol}
                labels="center"
              />
            </div>
            {networkType === "starknet" && (
              <button
                className="btn btn-sm btn-primary ml-auto"
                onClick={() => setIsDepositModalOpen(true)}
              >
                Deposit
              </button>
            )}
          </div>
        </div>

        {/* Medium screen view */}
        <div className="hidden md:block lg:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
              <span className="font-medium">{name}</span>
            </div>
            {networkType === "starknet" && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setIsDepositModalOpen(true)}
              >
                Deposit
              </button>
            )}
          </div>
          <InterestPillRow
            supplyRate={supplyRate}
            borrowRate={borrowRate}
            address={address}
            networkType={networkType}
            className="mb-3"
            protocol={protocol}
            labels="center"
          />
          <div className="flex flex-wrap gap-3">
            <div className="bg-base-200/50 p-2 rounded-md flex-1 min-w-[140px]">
              <div className="text-sm text-base-content/70">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md flex-1 min-w-[140px]">
              <div className="text-sm text-base-content/70">Utilization</div>
              <div className="font-medium">{utilization}%</div>
            </div>
          </div>
        </div>

        {/* Small screen view */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
              <span className="font-medium">{name}</span>
            </div>
            {networkType === "starknet" && (
              <button
                className="btn btn-xs btn-primary"
                onClick={() => setIsDepositModalOpen(true)}
              >
                Deposit
              </button>
            )}
          </div>
          <InterestPillRow
            supplyRate={supplyRate}
            borrowRate={borrowRate}
            address={address}
            networkType={networkType}
            className="mb-3"
            protocol={protocol}
            labels="center"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-base-200/50 p-2 rounded-md">
              <div className="text-xs text-base-content/70">Price</div>
              <div className="font-medium text-sm">${price}</div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md">
              <div className="text-xs text-base-content/70">Utilization</div>
              <div className="font-medium text-sm">{utilization}%</div>
            </div>
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
