import { FC, useMemo } from "react";
import { formatUnits } from "viem";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

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

export const VenusMarkets: FC = () => {
  const { data: marketDetails } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getAllVenusMarkets",
  });

  const vTokens = marketDetails?.[0];

  const { data: ratesData } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getMarketRates",
    args: [vTokens],
  });

  const markets: MarketData[] = useMemo(() => {
    if (!marketDetails || !ratesData) return [];
    const [, tokens, symbols, , decimals] = marketDetails as unknown as any[];
    const [prices, supplyRates, borrowRates] = ratesData as unknown as any[];
    return tokens
      .map((token: string, i: number) => {
        if (token === "0x0000000000000000000000000000000000000000") return null;
        const { displayName, logo } = getTokenDisplay(token, symbols[i]);
        const supplyAPY = convertRateToAPY(supplyRates[i]);
        const borrowAPY = convertRateToAPY(borrowRates[i]);
        const price = Number(formatUnits(prices[i], 18 + (18 - decimals[i])));
        const utilization = borrowAPY > 0 ? (supplyAPY / borrowAPY) * 100 : 0;
        return {
          icon: logo,
          name: displayName,
          supplyRate: `${supplyAPY.toFixed(2)}%`,
          borrowRate: `${borrowAPY.toFixed(2)}%`,
          price: price.toFixed(2),
          utilization: utilization.toFixed(2),
          address: token,
          networkType: "evm",
          protocol: "venus",
        } as MarketData;
      })
      .filter(Boolean) as MarketData[];
  }, [marketDetails, ratesData]);

  return <MarketsSection title="Venus Markets" markets={markets} />;
};

export default VenusMarkets;
