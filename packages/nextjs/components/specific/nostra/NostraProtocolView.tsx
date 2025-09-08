import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useAccount } from "~~/hooks/useAccount";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";

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
  // Use zero address when wallet is not connected
  const queryAddress = connectedAddress ? BigInt(connectedAddress) : 0n;

  // Fetch all supported assets to display even when the user is not connected
  const { data: assetInfos } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  // Get user positions
  const { data: userPositions } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 10000,
  });

  // Map asset info to addresses and symbols
  const { tokenAddresses, symbolMap } = useMemo(() => {
    if (!assetInfos) return { tokenAddresses: [], symbolMap: {} };
    const infos = assetInfos as unknown as any[];
    const tokenAddresses = infos.map(info => `0x${info[0].toString(16).padStart(64, "0")}`);
    const symbolMap = infos.reduce(
      (acc, info) => {
        acc[`0x${info[0].toString(16).padStart(64, "0")}`] = feltToString(info[1]);
        return acc;
      },
      {} as Record<string, string>,
    );
    return { tokenAddresses, symbolMap };
  }, [assetInfos]);

  // Build a map of user positions keyed by token address
  const userPositionMap = useMemo(() => {
    if (!userPositions) return {} as Record<string, UserPositionTuple>;
    const positions = userPositions as unknown as UserPositionTuple[];
    return positions.reduce((acc, position) => {
      const addr = `0x${position[0].toString(16).padStart(64, "0")}`;
      acc[addr] = position;
      return acc;
    }, {} as Record<string, UserPositionTuple>);
  }, [userPositions]);

  // Get interest rates for all supported assets
  const { data: interestRates } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [tokenAddresses],
    refetchInterval: 0,
  });

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

  // Aggregate positions by iterating over all supported tokens
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];
    const rates = interestRates as unknown as InterestState[] | undefined;

    tokenAddresses.forEach((underlying, index) => {
      const position = userPositionMap[underlying];
      const debtBalance = position ? position[2] : 0n;
      const collateralBalance = position ? position[3] : 0n;
      const symbol = symbolMap[underlying];
      const interestRate = rates?.[index];

      // Convert rates to APY/APR (rates are in RAY format - 1e27)
      const supplyAPY = interestRate ? Number(interestRate.lending_rate) / 1e16 : 0;
      const borrowAPR = interestRate ? Number(interestRate.borrowing_rate) / 1e16 : 0;

      // Convert token amounts to numbers and multiply by USD price to get fiat value
      const decimals = tokenToDecimals[underlying];
      const tokenPrice = tokenToPrices[underlying] ?? 0n;
      const tokenPriceNumber = Number(tokenPrice) / 1e8; // tokenPrice has 8 decimals of precision
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
  }, [tokenAddresses, userPositionMap, symbolMap, interestRates, tokenToDecimals, tokenToPrices]);

  return (
    <ProtocolView
      protocolName="Nostra"
      protocolIcon="/logos/nostra.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      networkType="starknet"
    />
  );
};

export default NostraProtocolView;
