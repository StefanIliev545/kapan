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
  const functionName =
    networkType === "evm"
      ? type === "borrow"
        ? "getAllProtocolBorrowRates"
        : "getAllProtocolRates"
      : type === "borrow"
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
    if (!data) return { protocol: "", rate: 0 };

    // Starknet path: contract returns [protocol_felt, rate_scaled_1e16]
    if (networkType === "starknet") {
      const protocol = feltToString(BigInt((data as any)?.[0]?.toString() || "0"));
      const rate = Number((data as any)?.[1]?.toString() || "0") / 1e16;
      return { protocol, rate };
    }

    // EVM path: contract returns [protocols: string[], rates: uint256[], success: bool[]]
    const [protocols, rates, success] = data as unknown as [string[], bigint[] | string[], boolean[]];
    let bestIx = -1;
    let bestRate: bigint | undefined;
    for (let i = 0; i < (rates?.length || 0); i++) {
      const ok = success?.[i];
      const r = BigInt((rates as any)[i] ?? 0);
      if (!ok) continue;

      if (bestRate === undefined) {
        bestRate = r;
        bestIx = i;
        continue;
      }

      // For supply we want the highest rate, for borrow the lowest
      if (type === "borrow" ? r < bestRate : r > bestRate) {
        bestRate = r;
        bestIx = i;
      }
    }

    if (bestIx === -1 || bestRate === undefined) return { protocol: "", rate: 0 };

    const protocol = protocols?.[bestIx] || "";
    // EVM rates are scaled by 1e8 per useProtocolRates/useTokenData
    const rate = Number(bestRate) / 1e8;
    return { protocol, rate };
  }, [data, networkType, type]);
};

