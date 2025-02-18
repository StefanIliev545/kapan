import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface ProtocolRate {
  protocol: string;
  supplyRate: number;
  borrowRate: number;
  isOptimal: boolean;
}

export const useProtocolRates = (tokenAddress: string) => {
  // Get all protocol rates
  const { data: allRates, isLoading: ratesLoading } = useScaffoldReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: "getAllProtocolRates",
    args: [tokenAddress],
  });

  // Transform the data into a consistent format
  const rates: ProtocolRate[] = [];

  if (allRates) {
    const [protocols, rateValues, successFlags] = allRates;

    // Find the highest rate among successful responses
    let maxRate = 0n;
    for (let i = 0; i < protocols.length; i++) {
      if (successFlags[i] && rateValues[i] > maxRate) {
        maxRate = rateValues[i];
      }
    }

    // Create rate objects and mark the highest as optimal
    for (let i = 0; i < protocols.length; i++) {
      if (successFlags[i]) {
        rates.push({
          protocol: protocols[i],
          supplyRate: Number(rateValues[i]) / 1e8, // Already converted in contract
          borrowRate: 0, // We'll add this when needed
          isOptimal: rateValues[i] === maxRate,
        });
      }
    }
  }

  return {
    data: rates,
    isLoading: ratesLoading,
    error: null,
  };
};