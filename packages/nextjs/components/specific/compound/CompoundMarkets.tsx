import { FC, useMemo } from "react";
import { formatUnits, type Address, type Abi } from "viem";
import { useReadContracts } from "wagmi";
import { MarketData, MarketsSection } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
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
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

  const { data: weth } = useDeployedContractInfo({ contractName: "eth", chainId: chainId as any });
  const { data: usdc } = useDeployedContractInfo({ contractName: "USDC", chainId: chainId as any });
  const { data: usdt } = useDeployedContractInfo({ contractName: "USDT", chainId: chainId as any });
  const { data: usdcE } = useDeployedContractInfo({ contractName: "USDCe", chainId: chainId as any });
  const { data: compoundGateway } = useDeployedContractInfo({ contractName: "CompoundGatewayView", chainId: chainId as any });

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
    () => baseTokens.filter((token): token is { symbol: string; address: Address } => Boolean(token.address)),
    [baseTokens],
  );

  const compoundCalls = useMemo(() => {
    if (!compoundGateway?.address || !compoundGateway?.abi) return [];
    return preparedTokens.map(token => ({
      address: compoundGateway.address as Address,
      abi: compoundGateway.abi as Abi,
      functionName: "getCompoundData" as const,
      args: [token.address, ZERO_ADDRESS] as const,
      chainId,
    }));
  }, [compoundGateway?.address, compoundGateway?.abi, preparedTokens, chainId]);

  const { data: compoundResults } = useReadContracts({
    contracts: compoundCalls,
    allowFailure: true,
    query: {
      enabled: compoundCalls.length > 0,
    },
  });

  const markets: MarketData[] = useMemo(() => {
    if (!compoundResults) return [];

    return preparedTokens.flatMap((token, index) => {
      const callResult = compoundResults[index];
      if (!callResult || callResult.status !== "success" || !callResult.result) {
        return [];
      }

      const [supplyRate, borrowRate, , , price] = callResult.result as any;
      const supplyAPR = supplyRate ? convertRateToAPR(BigInt(supplyRate)) : 0;
      const borrowAPR = borrowRate ? convertRateToAPR(BigInt(borrowRate)) : 0;
      const priceFormatted = price ? Number(formatUnits(price, 8)).toFixed(2) : "0.00";
      const utilization = borrowAPR > 0 ? (supplyAPR / borrowAPR) * 100 : 0;

      return [
        {
          icon: tokenNameToLogo(token.symbol),
          name: token.symbol,
          supplyRate: `${formatPercentage(supplyAPR)}%`,
          borrowRate: `${formatPercentage(borrowAPR)}%`,
          price: priceFormatted,
          utilization: utilization.toFixed(2),
          address: token.address,
          networkType: "evm",
          protocol: "compound",
        } as MarketData,
      ];
    });
  }, [compoundResults, preparedTokens]);

  return <MarketsSection title="Compound Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default CompoundMarkets;
