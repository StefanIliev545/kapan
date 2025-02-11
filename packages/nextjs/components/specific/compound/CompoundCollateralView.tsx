import { FC } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface CollateralPosition {
  icon: string;
  name: string;
  balance: number;
}

export const CompoundCollateralView: FC<{ baseToken: string }> = ({ baseToken }) => {
  const { address: connectedAddress } = useAccount();

  // Fetch collateral positions
  const { data: collateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [baseToken, connectedAddress],
  });

  // Format currency with 2 decimal places
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  if (!collateralData || !collateralData[0]?.length) {
    return null;
  }

  const [collateralAddresses, collateralBalances, collateralDisplayNames] = collateralData;

  return (
    <div className="bg-base-200 rounded-lg p-2 mt-2 w-full">
      <div className="flex flex-col gap-2">
        <div className="flex justify-center items-center relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-base-content/10"></div>
          </div>
          <span className="relative px-4 text-sm text-base-content/70 bg-base-200">
            Collateral
          </span>
        </div>
        <div className="flex flex-wrap gap-4 w-full justify-center">
          {collateralAddresses.map((address: string, index: number) => {
            const balance = Number(formatUnits(collateralBalances[index], 18));
            if (balance <= 0) return null;

            const name = collateralDisplayNames[index];

            return (
              <div key={address} className="flex-none bg-base-100 rounded-lg p-2 min-w-[150px]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 relative">
                    <Image src={tokenNameToLogo(name)} alt={`${name} icon`} layout="fill" className="rounded-full" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{name}</span>
                    <span className="text-sm text-base-content/70">{formatNumber(balance)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
