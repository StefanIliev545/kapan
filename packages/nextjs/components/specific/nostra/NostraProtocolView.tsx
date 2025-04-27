import { FC, useMemo, useState, useEffect } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract, useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { ContractName } from "~~/utils/scaffold-stark/contract";
import { useAccount } from "~~/hooks/useAccount";

type NostraPosition = {
  underlying: string;
  debtBalance: bigint;
  collateralBalance: bigint;
};

type InterestRateConfig = {
  supply_rate: bigint;
  borrow_rate: bigint;
};

export const NostraProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();  
  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll, setForceShowAll] = useState(false);
  
  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress;

  // Get user positions
  const { data: userPositions } = useScaffoldReadContract({
    contractName: "NostraGateway" as ContractName,
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 0,
  });

  console.log("userPositions", userPositions);

  // Memoize the unique contract addresses from user positions
  const uniqueContractAddresses = useMemo(() => {
    if (!userPositions) return [];

    const positions = userPositions as unknown as NostraPosition[];
    const addresses = positions.map(position => position.underlying);
    
    // Remove duplicates and filter out empty/invalid addresses
    return [...new Set(addresses)].filter(addr => addr && addr !== "0x0");
  }, [userPositions]);

  // Get interest rates for all supported assets
  const { data: interestRates } = useScaffoldReadContract({
    contractName: "NostraGateway" as ContractName,
    functionName: "get_interest_rates",
    args: [uniqueContractAddresses],
    refetchInterval: 0,
  });

  // Aggregate positions by iterating over the returned tokens
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    if (!userPositions || !interestRates) return { suppliedPositions: supplied, borrowedPositions: borrowed };

    // Process each position
    const positions = userPositions as unknown as NostraPosition[];
    const rates = interestRates as unknown as InterestRateConfig[];

    positions.forEach((position, index) => {
      const { underlying, debtBalance, collateralBalance } = position;
      const interestRate = rates[index];

      // Convert rates to APY (assuming rates are in RAY format like Aave)
      const supplyAPY = interestRate ? Number(interestRate.supply_rate) / 1e25 : 0;
      const borrowAPY = interestRate ? Number(interestRate.borrow_rate) / 1e25 : 0;

      // Add supply position
      if (collateralBalance > 0n) {
        supplied.push({
          icon: tokenNameToLogo(underlying),
          name: underlying,
          balance: Number(formatUnits(collateralBalance, 18)), // Assuming 18 decimals
          tokenBalance: collateralBalance,
          currentRate: supplyAPY,
          tokenAddress: underlying,
        });
      }

      // Add borrow position
      if (debtBalance > 0n) {
        borrowed.push({
          icon: tokenNameToLogo(underlying),
          name: underlying,
          balance: -Number(formatUnits(debtBalance, 18)), // Negative balance for borrowed amount
          tokenBalance: debtBalance,
          currentRate: borrowAPY,
          tokenAddress: underlying,
        });
      }
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [userPositions, interestRates]);

  return (
    <ProtocolView
      protocolName="Nostra"
      protocolIcon="/logos/nostra.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={forceShowAll}
    />
  );
};

export default NostraProtocolView; 