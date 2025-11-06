import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { Address, Abi } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

interface ProtocolRate {
  protocol: string;
  rate: number;
  success: boolean;
}

interface OptimalRateResult {
  protocol: string;
  rate: number;
}

// Rate conversion helpers
const convertAaveRate = (rate: bigint): number => Number(rate) / 1e25;

const convertCompoundRate = (ratePerSecond: bigint): number => {
  const SECONDS_PER_YEAR = 60 * 60 * 24 * 365; // 31536000
  return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / 1e18;
};

const convertVenusRate = (ratePerBlock: bigint): number => {
  const ethMantissa = 1e18;
  const blocksPerDay = 60 * 60 * 24; // 86400
  const daysPerYear = 365;
  const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
  return (Math.pow(ratePerBlockNum * blocksPerDay + 1, daysPerYear - 1) - 1) * 100;
};

/**
 * Local rate provider that aggregates rates from gateway views
 * Replaces OptimalInterestRateFinder contract calls
 * Uses batched reads (useReadContracts) for efficiency
 */
export const useLocalRateProvider = (tokenAddress: Address, type: "supply" | "borrow") => {
  const functionName = type === "borrow" ? "getBorrowRate" : "getSupplyRate";

  // Get contract info for all three gateways
  const { data: aaveGateway } = useDeployedContractInfo({ contractName: "AaveGatewayView" });
  const { data: compoundGateway } = useDeployedContractInfo({ contractName: "CompoundGatewayView" });
  const { data: venusGateway } = useDeployedContractInfo({ contractName: "VenusGatewayView" });

  // Build batched contract calls
  const contracts = useMemo(() => {
    const calls: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args: [Address];
    }> = [];

    if (aaveGateway?.address && aaveGateway?.abi) {
      calls.push({
        address: aaveGateway.address as Address,
        abi: aaveGateway.abi as Abi,
        functionName,
        args: [tokenAddress],
      });
    }

    if (compoundGateway?.address && compoundGateway?.abi) {
      calls.push({
        address: compoundGateway.address as Address,
        abi: compoundGateway.abi as Abi,
        functionName,
        args: [tokenAddress],
      });
    }

    if (venusGateway?.address && venusGateway?.abi) {
      calls.push({
        address: venusGateway.address as Address,
        abi: venusGateway.abi as Abi,
        functionName,
        args: [tokenAddress],
      });
    }

    return calls;
  }, [aaveGateway, compoundGateway, venusGateway, functionName, tokenAddress]);

  // Batch read all rates in a single RPC call
  const { data: rateResults, isLoading } = useReadContracts({
    contracts,
    allowFailure: true,
    query: {
      enabled: contracts.length > 0,
    },
  });

  const rates: ProtocolRate[] = useMemo(() => {
    const result: ProtocolRate[] = [];

    if (!rateResults || rateResults.length === 0) return result;

    // Aave: returns (uint256 rate, bool success)
    const aaveResult = rateResults[0];
    if (aaveResult?.status === "success" && aaveResult.result) {
      const [rate, success] = aaveResult.result as [bigint, boolean];
      if (success && rate !== undefined) {
        result.push({
          protocol: "aave",
          rate: convertAaveRate(rate),
          success: true,
        });
      }
    }

    // Compound: returns (uint256 rate, bool success)
    const compoundResult = rateResults[1];
    if (compoundResult?.status === "success" && compoundResult.result) {
      const [rate, success] = compoundResult.result as [bigint, boolean];
      if (success && rate !== undefined) {
        result.push({
          protocol: "compound",
          rate: convertCompoundRate(rate),
          success: true,
        });
      }
    }

    // Venus: returns (uint256 rate, bool success)
    const venusResult = rateResults[2];
    if (venusResult?.status === "success" && venusResult.result) {
      const [rate, success] = venusResult.result as [bigint, boolean];
      if (success && rate !== undefined) {
        result.push({
          protocol: "venus",
          rate: convertVenusRate(rate),
          success: true,
        });
      }
    }

    return result;
  }, [rateResults]);

  // Find optimal rate (highest for supply, lowest for borrow)
  const optimal: OptimalRateResult = useMemo(() => {
    const successfulRates = rates.filter(r => r.success && r.rate > 0);
    if (successfulRates.length === 0) {
      return { protocol: "", rate: 0 };
    }

    const sorted = [...successfulRates].sort((a, b) => {
      // For supply: highest rate is best, for borrow: lowest rate is best
      return type === "supply" ? b.rate - a.rate : a.rate - b.rate;
    });

    return {
      protocol: sorted[0].protocol,
      rate: sorted[0].rate,
    };
  }, [rates, type]);

  // Return format compatible with OptimalInterestRateFinder
  // For EVM: returns [protocols: string[], rates: uint256[], success: bool[]]
  const allRates = useMemo(() => {
    const protocols: string[] = [];
    const rateValues: bigint[] = [];
    const successFlags: boolean[] = [];

    // Add rates in consistent order: aave, compound, venus
    const orderedProtocols = ["aave", "compound", "venus"] as const;
    for (const proto of orderedProtocols) {
      const rateData = rates.find(r => r.protocol === proto);
      if (rateData) {
        protocols.push(proto);
        // Convert back to 1e8 scale for compatibility
        rateValues.push(BigInt(Math.round(rateData.rate * 1e8)));
        successFlags.push(rateData.success);
      }
    }

    return [protocols, rateValues, successFlags] as const;
  }, [rates]);

  return {
    optimal,
    allRates,
    isLoading,
    rates, // Raw rates array for convenience
  };
};

