import { useMemo } from "react";
import { formatUnits, type Abi, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth/useSelectedNetwork";
import formatPercentage from "~~/utils/formatPercentage";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
const RATE_SCALE = 1e18;

const CHAIN_ID_TO_NETWORK: Record<number, MarketData["network"]> = {
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  59144: "linea",
};

const convertRateToApr = (ratePerSecond: bigint): number =>
  (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / RATE_SCALE;

type UseCompoundMarketDataParams = {
  chainId?: number;
};

export const useCompoundMarketData = ({ chainId }: UseCompoundMarketDataParams = {}): MarketData[] => {
  const selectedNetwork = useSelectedNetwork(chainId as any);
  const resolvedChainId = chainId ?? selectedNetwork.id;
  const network = CHAIN_ID_TO_NETWORK[resolvedChainId] ?? "arbitrum";

  const { data: weth } = useDeployedContractInfo({ contractName: "eth" as any, chainId: resolvedChainId as any });
  const { data: usdc } = useDeployedContractInfo({ contractName: "USDC" as any, chainId: resolvedChainId as any });
  const { data: usdt } = useDeployedContractInfo({ contractName: "USDT" as any, chainId: resolvedChainId as any });
  const { data: usdcE } = useDeployedContractInfo({ contractName: "USDCe" as any, chainId: resolvedChainId as any });
  const { data: compoundGateway } = useDeployedContractInfo({
    contractName: "CompoundGatewayView",
    chainId: resolvedChainId as any,
  });

  const baseTokens = useMemo(
    () => [
      { symbol: "WETH", address: weth?.address },
      { symbol: "USDC", address: usdc?.address },
      { symbol: "USDT", address: usdt?.address },
      { symbol: "USDC.e", address: usdcE?.address },
    ],
    [weth?.address, usdc?.address, usdt?.address, usdcE?.address],
  );

  const preparedTokens = useMemo(
    () =>
      baseTokens
        .filter(token => Boolean(token.address))
        .map(token => ({ symbol: token.symbol, address: token.address as Address })),
    [baseTokens],
  );

  const contracts = useMemo(() => {
    if (!compoundGateway?.address || !compoundGateway?.abi) {
      return [];
    }

    const contractBase = {
      address: compoundGateway.address as Address,
      abi: compoundGateway.abi as Abi,
      functionName: "getCompoundData" as const,
    };

    return preparedTokens.map(token => ({
      ...contractBase,
      args: [token.address, ZERO_ADDRESS] as const,
      ...(resolvedChainId ? { chainId: resolvedChainId } : {}),
    }));
  }, [compoundGateway?.address, compoundGateway?.abi, preparedTokens, resolvedChainId]);

  const { data: results } = useReadContracts({
    contracts,
    allowFailure: true,
    query: {
      enabled: contracts.length > 0,
      staleTime: 10_000,
    },
  });

  return useMemo(() => {
    if (!results) return [];

    return preparedTokens.flatMap((token, index) => {
      const callResult = results[index];
      if (!callResult || callResult.status !== "success" || !callResult.result) {
        return [];
      }

      const [supplyRate, borrowRate, , , price] = callResult.result as readonly [
        bigint | number,
        bigint | number,
        unknown,
        unknown,
        bigint | number,
      ];

      const supplyApr = supplyRate ? convertRateToApr(BigInt(supplyRate)) : 0;
      const borrowApr = borrowRate ? convertRateToApr(BigInt(borrowRate)) : 0;
      const utilization = borrowApr > 0 ? (supplyApr / borrowApr) * 100 : 0;
      const priceValue = price ? (typeof price === "bigint" ? price : BigInt(price)) : 0n;
      const priceFormatted = price ? Number(formatUnits(priceValue, 8)).toFixed(2) : "0.00";

      return [
        {
          icon: tokenNameToLogo(token.symbol),
          name: token.symbol,
          supplyRate: `${formatPercentage(supplyApr)}%`,
          borrowRate: `${formatPercentage(borrowApr)}%`,
          price: priceFormatted,
          utilization: utilization.toFixed(2),
          address: token.address,
          networkType: "evm",
          network,
          protocol: "compound",
        } satisfies MarketData,
      ];
    });
  }, [preparedTokens, results, network]);
};

