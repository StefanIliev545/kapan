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
        protocol: "aave",
      } as MarketData;
    });
  }, [allTokensInfo]);

  return <MarketsSection title="Aave Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default AaveMarkets;
