import { FC } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { InterestPillRow } from "./InterestPillRow";
import { MarketProps } from "./types";
import { useMarketDeposit } from "./useMarketDeposit";

export const MarketRow: FC<MarketProps> = ({
  icon,
  name,
  supplyRate,
  borrowRate,
  price,
  utilization,
  address,
  networkType,
  protocol,
  allowDeposit = false,
}) => {
  const { isModalOpen, openModal, closeModal, showDepositButton, tokenData } = useMarketDeposit({
    name,
    icon,
    address,
    supplyRate,
    allowDeposit,
    networkType,
  });

  return (
    <>
      <div className="bg-base-100 hover:bg-base-200/60 hover:border-base-content/10 cursor-pointer rounded-lg border border-transparent p-4 transition-all">
        {/* Large screen view */}
        <div className="hidden items-center justify-between lg:flex">
          <div className="flex w-1/5 items-center gap-3">
            <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
            <span className="font-medium">{name}</span>
          </div>
          <div className="flex flex-1 items-center">
            <div className="flex w-1/5 flex-col items-center">
              <div className="text-base-content/70 text-sm">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div className="flex w-1/5 flex-col items-center">
              <div className="text-base-content/70 mb-1 text-sm">Utilization</div>
              <span className="font-medium">{utilization}%</span>
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
            {showDepositButton && (
              <button className="btn btn-sm btn-primary ml-auto" onClick={openModal}>
                Deposit
              </button>
            )}
          </div>
        </div>

        {/* Medium screen view */}
        <div className="hidden md:block lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
              <span className="font-medium">{name}</span>
            </div>
            {showDepositButton && (
              <button className="btn btn-sm btn-primary" onClick={openModal}>
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
            <div className="bg-base-200/50 min-w-[140px] flex-1 rounded-md p-2">
              <div className="text-base-content/70 text-sm">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div className="bg-base-200/50 min-w-[140px] flex-1 rounded-md p-2">
              <div className="text-base-content/70 mb-1 text-sm">Utilization</div>
              <span className="font-medium">{utilization}%</span>
            </div>
          </div>
        </div>

        {/* Small screen view */}
        <div className="md:hidden">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src={icon} alt={name} width={24} height={24} className="rounded-full" />
              <span className="font-medium">{name}</span>
            </div>
            {showDepositButton && (
              <button className="btn btn-xs btn-primary" onClick={openModal}>
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
            <div className="bg-base-200/50 rounded-md p-2">
              <div className="text-base-content/70 text-xs">Price</div>
              <div className="text-sm font-medium">${price}</div>
            </div>
            <div className="bg-base-200/50 rounded-md p-2">
              <div className="text-base-content/70 mb-1 text-xs">Utilization</div>
              <span className="text-sm font-medium">{utilization}%</span>
            </div>
          </div>
        </div>
      </div>

      {showDepositButton && (
        <DepositModalStark
          isOpen={isModalOpen}
          onClose={closeModal}
          token={tokenData}
          protocolName={protocol}
        />
      )}
    </>
  );
};
