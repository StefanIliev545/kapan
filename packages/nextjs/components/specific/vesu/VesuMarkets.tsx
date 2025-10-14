import { FC, useMemo } from "react";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import {
  feltToString,
  formatPrice,
  formatRate,
  formatUtilization,
  toAnnualRates,
  type TokenMetadata,
} from "~~/utils/protocols";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";

import { VESU_V1_POOLS } from "./pools";

export const POOL_IDS = VESU_V1_POOLS;

export type ContractResponse = TokenMetadata[];

interface VesuMarketsProps {
  supportedAssets?: ContractResponse;
  viewMode: "list" | "grid";
  search: string;
  allowDeposit?: boolean;
  poolId?: bigint;
}

export const VesuMarkets: FC<VesuMarketsProps> = ({ supportedAssets, viewMode, search, allowDeposit = false }) => {

  const markets: MarketData[] = useMemo(() => {
    if (!supportedAssets) return [];
    return (supportedAssets as ContractResponse).map(asset => {
      const address = `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;
      const raw = typeof (asset as any).symbol === "bigint" ? feltToString((asset as any).symbol) : String((asset as any).symbol ?? "");
      console.log("raw:", raw, "fallback:", getTokenNameFallback(address));
      const symbol = raw && raw.trim().length > 0 ? raw : getTokenNameFallback(address) ?? raw;
      const { borrowAPR, supplyAPY } = toAnnualRates(
        asset.fee_rate,
        asset.total_nominal_debt,
        asset.last_rate_accumulator,
        asset.reserve,
        asset.scale,
      );
      return {
        icon: tokenNameToLogo(symbol.toLowerCase()),
        name: symbol,
        supplyRate: formatRate(supplyAPY),
        borrowRate: formatRate(borrowAPR),
        price: formatPrice(asset.price.value),
        utilization: formatUtilization(asset.utilization),
        address,
        networkType: "starknet",
        protocol: "vesu",
        allowDeposit,
      } as MarketData;
    });
  }, [supportedAssets, allowDeposit]);

  return <MarketsSection title="Vesu Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default VesuMarkets;
