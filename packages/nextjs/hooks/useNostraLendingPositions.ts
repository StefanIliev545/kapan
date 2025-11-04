import { useMemo } from "react";
import { formatUnits } from "viem";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useAccount } from "~~/hooks/useAccount";
import { useNostraAssets } from "~~/hooks/useNostraAssets";
import { useScaffoldReadContract } from "./scaffold-stark";

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
  const { viewingAddress } = useAccount();

  const { assets, rateMap, priceMap, decimalsMap, isLoading: isLoadingAssets } = useNostraAssets();

  const userPositionsQuery = useScaffoldReadContract({
    contractName: "NostraGateway",
    functionName: "get_user_positions",
    args: [viewingAddress],
    refetchInterval: 10000,
  });

  const positionMap = useMemo(
    () => parseUserPositions(userPositionsQuery.data),
    [userPositionsQuery.data],
  );

  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    assets.forEach(asset => {
      const { address: tokenAddress, symbol } = asset;
      const decimals = decimalsMap[tokenAddress];
      if (decimals === undefined) {
        return;
      }
      const position = positionMap[tokenAddress];
      const debtBalance = position?.debtBalance ?? 0n;
      const collateralBalance = position?.collateralBalance ?? 0n;
      const rates = rateMap[tokenAddress];
      const priceWithEightDecimals = priceMap[tokenAddress] ?? 0n;

      const supplyAPY = rates?.supplyAPY ?? 0;
      const borrowAPR = rates?.borrowAPR ?? 0;

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
  }, [assets, positionMap, rateMap, priceMap, decimalsMap]);

  const isLoading = isLoadingAssets || userPositionsQuery.isLoading;

  return {
    suppliedPositions,
    borrowedPositions,
    isLoading,
  };
};

export type UseNostraLendingPositionsResult = ReturnType<typeof useNostraLendingPositions>;
