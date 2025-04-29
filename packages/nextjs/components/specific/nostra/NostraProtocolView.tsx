import { FC, useMemo, useState, useEffect } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { ContractName } from "~~/utils/scaffold-stark/contract";
import { useAccount } from "~~/hooks/useAccount";
import { feltToString } from "~~/utils/protocols";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";

type UserPositionTuple = {
  0: bigint; // underlying token address
  1: bigint; // symbol
  2: bigint; // debt balance
  3: bigint; // collateral balance
};

type InterestState = {
  lending_rate: bigint;
  borrowing_rate: bigint;
  last_update_timestamp: bigint;
  lending_index: bigint;
  borrowing_index: bigint;
};

export const NostraProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();  
  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll, setForceShowAll] = useState(false);
  
  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress;

  // Get user positions
  const { data: userPositions } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 0,
  });

  // Memoize the unique contract addresses from user positions
  const uniqueContractAddresses = useMemo(() => {
    if (!userPositions) return [];

    const positions = userPositions as unknown as UserPositionTuple[];
    const addresses = positions.map(position => `0x${position[0].toString(16).padStart(64, "0")}`);
    
    // Remove duplicates and filter out empty/invalid addresses
    return [...new Set(addresses)].filter(addr => addr && addr !== "0x0");
  }, [userPositions]);

  // Get interest rates for all supported assets
  const { data: interestRates } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [uniqueContractAddresses],
    refetchInterval: 0,
  });

  // Aggregate positions by iterating over the returned tokens
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    if (!userPositions) {
      return { suppliedPositions: supplied, borrowedPositions: borrowed };
    }

    // Process each position
    const positions = userPositions as unknown as UserPositionTuple[];
    const rates = interestRates as unknown as InterestState[];

    positions.forEach((position, index) => {
      const underlying = `0x${position[0].toString(16).padStart(64, "0")}`;
      const symbol = feltToString(position[1]);
      const debtBalance = position[2];
      const collateralBalance = position[3];
      const interestRate = rates?.[index];
      
      // Convert rates to APY/APR (rates are in RAY format - 1e27)
      const supplyAPY = interestRate ? (Number(interestRate.lending_rate)/1e16) : 0; // Convert to percentage
      const borrowAPR = interestRate ? (Number(interestRate.borrowing_rate)/1e16) : 0; // Convert to percentage
      // Add supply position
      supplied.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: Number(formatUnits(collateralBalance, 18)), // Assuming 18 decimals
        tokenBalance: collateralBalance,
        currentRate: supplyAPY,
        tokenAddress: underlying,
      });

      // Add borrow position
      borrowed.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: -Number(formatUnits(debtBalance, 18)), // Negative balance for borrowed amount
        tokenBalance: debtBalance,
        currentRate: borrowAPR,
        tokenAddress: underlying,
      });
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
      networkType="starknet"
    />
  );
};

export default NostraProtocolView; 