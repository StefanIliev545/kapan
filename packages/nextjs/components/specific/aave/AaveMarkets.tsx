import { FC, useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import formatPercentage from "~~/utils/formatPercentage";

// Helper: Convert Aave RAY (1e27) rates to APY percentage
const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

interface AaveMarketsProps {
  viewMode: "list" | "grid";
  search: string;
  chainId?: number;
}

export const AaveMarkets: FC<AaveMarketsProps> = ({ viewMode, search, chainId }) => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const { address: connectedAddress } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGatewayView", chainId: chainId as any });
  const queryAddress = connectedAddress || contractInfo?.address || ZERO_ADDRESS;

  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGatewayView",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    chainId,
    query: {
      enabled: !!queryAddress,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const formatAmount = (value?: bigint, decimals?: number) => {
    if (!value || value === 0n) return undefined;
    try {
      const normalized = Number(formatUnits(value, decimals ?? 18));
      if (!Number.isFinite(normalized)) return undefined;
      return normalized.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return undefined;
    }
  };

  const markets: MarketData[] = useMemo(() => {
    if (!Array.isArray(allTokensInfo) || allTokensInfo.length === 0) return [];
    return (allTokensInfo as any[]).map(token => {
      const decimals = Number(token.decimals ?? 18);
      const supplyAPY = convertRateToAPY(token.supplyRate ?? 0n);
      const borrowAPY = convertRateToAPY(token.borrowRate ?? 0n);
      const price = Number(formatUnits(token.price ?? 0n, 8));
      const utilization = borrowAPY > 0 ? (supplyAPY / borrowAPY) * 100 : 0;
      const totalSupply = formatAmount(token.totalSupply, decimals);
      const totalBorrow = formatAmount(token.totalBorrow, decimals);
      const availableLiquidity = formatAmount(token.availableLiquidity, decimals);
      return {
        icon: tokenNameToLogo(token.symbol) || "/logos/token.svg",
        name: token.symbol,
        supplyRate: `${formatPercentage(supplyAPY)}%`,
        borrowRate: `${formatPercentage(borrowAPY)}%`,
        price: price.toFixed(2),
        utilization: utilization.toFixed(2),
        address: token.token,
        networkType: "evm",
        protocol: "aave",
        totalSupply,
        totalBorrow,
        availableLiquidity,
      } as MarketData;
    });
  }, [allTokensInfo]);

  return <MarketsSection title="Aave Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default AaveMarkets;
