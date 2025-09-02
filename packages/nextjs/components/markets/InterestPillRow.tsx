import { FC } from "react";
import Image from "next/image";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString, formatRate } from "~~/utils/protocols";

export const RatePill: FC<{
  current: string;
  optimal: string;
  color: string;
  logo: string;
  alt: string;
  sameProtocol?: boolean;
}> = ({ current, optimal, color, logo, alt, sameProtocol = false }) => (
  <div className="flex rounded-lg overflow-hidden shadow text-sm text-white">
    <span className={`px-3 py-1 ${color}`}>{current}</span>
    <span
      className={`px-3 py-1 flex items-center gap-1 ${
        sameProtocol ? color : "bg-gradient-to-r from-fuchsia-500 to-purple-600 animate-pulse"
      }`}
    >
      {optimal}
      <Image src={logo} alt={alt} width={16} height={16} className="rounded-md" />
    </span>
  </div>
);

export const InterestPillRow: FC<{
  supplyRate: string;
  borrowRate: string;
  address: string;
  networkType: "evm" | "starknet";
  protocol: string;
  className?: string;
  labels?: "between" | "center";
}> = ({ supplyRate, borrowRate, address, networkType, protocol, className = "", labels = "between" }) => {
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
  let optimalSupplyRate = 0;
  if (optimalSupplyRateData) {
    let proto: string;
    let rate: number;
    if (networkType === "starknet") {
      proto = feltToString(BigInt(optimalSupplyRateData?.[0]?.toString() || "0"));
      rate = Number(optimalSupplyRateData?.[1]?.toString() || "0");
    } else {
      proto = optimalSupplyRateData?.[0]?.toString() || "";
      rate = Number(optimalSupplyRateData?.[1]?.toString() || "0");
    }
    optimalSupplyProtocol = proto;
    const divisor = networkType === "starknet" ? 1e16 : 1e8;
    optimalSupplyRate = rate / divisor / 100;
  }

  let optimalBorrowProtocol = "";
  let optimalBorrowRate = 0;
  if (optimalBorrowRateData) {
    let proto: string;
    let rate: number;
    if (networkType === "starknet") {
      proto = feltToString(BigInt(optimalBorrowRateData?.[0]?.toString() || "0"));
      rate = Number(optimalBorrowRateData?.[1]?.toString() || "0");
    } else {
      proto = optimalBorrowRateData?.[0]?.toString() || "";
      rate = Number(optimalBorrowRateData?.[1]?.toString() || "0");
    }
    optimalBorrowProtocol = proto;
    const divisor = networkType === "starknet" ? 1e16 : 1e8;
    optimalBorrowRate = rate / divisor / 100;
  }

  const hasOptimalSupply = optimalSupplyRate > 0;
  const hasOptimalBorrow = optimalBorrowRate > 0;

  const supplyOptimalDisplay = hasOptimalSupply ? formatRate(optimalSupplyRate) : supplyRate;
  const borrowOptimalDisplay = hasOptimalBorrow ? formatRate(optimalBorrowRate) : borrowRate;

  const sameSupplyProtocol = hasOptimalSupply ? optimalSupplyProtocol.toLowerCase() === protocol.toLowerCase() : true;
  const sameBorrowProtocol = hasOptimalBorrow ? optimalBorrowProtocol.toLowerCase() === protocol.toLowerCase() : true;

  const supplyLogo = tokenNameToLogo(hasOptimalSupply ? optimalSupplyProtocol : protocol);
  const borrowLogo = tokenNameToLogo(hasOptimalBorrow ? optimalBorrowProtocol : protocol);

  const supplyAlt = hasOptimalSupply ? optimalSupplyProtocol : protocol;
  const borrowAlt = hasOptimalBorrow ? optimalBorrowProtocol : protocol;

  if (labels === "center") {
    return (
      <div className={`flex justify-between gap-4 ${className}`}>
        <div className="flex flex-col items-center space-y-1 flex-1">
          <span className="text-sm text-base-content/70">Supply rate</span>
          <RatePill
            current={supplyRate}
            optimal={supplyOptimalDisplay}
            color="bg-lime-500"
            logo={supplyLogo}
            alt={supplyAlt}
            sameProtocol={sameSupplyProtocol}
          />
        </div>
        <div className="flex flex-col items-center space-y-1 flex-1">
          <span className="text-sm text-base-content/70">Borrow rate</span>
          <RatePill
            current={borrowRate}
            optimal={borrowOptimalDisplay}
            color="bg-orange-500"
            logo={borrowLogo}
            alt={borrowAlt}
            sameProtocol={sameBorrowProtocol}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex justify-between text-sm text-base-content/70">
        <span>Supply rate</span>
        <span>Borrow rate</span>
      </div>
      <div className="flex justify-between gap-4">
        <RatePill
          current={supplyRate}
          optimal={supplyOptimalDisplay}
          color="bg-lime-500"
          logo={supplyLogo}
          alt={supplyAlt}
          sameProtocol={sameSupplyProtocol}
        />
        <RatePill
          current={borrowRate}
          optimal={borrowOptimalDisplay}
          color="bg-orange-500"
          logo={borrowLogo}
          alt={borrowAlt}
          sameProtocol={sameBorrowProtocol}
        />
      </div>
    </div>
  );
};

export default InterestPillRow;
