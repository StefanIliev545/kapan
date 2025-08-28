import { useMemo } from "react";
import { useNetworkAwareReadContract } from "./useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";
import { NetworkType } from "./useNetworkType";

interface UseOptimalRateArgs {
  networkType: NetworkType;
  tokenAddress: string;
  type: "borrow" | "supply";
}

/**
 * Fetches the optimal rate (borrow or supply) for a given token and network.
 * Wraps useNetworkAwareReadContract and parses the result into a usable format.
 */
export const useOptimalRate = ({ networkType, tokenAddress, type }: UseOptimalRateArgs) => {
  const functionName = type === "borrow" ? "findOptimalBorrowRate" : "findOptimalSupplyRate";

  const { data } = useNetworkAwareReadContract({
    networkType,
    contractName: "OptimalInterestRateFinder",
    functionName,
    args: [tokenAddress],
    refetchInterval: 0,
  });

  return useMemo(() => {
    if (!data) return { protocol: "", rate: 0 };

    let protocol: string;
    let rate: number;
    if (networkType === "starknet") {
      protocol = feltToString(BigInt(data?.[0]?.toString() || "0"));
      rate = Number(data?.[1]?.toString() || "0") / 1e16;
    } else {
      protocol = data?.[0]?.toString() || "";
      rate = Number(data?.[1]?.toString() || "0") / 1e16;
    }

    return { protocol, rate };
  }, [data, networkType]);
};

