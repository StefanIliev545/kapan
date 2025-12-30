import { useMemo } from "react";
import { useNetworkAwareReadContract } from "./useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";
import { NetworkType } from "./useMovePositionData";
import { useLocalRateProvider } from "./useLocalRateProvider";
import { Address } from "viem";

interface UseOptimalRateArgs {
  networkType: NetworkType;
  tokenAddress: string;
  type: "borrow" | "supply";
}

/**
 * Fetches the optimal rate (borrow or supply) for a given token and network.
 * Uses local rate provider for EVM (aggregates gateway views) and contract for Starknet.
 */
export const useOptimalRate = ({ networkType, tokenAddress, type }: UseOptimalRateArgs) => {
  // For EVM, use local rate provider instead of OptimalInterestRateFinder
  const localRates = useLocalRateProvider(tokenAddress as Address, type === "borrow" ? "borrow" : "supply");

  // For Starknet, still use the contract (for now)
  const functionName =
    type === "borrow"
      ? "findOptimalBorrowRate"
      : "findOptimalSupplyRate";

  const { data } = useNetworkAwareReadContract({
    networkType,
    contractName: "OptimalInterestRateFinder",
    functionName,
    args: [tokenAddress],
    refetchInterval: 0,
  });

  return useMemo(() => {
    // EVM path: use local rate provider
    if (networkType === "evm") {
      return localRates.optimal;
    }

    // Starknet path: contract returns [protocol_felt, rate_scaled_1e16]
    if (networkType === "starknet" && data) {
      const protocol = feltToString(BigInt((data as any)?.[0]?.toString() || "0"));
      const rate = Number((data as any)?.[1]?.toString() || "0") / 1e16;
      return { protocol, rate };
    }

    return { protocol: "", rate: 0 };
  }, [networkType, data, localRates.optimal]);
};

