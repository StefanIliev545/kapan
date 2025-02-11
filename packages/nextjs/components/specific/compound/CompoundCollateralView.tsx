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
    <div className="bg-base-200 rounded-lg p-4 mt-4">
      <h3 className="text-lg font-semibold mb-3">Collateral Positions</h3>
      <div className="space-y-2">
        {collateralAddresses.map((address: string, index: number) => {
          const balance = Number(formatUnits(collateralBalances[index], 18)); // Assuming 18 decimals
          if (balance <= 0) return null;

          // Extract token name from address (you might want to improve this)
          const name = collateralDisplayNames[index];

          return (
            <div key={address} className="flex items-center justify-between p-2 bg-base-100 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 relative">
                  <Image src={tokenNameToLogo(name)} alt={`${name} icon`} layout="fill" className="rounded-full" />
                </div>
                <span className="font-medium">{name}</span>
              </div>
              <div className="text-right">
                <div className="font-medium">{formatNumber(balance)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
