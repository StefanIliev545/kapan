import { FC, useMemo } from "react";
import { Address, formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import formatPercentage from "~~/utils/formatPercentage";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const V_TOKEN_ABI = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalBorrows", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getCash", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "exchangeRateStored", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// Convert Venus per-block rates to APY percentage
const convertRateToAPY = (ratePerBlock: bigint): number => {
  const ethMantissa = 1e18;
  const blocksPerDay = 60 * 60 * 24;
  const daysPerYear = 365;
  const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
  return (Math.pow(ratePerBlockNum * blocksPerDay + 1, daysPerYear - 1) - 1) * 100;
};

// Overrides for gm assets
const tokenOverrides: Record<string, { name: string; logo: string }> = {
  "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": { name: "gmWETH/USDC", logo: "/logos/gmweth.svg" },
  "0x47c031236e19d024b42f8AE6780E44A573170703": { name: "gmWBTC/USDC", logo: "/logos/gmbtc.svg" },
};

const getTokenDisplay = (tokenAddress: string, originalSymbol: string) => {
  const override = tokenOverrides[tokenAddress];
  return override ? { displayName: override.name, logo: override.logo } : { displayName: originalSymbol, logo: tokenNameToLogo(originalSymbol) };
};

interface VenusMarketsProps {
  viewMode: "list" | "grid";
  search: string;
  chainId?: number;
}

export const VenusMarkets: FC<VenusMarketsProps> = ({ viewMode, search, chainId }) => {
  const { data: marketDetails } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "VenusGatewayView",
    functionName: "getAllVenusMarkets",
    chainId,
    query: {
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const vTokens = useMemo(() => {
    if (!marketDetails || !Array.isArray(marketDetails)) return [] as Address[];
    const addresses = marketDetails[0] as Address[] | undefined;
    return Array.isArray(addresses) ? (addresses.filter(Boolean) as Address[]) : [];
  }, [marketDetails]);

  const { data: ratesData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "VenusGatewayView",
    functionName: "getMarketRates",
    args: [vTokens],
    chainId,
    query: {
      enabled: vTokens.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const validVToks = useMemo(
    () => vTokens.filter(addr => addr && addr !== ZERO_ADDRESS) as Address[],
    [vTokens],
  );

  const totalSupplyCalls = useMemo(
    () =>
      validVToks.map(address => ({
        address,
        abi: V_TOKEN_ABI,
        functionName: "totalSupply" as const,
      })),
    [validVToks],
  );
  const { data: totalSupplyResults } = useReadContracts({
    allowFailure: true,
    contracts: totalSupplyCalls,
    query: {
      enabled: totalSupplyCalls.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const totalBorrowCalls = useMemo(
    () =>
      validVToks.map(address => ({
        address,
        abi: V_TOKEN_ABI,
        functionName: "totalBorrows" as const,
      })),
    [validVToks],
  );
  const { data: totalBorrowResults } = useReadContracts({
    allowFailure: true,
    contracts: totalBorrowCalls,
    query: {
      enabled: totalBorrowCalls.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const cashCalls = useMemo(
    () =>
      validVToks.map(address => ({
        address,
        abi: V_TOKEN_ABI,
        functionName: "getCash" as const,
      })),
    [validVToks],
  );
  const { data: cashResults } = useReadContracts({
    allowFailure: true,
    contracts: cashCalls,
    query: {
      enabled: cashCalls.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const exchangeRateCalls = useMemo(
    () =>
      validVToks.map(address => ({
        address,
        abi: V_TOKEN_ABI,
        functionName: "exchangeRateStored" as const,
      })),
    [validVToks],
  );
  const { data: exchangeRateResults } = useReadContracts({
    allowFailure: true,
    contracts: exchangeRateCalls,
    query: {
      enabled: exchangeRateCalls.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    },
  });

  const buildResultMap = (tokens: Address[], results?: { result?: unknown }[]) => {
    const map = new Map<string, bigint>();
    if (!results) return map;
    tokens.forEach((addr, index) => {
      const value = results[index]?.result as bigint | undefined;
      if (typeof value === "bigint") {
        map.set(addr.toLowerCase(), value);
      }
    });
    return map;
  };

  const totalSupplyMap = useMemo(() => buildResultMap(validVToks, totalSupplyResults), [validVToks, totalSupplyResults]);
  const totalBorrowMap = useMemo(() => buildResultMap(validVToks, totalBorrowResults), [validVToks, totalBorrowResults]);
  const cashMap = useMemo(() => buildResultMap(validVToks, cashResults), [validVToks, cashResults]);
  const exchangeRateMap = useMemo(
    () => buildResultMap(validVToks, exchangeRateResults),
    [validVToks, exchangeRateResults],
  );

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
    if (!marketDetails || !ratesData) return [];
    const [, tokens, symbols, , decimals, detailPrices] = marketDetails as unknown as any[];
    const [ratePrices, supplyRates, borrowRates] = ratesData as unknown as any[];
    return tokens
      .map((token: string, i: number) => {
        if (token === ZERO_ADDRESS) return null;
        const vTokenAddress = (vTokens[i] as string | undefined) || "";
        if (!vTokenAddress) return null;
        const { displayName, logo } = getTokenDisplay(token, symbols[i]);
        const supplyAPY = convertRateToAPY(supplyRates?.[i] ?? 0n);
        const borrowAPY = convertRateToAPY(borrowRates?.[i] ?? 0n);
        const decimalsValue = Number(decimals?.[i] ?? 18);
        const priceSource = ratePrices?.[i] ?? detailPrices?.[i] ?? 0n;
        const price = Number(formatUnits(priceSource, 18 + (18 - decimalsValue)));

        const vTokenKey = vTokenAddress.toLowerCase();
        const totalSupplyRaw = totalSupplyMap.get(vTokenKey) ?? 0n;
        const totalBorrowRaw = totalBorrowMap.get(vTokenKey) ?? 0n;
        const cashRaw = cashMap.get(vTokenKey) ?? 0n;
        const exchangeRateRaw = exchangeRateMap.get(vTokenKey) ?? 0n;

        const totalSupplyUnderlying =
          totalSupplyRaw > 0n && exchangeRateRaw > 0n ? (totalSupplyRaw * exchangeRateRaw) / 10n ** 18n : 0n;

        const totalSupplyFormatted = formatAmount(totalSupplyUnderlying, decimalsValue);
        const totalBorrowFormatted = formatAmount(totalBorrowRaw, decimalsValue);
        const availableLiquidityFormatted = formatAmount(cashRaw, decimalsValue);

        const utilization =
          totalSupplyUnderlying > 0n
            ? Number((totalBorrowRaw * 10_000n) / totalSupplyUnderlying) / 100
            : borrowAPY > 0
              ? (supplyAPY / borrowAPY) * 100
              : 0;

        return {
          icon: logo,
          name: displayName,
          supplyRate: `${formatPercentage(supplyAPY)}%`,
          borrowRate: `${formatPercentage(borrowAPY)}%`,
          price: price.toFixed(2),
          utilization: utilization.toFixed(2),
          address: token,
          networkType: "evm",
          protocol: "venus",
          totalSupply: totalSupplyFormatted,
          totalBorrow: totalBorrowFormatted,
          availableLiquidity: availableLiquidityFormatted,
        } as MarketData;
      })
      .filter(Boolean) as MarketData[];
  }, [marketDetails, ratesData, vTokens, totalSupplyMap, totalBorrowMap, cashMap, exchangeRateMap]);

  return <MarketsSection title="Venus Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default VenusMarkets;
