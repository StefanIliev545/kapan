import { FC, useMemo } from "react";
import { Address, formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { Abi } from "abitype";
import { MarketData, MarketsSection } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import formatPercentage from "~~/utils/formatPercentage";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ERC20_METADATA_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

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
  const { data: gatewayContract } = useScaffoldContract({ contractName: "CompoundGatewayView", chainId: chainId as any });
  const gatewayAddress = gatewayContract?.address as Address | undefined;

  const { data: activeBaseTokens } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "allActiveBaseTokens",
    chainId,
    query: {
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const baseTokens = useMemo(
    () => (Array.isArray(activeBaseTokens) ? (activeBaseTokens.filter(Boolean) as Address[]) : []),
    [activeBaseTokens],
  );

  const symbolCalls = useMemo(
    () =>
      baseTokens.map(token => ({
        address: token,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol" as const,
      })),
    [baseTokens],
  );
  const { data: symbolResults } = useReadContracts({
    allowFailure: true,
    contracts: symbolCalls,
    query: {
      enabled: symbolCalls.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });
  const symbols = useMemo(() => (symbolResults || []).map(res => ((res?.result as string) || "").trim()), [symbolResults]);

  const decimalCalls = useMemo(
    () =>
      baseTokens.map(token => ({
        address: token,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals" as const,
      })),
    [baseTokens],
  );
  const { data: decimalResults } = useReadContracts({
    allowFailure: true,
    contracts: decimalCalls,
    query: {
      enabled: decimalCalls.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });
  const decimalsList = useMemo(
    () => (decimalResults || []).map(res => Number((res?.result as bigint | number | undefined) ?? 18)),
    [decimalResults],
  );

  const compoundCalls = useMemo(() => {
    if (!gatewayAddress || !gatewayContract?.abi || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(token => ({
      address: gatewayAddress,
      abi: gatewayContract.abi as Abi,
      functionName: "getCompoundData" as const,
      args: [token, ZERO_ADDRESS],
    }));
  }, [gatewayAddress, gatewayContract, baseTokens]);

  const { data: compoundResults } = useReadContracts({
    allowFailure: true,
    contracts: compoundCalls,
    query: {
      enabled: compoundCalls.length > 0,
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

  const decimalsFromScale = (scale: bigint) => {
    if (scale <= 1n) return 0;
    let s = scale;
    let d = 0;
    while (s % 10n === 0n) {
      s /= 10n;
      d++;
    }
    return d;
  };

  const markets: MarketData[] = useMemo(() => {
    if (!compoundResults || compoundResults.length === 0) return [];
    return baseTokens
      .map((token, idx) => {
        const compound = compoundResults[idx]?.result as
          | [bigint, bigint, bigint, bigint, bigint, bigint]
          | undefined;
        if (!compound) return null;

        const [supplyRate, borrowRate, totalSupplyRaw, totalBorrowRaw, priceRaw, priceScale] = compound;
        const decimals = decimalsList[idx] ?? 18;
        const symbol = symbols[idx] || token.slice(0, 6);
        const priceDecimals = decimalsFromScale(priceScale ?? 1n);
        const price = Number(formatUnits(priceRaw ?? 0n, priceDecimals || 0));
        const supplyAPR = convertRateToAPR(supplyRate ?? 0n);
        const borrowAPR = convertRateToAPR(borrowRate ?? 0n);
        const totalSupply = totalSupplyRaw ?? 0n;
        const totalBorrow = totalBorrowRaw ?? 0n;
        const totalSupplyFormatted = formatAmount(totalSupply, decimals);
        const totalBorrowFormatted = formatAmount(totalBorrow, decimals);
        const availableLiquidityValue = totalSupply > totalBorrow ? totalSupply - totalBorrow : 0n;
        const availableLiquidity = formatAmount(availableLiquidityValue, decimals);

        const utilization = totalSupply > 0n ? Number(totalBorrow * 10000n / totalSupply) / 100 : 0;

        return {
          icon: tokenNameToLogo(symbol) || "/logos/token.svg",
          name: symbol || "Token",
          supplyRate: `${formatPercentage(supplyAPR)}%`,
          borrowRate: `${formatPercentage(borrowAPR)}%`,
          price: price.toFixed(2),
          utilization: utilization.toFixed(2),
          address: token,
          networkType: "evm",
          protocol: "compound",
          totalSupply: totalSupplyFormatted,
          totalBorrow: totalBorrowFormatted,
          availableLiquidity,
        } as MarketData;
      })
      .filter(Boolean) as MarketData[];
  }, [compoundResults, baseTokens, decimalsList, symbols]);

  return <MarketsSection title="Compound Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default CompoundMarkets;
