import { FC, useMemo } from "react";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString } from "~~/utils/protocols";

export const NostraMarkets: FC = () => {
  const { data: assetInfos } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  const tokenAddresses = useMemo(
    () =>
      assetInfos ? (assetInfos as unknown as any[]).map(info => `0x${info[0].toString(16).padStart(64, "0")}`) : [],
    [assetInfos],
  );

  const { data: interestRates } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [tokenAddresses],
    refetchInterval: 0,
  });

  const { data: prices } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [tokenAddresses],
  });

  const markets: MarketData[] = useMemo(() => {
    if (!assetInfos || !interestRates) return [];
    const infos = assetInfos as unknown as any[];
    const rates = interestRates as unknown as any[];
    const priceArr = (prices as unknown as bigint[]) || [];
    return infos.map((info, idx) => {
      const address = `0x${info[0].toString(16).padStart(64, "0")}`;
      const symbol = feltToString(info[1]);
      const rate = rates[idx];
      const supplyAPY = Number(rate.lending_rate) / 1e16;
      const borrowAPR = Number(rate.borrowing_rate) / 1e16;
      const tokenPrice = priceArr[idx] ? Number(priceArr[idx] / 10n ** 10n) : 0;
      return {
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        supplyRate: `${supplyAPY.toFixed(2)}%`,
        borrowRate: `${borrowAPR.toFixed(2)}%`,
        price: tokenPrice.toFixed(2),
        utilization: "0",
        address,
        networkType: "starknet",
        protocol: "nostra",
      } as MarketData;
    });
  }, [assetInfos, interestRates, prices]);

  return <MarketsSection title="Nostra Markets" markets={markets} />;
};

export default NostraMarkets;
