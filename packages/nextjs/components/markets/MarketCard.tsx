import { FC } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { InterestPillRow } from "./InterestPillRow";
import { MarketProps } from "./types";
import { useMarketDeposit } from "./useMarketDeposit";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import { isPTToken } from "~~/hooks/usePendlePTYields";

export const MarketCard: FC<MarketProps> = ({
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
      <div className="card bg-base-100 relative overflow-hidden shadow-md transition-shadow hover:shadow-lg">
        <div className="card-body space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Image src={icon} alt={name} width={32} height={32} className="rounded-full" />
            <div className="flex flex-1 flex-col">
              {isPTToken(name) ? (
                <TokenSymbolDisplay symbol={name} size="base" variant="inline" />
              ) : (
                <h3 className="text-lg font-semibold">{name}</h3>
              )}
              <span className="text-base-content/70 text-sm">${price}</span>
            </div>
            {showDepositButton && (
              <button className="btn btn-sm btn-primary ml-auto" onClick={openModal}>
                Deposit
              </button>
            )}
          </div>
          <Image src={icon} alt={name} width={120} height={120} className="absolute -bottom-8 -right-8 opacity-10" />
          <InterestPillRow
            supplyRate={supplyRate}
            borrowRate={borrowRate}
            address={address}
            networkType={networkType}
            protocol={protocol}
            labels="between"
          />
          <div>
            <div className="text-base-content/70 flex justify-between text-sm">
              <span>Utilization</span>
              <span>{utilization}%</span>
            </div>
            <progress
              className="progress progress-info w-full"
              value={parseFloat(utilization)}
              max={100}
            ></progress>
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
