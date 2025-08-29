import { FC, useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";

// Helper: Convert Aave RAY (1e27) rates to APY percentage
const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

export const AaveMarkets: FC = () => {
  const { address: connectedAddress } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGateway" });
  const queryAddress = connectedAddress || contractInfo?.address;

  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGateway",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
  });

  const markets: MarketData[] = useMemo(() => {
    if (!allTokensInfo) return [];
    return (allTokensInfo as any[]).map(token => {
      const supplyAPY = convertRateToAPY(token.supplyRate);
      const borrowAPY = convertRateToAPY(token.borrowRate);
      const price = Number(formatUnits(token.price, 8));
      return {
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        supplyRate: `${supplyAPY.toFixed(2)}%`,
        borrowRate: `${borrowAPY.toFixed(2)}%`,
        price: price.toFixed(2),
        utilization: "0",
        address: token.token,
        networkType: "evm",
        protocol: "aave",
      } as MarketData;
    });
  }, [allTokensInfo]);

  return <MarketsSection title="Aave Markets" markets={markets} />;
};

export default AaveMarkets;
