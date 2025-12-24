import { useMemo, useCallback } from "react";
import { useReadContracts } from "wagmi";
import { Address, Abi } from "viem";
import { useScaffoldReadContract, useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useAccount } from "wagmi";

type ProtocolKey = "aave" | "compound" | "venus" | "zerolend";

interface TokenRate {
  token: Address;
  supplyRate: number;
  borrowRate: number;
  protocol: ProtocolKey;
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
 * Fetches rates for ALL tokens from all protocols in batched calls
 * This is more efficient than calling per-token
 */
export const useAllProtocolRates = ({ enabled: enabledProp = true }: { enabled?: boolean } = {}) => {
  const enabled = enabledProp;
  const { address: userAddress } = useAccount();
  const queryAddress = (userAddress || "0x0000000000000000000000000000000000000000") as Address;

  // Aave-like protocols: getAllTokensInfo already includes rates for all tokens
  const { data: aaveTokensInfo, isLoading: aaveLoading } = useScaffoldReadContract({
    contractName: "AaveGatewayView",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    query: { enabled },
  });

  const { data: zeroLendGateway } = useDeployedContractInfo({ contractName: "ZeroLendGatewayView" });
  const { data: zerolendTokensInfo, isLoading: zerolendLoading } = useScaffoldReadContract({
    contractName: "ZeroLendGatewayView",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    query: { enabled: enabled && !!zeroLendGateway?.address },
  });

  // Venus: getAllVenusMarkets + getMarketRates (batched)
  const { data: venusMarkets, isLoading: venusMarketsLoading } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getAllVenusMarkets",
    query: { enabled },
  });

  const vTokens: Address[] | undefined = useMemo(() => {
    if (!venusMarkets || !Array.isArray(venusMarkets)) return undefined;
    const tokens = venusMarkets[0];
    if (!tokens || !Array.isArray(tokens)) return undefined;
    return tokens as Address[];
  }, [venusMarkets]);

  const { data: venusRates, isLoading: venusRatesLoading } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getMarketRates",
    args: vTokens ? ([vTokens] as [Address[]]) : undefined,
    query: {
      enabled: enabled && !!vTokens && vTokens.length > 0,
    },
  } as any);

  // Compound: Batch getCompoundData for all base tokens
  const { data: compoundBaseTokens, isLoading: compoundBaseLoading } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "allActiveBaseTokens",
    query: { enabled },
  });

  const { data: compoundGateway } = useDeployedContractInfo({ contractName: "CompoundGatewayView" });

  const compoundCalls = useMemo(() => {
    if (!enabled || !compoundBaseTokens || !compoundGateway?.address || !compoundGateway?.abi) return [];
    const baseTokens = compoundBaseTokens as Address[];
    return baseTokens.map(token => ({
      address: compoundGateway.address as Address,
      abi: compoundGateway.abi as Abi,
      functionName: "getCompoundData" as const,
      args: [token, queryAddress] as [Address, Address],
    }));
  }, [enabled, compoundBaseTokens, compoundGateway, queryAddress]);

  const { data: compoundResults, isLoading: compoundDataLoading } = useReadContracts({
    contracts: compoundCalls,
    allowFailure: true,
    query: {
      enabled: enabled && compoundCalls.length > 0,
    },
  });

  // Parse all rates into a unified map
  // Map structure: tokenAddress -> { protocol -> rate }
  const ratesMap = useMemo(() => {
    if (!enabled) {
      return new Map<Address, Map<ProtocolKey, TokenRate>>();
    }
    const map = new Map<Address, Map<ProtocolKey, TokenRate>>();

    const addAaveLikeRates = (tokensInfo: any[] | undefined, protocol: Extract<ProtocolKey, "aave" | "zerolend">) => {
      if (tokensInfo && Array.isArray(tokensInfo)) {
        tokensInfo.forEach((tokenInfo: any) => {
          if (tokenInfo?.token) {
            const token = tokenInfo.token as Address;
            if (!map.has(token)) {
              map.set(token, new Map());
            }
            map.get(token)?.set(protocol, {
              token,
              supplyRate: convertAaveRate(BigInt(tokenInfo.supplyRate || 0)),
              borrowRate: convertAaveRate(BigInt(tokenInfo.borrowRate || 0)),
              protocol,
            });
          }
        });
      }
    };

    addAaveLikeRates(aaveTokensInfo as any[], "aave");
    addAaveLikeRates(zerolendTokensInfo as any[], "zerolend");

    // Venus rates
    if (venusMarkets && venusRates && Array.isArray(venusMarkets) && Array.isArray(venusRates)) {
      const [, tokens] = venusMarkets as unknown as [Address[], Address[]];
      const [, supplyRates, borrowRates] = venusRates as unknown as [bigint[], bigint[], bigint[]];
      if (tokens && supplyRates && borrowRates) {
        tokens.forEach((token, i) => {
          if (token && token !== "0x0000000000000000000000000000000000000000") {
            if (!map.has(token)) {
              map.set(token, new Map());
            }
            map.get(token)?.set("venus", {
              token,
              supplyRate: convertVenusRate(supplyRates[i] || 0n),
              borrowRate: convertVenusRate(borrowRates[i] || 0n),
              protocol: "venus",
            });
          }
        });
      }
    }

    // Compound rates
    if (compoundResults && compoundBaseTokens) {
      const baseTokens = compoundBaseTokens as Address[];
      compoundResults.forEach((result, i) => {
        if (result?.status === "success" && result.result && baseTokens[i]) {
          const token = baseTokens[i];
          const [supplyRate, borrowRate] = result.result as [bigint, bigint];
          if (!map.has(token)) {
            map.set(token, new Map());
          }
          map.get(token)?.set("compound", {
            token,
            supplyRate: convertCompoundRate(supplyRate || 0n),
            borrowRate: convertCompoundRate(borrowRate || 0n),
            protocol: "compound",
          });
        }
      });
    }

    return map;
  }, [enabled, aaveTokensInfo, zerolendTokensInfo, venusMarkets, venusRates, compoundResults, compoundBaseTokens]);

  const isLoading = enabled
    ? aaveLoading || zerolendLoading || venusMarketsLoading || venusRatesLoading || compoundBaseLoading || compoundDataLoading
    : false;

  return {
    ratesMap,
    isLoading,
    // Helper to get rate for a specific token
    getRate: useCallback((token: Address, type: "supply" | "borrow"): { protocol: string; rate: number } | null => {
      const protocolRates = ratesMap.get(token);
      if (!protocolRates || protocolRates.size === 0) return null;
      // Return first available rate (could be improved to return optimal)
      const firstRate = Array.from(protocolRates.values())[0];
      return {
        protocol: firstRate.protocol,
        rate: type === "supply" ? firstRate.supplyRate : firstRate.borrowRate,
      };
    }, [ratesMap]),
    // Get optimal rate across all protocols for a token
    getOptimalRate: useCallback((token: Address, type: "supply" | "borrow"): { protocol: string; rate: number } | null => {
      const protocolRates = ratesMap.get(token);
      if (!protocolRates || protocolRates.size === 0) return null;

      const candidates: Array<{ protocol: string; rate: number }> = [];
      
      const aaveRate = protocolRates.get("aave");
      if (aaveRate) {
        candidates.push({
          protocol: "aave",
          rate: type === "supply" ? aaveRate.supplyRate : aaveRate.borrowRate,
        });
      }
      
      const zerolendRate = protocolRates.get("zerolend");
      if (zerolendRate) {
        candidates.push({
          protocol: "zerolend",
          rate: type === "supply" ? zerolendRate.supplyRate : zerolendRate.borrowRate,
        });
      }
      
      const venusRate = protocolRates.get("venus");
      if (venusRate) {
        candidates.push({
          protocol: "venus",
          rate: type === "supply" ? venusRate.supplyRate : venusRate.borrowRate,
        });
      }
      
      const compoundRate = protocolRates.get("compound");
      if (compoundRate) {
        candidates.push({
          protocol: "compound",
          rate: type === "supply" ? compoundRate.supplyRate : compoundRate.borrowRate,
        });
      }

      if (candidates.length === 0) return null;

      // For supply: highest rate is best, for borrow: lowest rate is best
      const sorted = candidates.sort((a, b) =>
        type === "supply" ? b.rate - a.rate : a.rate - b.rate
      );

      return sorted[0];
    }, [ratesMap]),
  };
};
