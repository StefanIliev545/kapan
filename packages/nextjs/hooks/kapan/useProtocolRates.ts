import { useLocalRateProvider } from "~~/hooks/useLocalRateProvider";
import { Address } from "viem";

interface ProtocolRate {
  protocol: string;
  supplyRate: number;
  borrowRate: number;
  isOptimal: boolean;
}

export const useProtocolRates = (tokenAddress: string) => {
  // Use local rate provider instead of OptimalInterestRateFinder
  const supplyRates = useLocalRateProvider(tokenAddress as Address, "supply");
  const borrowRates = useLocalRateProvider(tokenAddress as Address, "borrow");

  // Transform the data into a consistent format
  const rates: ProtocolRate[] = [];

  // Combine supply and borrow rates
  const protocolMap = new Map<string, { supplyRate: number; borrowRate: number }>();

  // Add supply rates
  supplyRates.rates.forEach(rate => {
    protocolMap.set(rate.protocol, {
      supplyRate: rate.rate,
      borrowRate: 0, // Will be filled by borrow rates
    });
  });

  // Add borrow rates
  borrowRates.rates.forEach(rate => {
    const existing = protocolMap.get(rate.protocol);
    if (existing) {
      existing.borrowRate = rate.rate;
    } else {
      protocolMap.set(rate.protocol, {
        supplyRate: 0,
        borrowRate: rate.rate,
      });
    }
  });

  // Find the highest supply rate for optimal marking
  let maxSupplyRate = 0;
  protocolMap.forEach(({ supplyRate }) => {
    if (supplyRate > maxSupplyRate) {
      maxSupplyRate = supplyRate;
    }
  });

  // Convert to array format
  protocolMap.forEach(({ supplyRate, borrowRate }, protocol) => {
    rates.push({
      protocol,
      supplyRate,
      borrowRate,
      isOptimal: supplyRate === maxSupplyRate && supplyRate > 0,
    });
  });

  return {
    data: rates,
    isLoading: supplyRates.isLoading || borrowRates.isLoading,
    error: null,
  };
};