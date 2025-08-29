import { FC, useState } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";

type MarketCardProps = {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
  price: string;
  utilization: string;
  address: string;
  networkType: "evm" | "starknet";
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
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  const { data: optimalSupplyRateData } = useNetworkAwareReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: "findOptimalSupplyRate",
    args: [address],
    networkType,
    refetchInterval: 10000,
  });

  const { data: optimalBorrowRateData } = useNetworkAwareReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: "findOptimalBorrowRate",
    args: [address],
    networkType,
    refetchInterval: 10000,
  });

  let optimalSupplyProtocol = "";
  let optimalSupplyRateDisplay = 0;
  if (optimalSupplyRateData) {
    let proto;
    let rate;
    if (networkType === "starknet") {
      proto = feltToString(BigInt(optimalSupplyRateData?.[0]?.toString() || "0"));
      rate = Number(optimalSupplyRateData?.[1]?.toString() || "0") / 1e8;
    } else {
      proto = optimalSupplyRateData?.[0]?.toString() || "";
      rate = Number(optimalSupplyRateData?.[1]?.toString() || "0") / 1e8;
    }
    optimalSupplyProtocol = proto;
    optimalSupplyRateDisplay = Number(rate) / 1e8;
  }

  let optimalBorrowProtocol = "";
  let optimalBorrowRateDisplay = 0;
  if (optimalBorrowRateData) {
    let proto;
    let rate;
    if (networkType === "starknet") {
      proto = feltToString(BigInt(optimalBorrowRateData?.[0]?.toString() || "0"));
      rate = Number(optimalBorrowRateData?.[1]?.toString() || "0") / 1e8;
    } else {
      proto = optimalBorrowRateData?.[0]?.toString() || "";
      rate = Number(optimalBorrowRateData?.[1]?.toString() || "0") / 1e8;
    }
    optimalBorrowProtocol = proto;
    optimalBorrowRateDisplay = Number(rate) / 1e8;
  }

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

  return (
    <>
      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body p-4 gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src={icon} alt={name} width={32} height={32} className="rounded-full" />
              <span className="font-medium">{name}</span>
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => setIsDepositModalOpen(true)}>
              Deposit
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-base-content/70">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div>
              <div className="text-xs text-base-content/70">Utilization</div>
              <div className="font-medium">{utilization}%</div>
            </div>
            <div>
              <div className="text-xs text-base-content/70">Supply APY</div>
              <div className="flex items-center gap-1">
                <span className="font-medium text-success">{supplyRate}</span>
                <div className="badge badge-sm flex items-center gap-1 px-2 bg-base-300/80 text-base-content">
                  <span className="text-xs">{optimalSupplyRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalSupplyProtocol)}
                    alt={optimalSupplyProtocol}
                    width={16}
                    height={16}
                    className={`flex-shrink-0 ${optimalSupplyProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/70">Borrow APR</div>
              <div className="flex items-center gap-1">
                <span className="font-medium text-error">{borrowRate}</span>
                <div className="badge badge-sm flex items-center gap-1 px-2 bg-base-300/80 text-base-content">
                  <span className="text-xs">{optimalBorrowRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalBorrowProtocol)}
                    alt={optimalBorrowProtocol}
                    width={16}
                    height={16}
                    className={`flex-shrink-0 ${optimalBorrowProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DepositModalStark
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        token={{
          name,
          icon,
          address,
          currentRate: parseFloat(supplyRate.replace("%", "")),
        }}
        protocolName="Vesu"
      />
    </>
  );
};
