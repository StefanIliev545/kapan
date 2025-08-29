import { FC, useMemo } from "react";
import Image from "next/image";
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
  "Re7 USDC": 3592370751539490711610556844458488648008775713878064059760995781404350938653n,
  "Alterscope wstETH": 2612229586214495842527551768232431476062656055007024497123940017576986139174n,
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
  selectedPoolId: bigint;
  onPoolChange: (id: bigint) => void;
  supportedAssets?: ContractResponse;
}

export const VesuMarkets: FC<VesuMarketsProps> = ({ selectedPoolId, onPoolChange, supportedAssets }) => {

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
      } as MarketData;
    });
  }, [supportedAssets]);

  const poolTabs = (
    <div className="tabs tabs-boxed mb-4">
      <button
        className={`tab ${selectedPoolId === POOL_IDS["Genesis"] ? "tab-active" : ""}`}
        onClick={() => onPoolChange(POOL_IDS["Genesis"])}
      >
        <Image src="/logos/vesu.svg" alt="Vesu" width={20} height={20} className="rounded-full min-w-[20px]" />
        Genesis
      </button>
      <button
        className={`tab ${selectedPoolId === POOL_IDS["Re7 USDC"] ? "tab-active" : ""}`}
        onClick={() => onPoolChange(POOL_IDS["Re7 USDC"])}
      >
        <Image src="/logos/re7.svg" alt="Re7" width={20} height={20} className="rounded-full min-w-[20px]" />
        Re7 USDC
      </button>
      <button
        className={`tab ${selectedPoolId === POOL_IDS["Alterscope wstETH"] ? "tab-active" : ""}`}
        onClick={() => onPoolChange(POOL_IDS["Alterscope wstETH"])}
      >
        <Image
          src="/logos/alterscope_symbol_black.svg"
          alt="Alterscope"
          width={20}
          height={20}
          className="rounded-full min-w-[20px] dark:hidden"
        />
        <Image
          src="/logos/alterscope_symbol_white.svg"
          alt="Alterscope"
          width={20}
          height={20}
          className="rounded-full min-w-[20px] hidden dark:block"
        />
        Alterscope wstETH
      </button>
    </div>
  );

  return <MarketsSection title="Vesu Markets" markets={markets} extra={poolTabs} />;
};

export default VesuMarkets;
