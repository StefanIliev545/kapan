import { FC, useMemo } from "react";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import {
  feltToString,
  formatPrice,
  formatRate,
  formatUtilization,
  toAnnualRates,
} from "~~/utils/protocols";

export const POOL_IDS = {
  Genesis: 2198503327643286920898110335698706244522220458610657370981979460625005526824n,
} as const;

export type ContractResponse = {
  readonly address: bigint;
  readonly symbol: bigint;
  readonly decimals: number;
  readonly rate_accumulator: bigint;
  readonly utilization: bigint;
  readonly fee_rate: bigint;
  readonly price: { value: bigint; is_valid: boolean };
  readonly total_nominal_debt: bigint;
  readonly last_rate_accumulator: bigint;
  readonly reserve: bigint;
  readonly scale: bigint;
}[];

interface VesuMarketsProps {
  supportedAssets?: ContractResponse;
  viewMode: "list" | "grid";
  search: string;
  allowDeposit?: boolean;
}

export const VesuMarkets: FC<VesuMarketsProps> = ({ supportedAssets, viewMode, search, allowDeposit = false }) => {

  const markets: MarketData[] = useMemo(() => {
    if (!supportedAssets) return [];
    return (supportedAssets as ContractResponse).map(asset => {
      const address = `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;
      const symbol = feltToString(asset.symbol);
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
