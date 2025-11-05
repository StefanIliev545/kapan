import { FC, useMemo } from "react";
import { formatUnits } from "viem";
import { MarketData, MarketsSection } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import formatPercentage from "~~/utils/formatPercentage";

// Helper to convert Compound's per-second rate to APR percentage
const convertRateToAPR = (ratePerSecond: bigint): number => {
  const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
  const SCALE = 1e18;
  return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / SCALE;
};

interface CompoundMarketsProps {
  viewMode: "list" | "grid";
  search: string;
  chainId?: number;
}

export const CompoundMarkets: FC<CompoundMarketsProps> = ({ viewMode, search, chainId }) => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const { data: weth } = useDeployedContractInfo({ contractName: "eth", chainId: chainId as any });
  const { data: usdc } = useDeployedContractInfo({ contractName: "USDC", chainId: chainId as any });
  const { data: usdt } = useDeployedContractInfo({ contractName: "USDT", chainId: chainId as any });
  const { data: usdcE } = useDeployedContractInfo({ contractName: "USDCe", chainId: chainId as any });

  const { data: wethData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [weth?.address, ZERO_ADDRESS],
    chainId,
  });
  const { data: usdcData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [usdc?.address, ZERO_ADDRESS],
    chainId,
  });
  const { data: usdtData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [usdt?.address, ZERO_ADDRESS],
    chainId,
  });
  const { data: usdcEData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [usdcE?.address, ZERO_ADDRESS],
    chainId,
  });

  const markets: MarketData[] = useMemo(() => {
    const tokens = [
      { symbol: "WETH", address: weth?.address, data: wethData },
      { symbol: "USDC", address: usdc?.address, data: usdcData },
      { symbol: "USDT", address: usdt?.address, data: usdtData },
      { symbol: "USDC.e", address: usdcE?.address, data: usdcEData },
    ];

    return tokens
      .filter(t => t.address && t.data)
      .map(t => {
        const [supplyRate, borrowRate, , , price] = t.data as any;
        const supplyAPR = supplyRate ? convertRateToAPR(BigInt(supplyRate)) : 0;
        const borrowAPR = borrowRate ? convertRateToAPR(BigInt(borrowRate)) : 0;
        const priceFormatted = price ? Number(formatUnits(price, 8)).toFixed(2) : "0.00";
        const utilization = borrowAPR > 0 ? (supplyAPR / borrowAPR) * 100 : 0;
        return {
          icon: tokenNameToLogo(t.symbol),
          name: t.symbol,
          supplyRate: `${formatPercentage(supplyAPR)}%`,
          borrowRate: `${formatPercentage(borrowAPR)}%`,
          price: priceFormatted,
          utilization: utilization.toFixed(2),
          address: t.address as string,
          networkType: "evm",
          protocol: "compound",
        } as MarketData;
      });
  }, [weth?.address, usdc?.address, usdt?.address, usdcE?.address, wethData, usdcData, usdtData, usdcEData]);

  return <MarketsSection title="Compound Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default CompoundMarkets;
