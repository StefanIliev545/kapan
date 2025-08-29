import { FC, useEffect, useMemo, useState } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useAccount } from "~~/hooks/useAccount";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";
import { ContractName } from "~~/utils/scaffold-stark/contract";

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
  const enabled = !!connectedAddress;

  // Get user positions
  const { data: userPositions } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: enabled ? 10000 : 0,
    enabled,
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
    enabled,
  });

  const { tokenAddresses } = useMemo(() => {
    if (!userPositions) return { tokenAddresses: [] };
    const positions = userPositions as unknown as UserPositionTuple[];

    const tokenAddresses = positions?.map(position => `0x${position[0].toString(16).padStart(64, "0")}`);
    return { tokenAddresses };
  }, [userPositions]);

  const { data: tokenDecimals } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_token_decimals",
    args: [tokenAddresses],
    enabled,
  });

  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [tokenAddresses],
    enabled,
  });

  const { tokenToDecimals, tokenToPrices } = useMemo(() => {
    if (!tokenDecimals) return { tokenToDecimals: {}, tokenToPrices: {} };
    const decimals = tokenDecimals as unknown as bigint[];
    const prices = tokenPrices as unknown as bigint[];
    const tokenToDecimals = decimals.reduce(
      (acc, decimals, index) => {
        acc[tokenAddresses[index]] = Number(decimals);
        return acc;
      },
      {} as Record<string, number>,
    );
    const tokenToPrices =
      prices?.reduce(
        (acc, price, index) => {
          acc[tokenAddresses[index]] = price / 10n ** 10n; // haven't figured out why this works but fuck it.
          return acc;
        },
        {} as Record<string, bigint>,
      ) ?? {};
    return { tokenToDecimals, tokenToPrices };
  }, [tokenDecimals, tokenAddresses, tokenPrices]);

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
      const supplyAPY = interestRate ? Number(interestRate.lending_rate) / 1e16 : 0; // Convert to percentage
      const borrowAPR = interestRate ? Number(interestRate.borrowing_rate) / 1e16 : 0; // Convert to percentage
      // Add supply position
      supplied.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: Number(formatUnits(collateralBalance, tokenToDecimals[underlying])), // Assuming 18 decimals
        tokenBalance: collateralBalance,
        currentRate: supplyAPY,
        tokenAddress: underlying,
        tokenDecimals: tokenToDecimals[underlying],
        tokenPrice: tokenToPrices[underlying] ?? 0,
      });

      // Add borrow position
      borrowed.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: -Number(formatUnits(debtBalance, tokenToDecimals[underlying])), // Negative balance for borrowed amount
        tokenBalance: debtBalance,
        currentRate: borrowAPR,
        tokenAddress: underlying,
        tokenDecimals: tokenToDecimals[underlying],
        tokenPrice: tokenToPrices[underlying] ?? 0,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [userPositions, interestRates, tokenToDecimals, tokenToPrices]);

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
