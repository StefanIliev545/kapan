import { FC, useMemo } from "react";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString, formatPrice } from "~~/utils/protocols";

interface NostraMarketsProps {
  viewMode: "list" | "grid";
  search: string;
}

export const NostraMarkets: FC<NostraMarketsProps> = ({ viewMode, search }) => {
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
      const utilization = borrowAPR > 0 ? (supplyAPY / borrowAPR) * 100 : 0;
      const price = priceArr[idx] ? formatPrice(priceArr[idx]) : "0.00";
      return {
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        supplyRate: `${supplyAPY.toFixed(2)}%`,
        borrowRate: `${borrowAPR.toFixed(2)}%`,
        price,
        utilization: utilization.toFixed(2),
        address,
        networkType: "starknet",
        protocol: "nostra",
      } as MarketData;
    });
  }, [assetInfos, interestRates, prices]);

  return <MarketsSection title="Nostra Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default NostraMarkets;
