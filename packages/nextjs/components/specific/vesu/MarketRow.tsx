import { FC, useState } from "react";
import Image from "next/image";
import { DepositModalStark } from "~~/components/modals/stark/DepositModalStark";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { getProtocolLogo } from "~~/utils/protocol";
import { feltToString } from "~~/utils/protocols";

type MarketRowProps = {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
  price: string;
  utilization: string;
  address: string;
  networkType: "evm" | "starknet";
};

export const MarketRow: FC<MarketRowProps> = ({ 
  icon, 
  name, 
  supplyRate, 
  borrowRate, 
  price, 
  utilization,
  address,
  networkType
}) => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  // Fetch optimal rates from the OptimalInterestRateFinder contract
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

  return (
    <>
      <div className="p-4 hover:bg-base-200/50 rounded-lg transition-colors">
        {/* Large screen view (lg+) - full flex row layout */}
        <div className="hidden lg:flex items-center justify-between">
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
            <div className="flex flex-col items-center w-1/5">
              <div className="text-sm text-base-content/70">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div className="flex flex-col items-center w-1/5">
              <div className="text-sm text-base-content/70">Utilization</div>
              <div className="font-medium">{utilization}%</div>
            </div>
            <div className="flex flex-col items-center w-1/5">
              <div className="text-sm text-base-content/70">Supply APY</div>
              <div className="flex items-center gap-1">
                <div className="font-medium text-success">{supplyRate}</div>
                <div className="badge badge-sm flex items-center gap-1 px-2.5 py-2 bg-base-300/80 text-base-content">
                  <span className="text-xs">{optimalSupplyRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalSupplyProtocol)}
                    alt={optimalSupplyProtocol}
                    width={20}
                    height={20}
                    className={`flex-shrink-0 ${optimalSupplyProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center w-1/5">
              <div className="text-sm text-base-content/70">Borrow APR</div>
              <div className="flex items-center gap-1">
                <div className="font-medium text-error">{borrowRate}</div>
                <div className="badge badge-sm flex items-center gap-1 px-2.5 py-2 bg-base-300/80 text-base-content">
                  <span className="text-xs">{optimalBorrowRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalBorrowProtocol)}
                    alt={optimalBorrowProtocol}
                    width={20}
                    height={20}
                    className={`flex-shrink-0 ${optimalBorrowProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
            <button 
              className="btn btn-sm btn-primary ml-4"
              onClick={() => setIsDepositModalOpen(true)}
            >
              Deposit
            </button>
          </div>
        </div>

        {/* Medium screen view (md) - simplified row with wrapping */}
        <div className="hidden md:block lg:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Image
                src={icon}
                alt={name}
                width={24}
                height={24}
                className="rounded-full"
              />
              <span className="font-medium">{name}</span>
            </div>
            <button 
              className="btn btn-sm btn-primary"
              onClick={() => setIsDepositModalOpen(true)}
            >
              Deposit
            </button>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <div className="bg-base-200/50 p-2 rounded-md flex-1 min-w-[140px]">
              <div className="text-sm text-base-content/70">Price</div>
              <div className="font-medium">${price}</div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md flex-1 min-w-[140px]">
              <div className="text-sm text-base-content/70">Utilization</div>
              <div className="font-medium">{utilization}%</div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md flex-1 min-w-[140px]">
              <div className="text-sm text-base-content/70">Supply APY</div>
              <div className="flex items-center gap-1">
                <div className="font-medium text-success">{supplyRate}</div>
                <div className="badge badge-sm flex items-center gap-1 px-2 py-1.5 bg-base-300/80 text-base-content">
                  <span className="text-xs">{optimalSupplyRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalSupplyProtocol)}
                    alt={optimalSupplyProtocol}
                    width={18}
                    height={18}
                    className={`flex-shrink-0 ${optimalSupplyProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md flex-1 min-w-[140px]">
              <div className="text-sm text-base-content/70">Borrow APR</div>
              <div className="flex items-center gap-1">
                <div className="font-medium text-error">{borrowRate}</div>
                <div className="badge badge-sm flex items-center gap-1 px-2 py-1.5 bg-base-300/80 text-base-content">
                  <span className="text-xs">{optimalBorrowRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalBorrowProtocol)}
                    alt={optimalBorrowProtocol}
                    width={18}
                    height={18}
                    className={`flex-shrink-0 ${optimalBorrowProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Small screen view (sm and below) - 2-column grid */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Image
                src={icon}
                alt={name}
                width={24}
                height={24}
                className="rounded-full"
              />
              <span className="font-medium">{name}</span>
            </div>
            <button 
              className="btn btn-xs btn-primary"
              onClick={() => setIsDepositModalOpen(true)}
            >
              Deposit
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-base-200/50 p-2 rounded-md">
              <div className="text-xs text-base-content/70">Price</div>
              <div className="font-medium text-sm">${price}</div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md">
              <div className="text-xs text-base-content/70">Utilization</div>
              <div className="font-medium text-sm">{utilization}%</div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md">
              <div className="text-xs text-base-content/70">Supply APY</div>
              <div className="flex items-center gap-1">
                <div className="font-medium text-sm text-success">{supplyRate}</div>
                <div className="badge badge-xs flex items-center gap-0.5 px-1 py-1 bg-base-300/80 text-base-content">
                  <span className="text-2xs">{optimalSupplyRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalSupplyProtocol)}
                    alt={optimalSupplyProtocol}
                    width={12}
                    height={12}
                    className={`flex-shrink-0 ${optimalSupplyProtocol === "vesu" ? "" : "rounded-md"}`}
                  />
                </div>
              </div>
            </div>
            <div className="bg-base-200/50 p-2 rounded-md">
              <div className="text-xs text-base-content/70">Borrow APR</div>
              <div className="flex items-center gap-1">
                <div className="font-medium text-sm text-error">{borrowRate}</div>
                <div className="badge badge-xs flex items-center gap-0.5 px-1 py-1 bg-base-300/80 text-base-content">
                  <span className="text-2xs">{optimalBorrowRateDisplay.toFixed(2)}%</span>
                  <Image
                    src={getProtocolLogo(optimalBorrowProtocol)}
                    alt={optimalBorrowProtocol}
                    width={12}
                    height={12}
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
          currentRate: parseFloat(supplyRate.replace('%', '')),
        }}
        protocolName="Vesu"
      />
    </>
  );
}; 