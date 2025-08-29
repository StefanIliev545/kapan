import Image from "next/image";
import { FC } from "react";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";

export const RatePill: FC<{ current: string; optimal: string; color: string; logo: string; alt: string }> = ({
  current,
  optimal,
  color,
  logo,
  alt,
}) => (
  <div className="flex rounded-full overflow-hidden shadow text-sm text-white">
    <span className={`px-3 py-1 ${color}`}>{current}</span>
    <span className="px-3 py-1 flex items-center gap-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 animate-pulse">
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
  className?: string;
}> = ({ supplyRate, borrowRate, address, networkType, className = "" }) => {
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
    optimalSupplyRateDisplay = rate / 1e8;
  }

  let optimalBorrowProtocol = "";
  let optimalBorrowRateDisplay = 0;
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
    optimalBorrowRateDisplay = rate / 1e8;
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
          optimal={`${optimalSupplyRateDisplay.toFixed(2)}%`}
          color="bg-lime-500"
          logo={tokenNameToLogo(optimalSupplyProtocol)}
          alt={optimalSupplyProtocol}
        />
        <RatePill
          current={borrowRate}
          optimal={`${optimalBorrowRateDisplay.toFixed(2)}%`}
          color="bg-orange-500"
          logo={tokenNameToLogo(optimalBorrowProtocol)}
          alt={optimalBorrowProtocol}
        />
      </div>
    </div>
  );
};

export default InterestPillRow;
