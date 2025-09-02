import { useAccount } from "~~/hooks/useAccount";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { feltToString } from "~~/utils/protocols";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { ProtocolPosition } from "../../ProtocolView";

// Types extracted from original NostraProtocolView
export type UserPositionTuple = {
  0: bigint; // underlying token address
  1: bigint; // symbol
  2: bigint; // debt balance
  3: bigint; // collateral balance
};

export type InterestState = {
  lending_rate: bigint;
  borrowing_rate: bigint;
  last_update_timestamp: bigint;
  lending_index: bigint;
  borrowing_index: bigint;
};

// Hook that fetches and formats Nostra positions for reuse across layouts
export const useNostraProtocolData = () => {
  const { address: connectedAddress } = useAccount();
  const queryAddress = connectedAddress;

  // User positions
  const { data: userPositions } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 10000,
  });

  // Unique token addresses
  const uniqueContractAddresses = useMemo(() => {
    if (!userPositions) return [] as string[];
    const positions = userPositions as unknown as UserPositionTuple[];
    const addresses = positions.map(position => `0x${position[0].toString(16).padStart(64, "0")}`);
    return [...new Set(addresses)].filter(addr => addr && addr !== "0x0");
  }, [userPositions]);

  // Interest rates per token
  const { data: interestRates } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [uniqueContractAddresses],
    refetchInterval: 0,
  });

  // Token decimals & prices
  const { tokenAddresses } = useMemo(() => {
    if (!userPositions) return { tokenAddresses: [] as string[] };
    const positions = userPositions as unknown as UserPositionTuple[];
    const tokenAddresses = positions.map(position => `0x${position[0].toString(16).padStart(64, "0")}`);
    return { tokenAddresses };
  }, [userPositions]);

  const { data: tokenDecimals } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_token_decimals",
    args: [tokenAddresses],
  });

  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [tokenAddresses],
  });

  const { tokenToDecimals, tokenToPrices } = useMemo(() => {
    if (!tokenDecimals) return { tokenToDecimals: {} as Record<string, number>, tokenToPrices: {} as Record<string, bigint> };
    const decimals = tokenDecimals as unknown as bigint[];
    const prices = tokenPrices as unknown as bigint[];
    const tokenToDecimals = decimals.reduce((acc, d, index) => {
      acc[tokenAddresses[index]] = Number(d);
      return acc;
    }, {} as Record<string, number>);
    const tokenToPrices =
      prices?.reduce((acc, price, index) => {
        acc[tokenAddresses[index]] = price / 10n ** 10n;
        return acc;
      }, {} as Record<string, bigint>) ?? {};
    return { tokenToDecimals, tokenToPrices };
  }, [tokenDecimals, tokenAddresses, tokenPrices]);

  // Aggregate into supply/borrow positions
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];
    if (!userPositions) return { suppliedPositions: supplied, borrowedPositions: borrowed };
    const positions = userPositions as unknown as UserPositionTuple[];
    const rates = interestRates as unknown as InterestState[];

    positions.forEach((position, index) => {
      const underlying = `0x${position[0].toString(16).padStart(64, "0")}`;
      const symbol = feltToString(position[1]);
      const debtBalance = position[2];
      const collateralBalance = position[3];
      const interestRate = rates?.[index];

      const supplyAPY = interestRate ? Number(interestRate.lending_rate) / 1e16 : 0;
      const borrowAPR = interestRate ? Number(interestRate.borrowing_rate) / 1e16 : 0;

      const decimals = tokenToDecimals[underlying];
      const tokenPrice = tokenToPrices[underlying] ?? 0n;
      const tokenPriceNumber = Number(tokenPrice) / 1e8;
      const suppliedAmount = Number(formatUnits(collateralBalance, decimals));
      const borrowedAmount = Number(formatUnits(debtBalance, decimals));

      supplied.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: suppliedAmount * tokenPriceNumber,
        tokenBalance: collateralBalance,
        currentRate: supplyAPY,
        tokenAddress: underlying,
        tokenDecimals: decimals,
        tokenPrice,
      });

      borrowed.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: -borrowedAmount * tokenPriceNumber,
        tokenBalance: debtBalance,
        currentRate: borrowAPR,
        tokenAddress: underlying,
        tokenDecimals: decimals,
        tokenPrice,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [userPositions, interestRates, tokenToDecimals, tokenToPrices]);

  return { suppliedPositions, borrowedPositions };
};

export default useNostraProtocolData;

