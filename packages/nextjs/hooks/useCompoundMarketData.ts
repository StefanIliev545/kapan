import { useMemo } from "react";
import { formatUnits, type Abi, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth/useSelectedNetwork";
import { useExternalYields } from "~~/hooks/useExternalYields";
import formatPercentage from "~~/utils/formatPercentage";
import { CHAIN_ID_TO_NETWORK, compoundRateToAPR } from "~~/utils/protocolRates";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

type UseCompoundMarketDataParams = {
  chainId?: number;
};

export const useCompoundMarketData = ({ chainId }: UseCompoundMarketDataParams = {}): MarketData[] => {
  const selectedNetwork = useSelectedNetwork(chainId as any);
  const resolvedChainId = chainId ?? selectedNetwork.id;
  const network = CHAIN_ID_TO_NETWORK[resolvedChainId] ?? "arbitrum";

  // Fetch external yields (LST staking yields, PT fixed yields, etc.)
  const { getEffectiveSupplyRate } = useExternalYields(resolvedChainId);

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

      const protocolSupplyApr = supplyRate ? compoundRateToAPR(BigInt(supplyRate)) : 0;
      const borrowApr = borrowRate ? compoundRateToAPR(BigInt(borrowRate)) : 0;
      // Get effective supply rate (includes LST staking yields, PT fixed yields, etc.)
      const effectiveSupplyApr = getEffectiveSupplyRate(token.address, token.symbol, protocolSupplyApr);
      const utilization = borrowApr > 0 ? (protocolSupplyApr / borrowApr) * 100 : 0;
      const priceValue = price ? (typeof price === "bigint" ? price : BigInt(price)) : 0n;
      const priceFormatted = price ? Number(formatUnits(priceValue, 8)).toFixed(2) : "0.00";

      return [
        {
          icon: tokenNameToLogo(token.symbol),
          name: token.symbol,
          supplyRate: `${formatPercentage(effectiveSupplyApr)}%`,
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
  }, [preparedTokens, results, network, getEffectiveSupplyRate]);
};

