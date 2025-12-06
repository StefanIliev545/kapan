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

const CHAIN_ID_TO_NETWORK: Record<number, MarketData["network"]> = {
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  59144: "linea",
};

interface AaveMarketsProps {
  viewMode: "list" | "grid";
  search: string;
  chainId?: number;
}

export const AaveMarkets: FC<AaveMarketsProps> = ({ viewMode, search, chainId }) => {
  const { address: connectedAddress } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGatewayView", chainId: chainId as any });
  const queryAddress = connectedAddress || contractInfo?.address;

  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGatewayView",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    chainId,
  });

  const markets: MarketData[] = useMemo(() => {
    if (!allTokensInfo) return [];
    const network = (chainId && CHAIN_ID_TO_NETWORK[chainId]) || "arbitrum";
    return (allTokensInfo as any[]).map(token => {
      const supplyAPY = convertRateToAPY(token.supplyRate);
      const borrowAPY = convertRateToAPY(token.borrowRate);
      const price = Number(formatUnits(token.price, 8));
      const utilization = borrowAPY > 0 ? (supplyAPY / borrowAPY) * 100 : 0;
      return {
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        supplyRate: `${formatPercentage(supplyAPY)}%`,
        borrowRate: `${formatPercentage(borrowAPY)}%`,
        price: price.toFixed(2),
        utilization: utilization.toFixed(2),
        address: token.token,
        networkType: "evm",
        network,
        protocol: "aave",
      } as MarketData;
    });
  }, [allTokensInfo, chainId]);

  return <MarketsSection title="Aave Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default AaveMarkets;
