import { useMemo } from "react";
import { Address } from "viem";
import { useAllProtocolRates } from "./useAllProtocolRates";

interface OptimalRateResult {
  protocol: string;
  rate: number;
}

/**
 * Local rate provider that aggregates rates from gateway views
 * Replaces OptimalInterestRateFinder contract calls
 * Uses batched reads from useAllProtocolRates for efficiency
 */
type UseLocalRateProviderOptions = {
  enabled?: boolean;
};

export const useLocalRateProvider = (
  tokenAddress: Address,
  type: "supply" | "borrow",
  options: UseLocalRateProviderOptions = {},
) => {
  const enabled = options.enabled ?? true;
  const { ratesMap, isLoading, getOptimalRate } = useAllProtocolRates({ enabled });

  const optimal: OptimalRateResult = useMemo(() => {
    if (!enabled) {
      return { protocol: "", rate: 0 };
    }
    const result = getOptimalRate(tokenAddress, type);
    return result || { protocol: "", rate: 0 };
  }, [enabled, getOptimalRate, tokenAddress, type]);

  // Return format compatible with OptimalInterestRateFinder
  // For EVM: returns [protocols: string[], rates: uint256[], success: bool[]]
  const allRates = useMemo(() => {
    const protocols: string[] = [];
    const rateValues: bigint[] = [];
    const successFlags: boolean[] = [];

    // Get rates for this token from all protocols
    if (!enabled) {
      return [[], [], []] as const;
    }

    const protocolRates = ratesMap.get(tokenAddress);
    if (!protocolRates) {
      return [[], [], []] as const;
    }

    const orderedProtocols = ["aave", "zerolend", "compound", "venus"] as const;
    for (const proto of orderedProtocols) {
      const tokenRate = protocolRates.get(proto);
      if (tokenRate) {
        protocols.push(proto);
        const rate = type === "supply" ? tokenRate.supplyRate : tokenRate.borrowRate;
        // Convert back to 1e8 scale for compatibility
        rateValues.push(BigInt(Math.round(rate * 1e8)));
        successFlags.push(true);
      }
    }

    return [protocols, rateValues, successFlags] as const;
  }, [enabled, ratesMap, tokenAddress, type]);

  // Raw rates array for convenience
  const rates = useMemo(() => {
    if (!enabled) return [];
    const result: Array<{ protocol: string; rate: number; success: boolean }> = [];
    const protocolRates = ratesMap.get(tokenAddress);
    if (!protocolRates) return result;

    protocolRates.forEach((tokenRate) => {
      result.push({
        protocol: tokenRate.protocol,
        rate: type === "supply" ? tokenRate.supplyRate : tokenRate.borrowRate,
        success: true,
      });
    });
    return result;
  }, [enabled, ratesMap, tokenAddress, type]);

  return {
    optimal,
    allRates,
    isLoading: enabled ? isLoading : false,
    rates,
  };
};

