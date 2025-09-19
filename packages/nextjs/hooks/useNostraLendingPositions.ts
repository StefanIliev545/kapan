import { useMemo } from "react";
import { formatUnits } from "viem";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useAccount } from "~~/hooks/useAccount";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useNostraTokens } from "~~/contexts/NostraTokensContext";

const toHexAddress = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

type ParsedPosition = {
  debtBalance: bigint;
  collateralBalance: bigint;
};

const parseUserPositions = (positions: unknown): Record<string, ParsedPosition> => {
  if (!positions) return {};

  const entries = Array.isArray(positions)
    ? positions
    : typeof positions === "object"
      ? Object.values(positions as Record<string, unknown>)
      : [];

  return entries.reduce<Record<string, ParsedPosition>>((acc, entry) => {
    if (!entry) return acc;

    let addressRaw: unknown;
    let debtRaw: unknown;
    let collateralRaw: unknown;

    if (Array.isArray(entry)) {
      if (entry.length < 4) return acc;
      [addressRaw, , debtRaw, collateralRaw] = entry;
    } else if (typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      addressRaw = obj[0] ?? obj["0"] ?? obj.address;
      debtRaw = obj[2] ?? obj["2"] ?? obj.debt_balance;
      collateralRaw = obj[3] ?? obj["3"] ?? obj.collateral_balance;
    } else {
      return acc;
    }

    if (typeof addressRaw !== "bigint" || typeof debtRaw !== "bigint" || typeof collateralRaw !== "bigint") {
      return acc;
    }

    acc[toHexAddress(addressRaw)] = {
      debtBalance: debtRaw,
      collateralBalance: collateralRaw,
    };

    return acc;
  }, {});
};

const computeUsdValue = (amount: bigint, decimals: number, priceWithEightDecimals: bigint): number => {
  if (amount === 0n || priceWithEightDecimals === 0n) {
    return 0;
  }

  const tokenAmount = Number(formatUnits(amount, decimals));
  const priceAsNumber = Number(priceWithEightDecimals) / 1e8;

  return tokenAmount * priceAsNumber;
};

export const useNostraLendingPositions = () => {
  const { address } = useAccount();
  const queryAddress = address ? BigInt(address) : 0n;

  const { tokens, isLoading: isLoadingTokens } = useNostraTokens();

  const userPositionsQuery = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [queryAddress],
    refetchInterval: 10000,
  });

  const positionMap = useMemo(
    () => parseUserPositions(userPositionsQuery.data),
    [userPositionsQuery.data],
  );

  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    tokens.forEach(token => {
      const { address: tokenAddress, symbol, decimals, supplyAPY, borrowAPR, priceWithEightDecimals } = token;
      const position = positionMap[tokenAddress];
      const debtBalance = position?.debtBalance ?? 0n;
      const collateralBalance = position?.collateralBalance ?? 0n;

      const suppliedValue = computeUsdValue(collateralBalance, decimals, priceWithEightDecimals);
      const borrowedValue = computeUsdValue(debtBalance, decimals, priceWithEightDecimals);

      supplied.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: suppliedValue,
        tokenBalance: collateralBalance,
        currentRate: supplyAPY,
        tokenAddress,
        tokenDecimals: decimals,
        tokenPrice: priceWithEightDecimals,
        tokenSymbol: symbol,
      });

      borrowed.push({
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        balance: -borrowedValue,
        tokenBalance: debtBalance,
        currentRate: borrowAPR,
        tokenAddress,
        tokenDecimals: decimals,
        tokenPrice: priceWithEightDecimals,
        tokenSymbol: symbol,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [tokens, positionMap]);

  const isLoading = isLoadingTokens || userPositionsQuery.isLoading;

  return {
    suppliedPositions,
    borrowedPositions,
    isLoading,
  };
};

export type UseNostraLendingPositionsResult = ReturnType<typeof useNostraLendingPositions>;
