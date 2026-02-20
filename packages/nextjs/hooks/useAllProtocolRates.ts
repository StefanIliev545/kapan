import { useMemo, useCallback } from "react";
import { useReadContracts } from "wagmi";
import { Address, Abi } from "viem";
import { useScaffoldReadContract, useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { useExternalYields } from "~~/hooks/useExternalYields";
import { aaveRateToAPY, compoundRateToAPR, venusRateToAPY } from "~~/utils/protocolRates";

type ProtocolKey = "aave" | "compound" | "venus" | "spark";

interface TokenRate {
  token: Address;
  symbol: string;
  supplyRate: number;
  borrowRate: number;
  protocol: ProtocolKey;
}

/**
 * Fetches rates for ALL tokens from all protocols in batched calls
 * This is more efficient than calling per-token
 */
export const useAllProtocolRates = ({ enabled: enabledProp = true }: { enabled?: boolean } = {}) => {
  const enabled = enabledProp;
  const { getEffectiveSupplyRate } = useExternalYields();
  const { address: userAddress } = useAccount();
  const queryAddress = (userAddress || "0x0000000000000000000000000000000000000000") as Address;

  // Aave-like protocols: getAllTokensInfo already includes rates for all tokens
  const { data: aaveTokensInfo, isLoading: aaveLoading } = useScaffoldReadContract({
    contractName: "AaveGatewayView",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    query: { enabled },
  });

  // Spark (mainnet only, Aave fork)
  const sparkGatewayName = "SparkGatewayView" as any;
  const { data: sparkGateway } = useDeployedContractInfo({ contractName: sparkGatewayName });
  const sparkReadConfig = {
    contractName: sparkGatewayName,
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    query: { enabled: enabled && !!sparkGateway?.address },
  };
  const { data: sparkTokensInfo, isLoading: sparkLoading } = useScaffoldReadContract(sparkReadConfig as any);

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

    const addAaveLikeRates = (tokensInfo: any[] | undefined, protocol: Extract<ProtocolKey, "aave" | "spark">) => {
      if (tokensInfo && Array.isArray(tokensInfo)) {
        tokensInfo.forEach((tokenInfo: any) => {
          if (tokenInfo?.token) {
            const token = tokenInfo.token as Address;
            const symbol = tokenInfo.symbol || "";
            const rawSupply = aaveRateToAPY(BigInt(tokenInfo.supplyRate || 0));
            if (!map.has(token)) {
              map.set(token, new Map());
            }
            map.get(token)?.set(protocol, {
              token,
              symbol,
              supplyRate: getEffectiveSupplyRate(token, symbol, rawSupply),
              borrowRate: aaveRateToAPY(BigInt(tokenInfo.borrowRate || 0)),
              protocol,
            });
          }
        });
      }
    };

    const sparkArray = Array.isArray(sparkTokensInfo) ? [...sparkTokensInfo] : [];

    addAaveLikeRates(aaveTokensInfo as any[], "aave");
    addAaveLikeRates(sparkArray as any[], "spark");

    // Venus rates
    if (venusMarkets && venusRates && Array.isArray(venusMarkets) && Array.isArray(venusRates)) {
      const [, tokens, symbols] = venusMarkets as unknown as [Address[], Address[], string[]];
      const [, supplyRates, borrowRates] = venusRates as unknown as [bigint[], bigint[], bigint[]];
      if (tokens && supplyRates && borrowRates) {
        tokens.forEach((token, i) => {
          if (token && token !== "0x0000000000000000000000000000000000000000") {
            const symbol = symbols?.[i] || "";
            const rawSupply = venusRateToAPY(supplyRates[i] || 0n);
            if (!map.has(token)) {
              map.set(token, new Map());
            }
            map.get(token)?.set("venus", {
              token,
              symbol,
              supplyRate: getEffectiveSupplyRate(token, symbol, rawSupply),
              borrowRate: venusRateToAPY(borrowRates[i] || 0n),
              protocol: "venus",
            });
          }
        });
      }
    }

    // Build token→symbol lookup from Aave-like data for protocols that lack symbols
    const symbolLookup = new Map<Address, string>();
    for (const [token, protocols] of map) {
      for (const rate of protocols.values()) {
        if (rate.symbol) {
          symbolLookup.set(token, rate.symbol);
          break;
        }
      }
    }

    // Compound rates
    if (compoundResults && compoundBaseTokens) {
      const baseTokens = compoundBaseTokens as Address[];
      compoundResults.forEach((result, i) => {
        if (result?.status === "success" && result.result && baseTokens[i]) {
          const token = baseTokens[i];
          const symbol = symbolLookup.get(token) || "";
          const [supplyRate, borrowRate] = result.result as [bigint, bigint];
          const rawSupply = compoundRateToAPR(supplyRate || 0n);
          if (!map.has(token)) {
            map.set(token, new Map());
          }
          map.get(token)?.set("compound", {
            token,
            symbol,
            supplyRate: getEffectiveSupplyRate(token, symbol, rawSupply),
            borrowRate: compoundRateToAPR(borrowRate || 0n),
            protocol: "compound",
          });
        }
      });
    }

    return map;
  }, [enabled, aaveTokensInfo, sparkTokensInfo, venusMarkets, venusRates, compoundResults, compoundBaseTokens, getEffectiveSupplyRate]);

  const isLoading = enabled
    ? aaveLoading || sparkLoading || venusMarketsLoading || venusRatesLoading || compoundBaseLoading || compoundDataLoading
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
      const allProtocols: ProtocolKey[] = ["aave", "spark", "venus", "compound"];
      for (const proto of allProtocols) {
        const r = protocolRates.get(proto);
        if (r) {
          candidates.push({ protocol: proto, rate: type === "supply" ? r.supplyRate : r.borrowRate });
        }
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
