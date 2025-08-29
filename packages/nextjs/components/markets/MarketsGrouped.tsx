"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useScaffoldReadContract as useEvmReadContract } from "~~/hooks/scaffold-eth";
import {
  feltToString,
  formatPrice,
  formatRate,
  formatUtilization,
  toAnnualRates,
} from "~~/utils/protocols";
import { POOL_IDS, ContractResponse } from "../specific/vesu/VesuMarkets";
import { MarketData } from "./MarketsSection";

// Helper: Aave rate conversion
const convertAaveRate = (rate: bigint): number => Number(rate) / 1e25;

// Helper: Venus rate conversion
const convertVenusRate = (ratePerBlock: bigint): number => {
  const ethMantissa = 1e18;
  const blocksPerDay = 60 * 60 * 24;
  const daysPerYear = 365;
  const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
  return (Math.pow(ratePerBlockNum * blocksPerDay + 1, daysPerYear - 1) - 1) * 100;
};

const useAaveData = (): MarketData[] => {
  const { address: connectedAddress } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGateway" });
  const queryAddress = connectedAddress || contractInfo?.address;
  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGateway",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
  });
  return useMemo(() => {
    if (!allTokensInfo) return [];
    return (allTokensInfo as any[]).map(token => {
      const supplyAPY = convertAaveRate(token.supplyRate);
      const borrowAPY = convertAaveRate(token.borrowRate);
      const price = Number(formatUnits(token.price, 8));
      const utilization = borrowAPY > 0 ? (supplyAPY / borrowAPY) * 100 : 0;
      return {
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        supplyRate: `${supplyAPY.toFixed(2)}%`,
        borrowRate: `${borrowAPY.toFixed(2)}%`,
        price: price.toFixed(2),
        utilization: utilization.toFixed(2),
        address: token.token,
        networkType: "evm",
        protocol: "aave",
      } as MarketData;
    });
  }, [allTokensInfo]);
};

const useNostraData = (): MarketData[] => {
  const { data: assetInfos } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  const tokenAddresses = useMemo(
    () => (assetInfos ? (assetInfos as any[]).map(info => `0x${info[0].toString(16).padStart(64, "0")}`) : []),
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

  return useMemo(() => {
    if (!assetInfos || !interestRates) return [];
    const infos = assetInfos as any[];
    const rates = interestRates as any[];
    const priceArr = (prices as bigint[]) || [];
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
};

const useVenusData = (): MarketData[] => {
  const { data: marketDetails } = useEvmReadContract({
    contractName: "VenusGateway",
    functionName: "getAllVenusMarkets",
  });
  const vTokens = marketDetails?.[0];
  const { data: ratesData } = useEvmReadContract({
    contractName: "VenusGateway",
    functionName: "getMarketRates",
    args: [vTokens],
  });
  return useMemo(() => {
    if (!marketDetails || !ratesData) return [];
    const [, tokens, symbols, , decimals] = marketDetails as any[];
    const [prices, supplyRates, borrowRates] = ratesData as any[];
    return tokens
      .map((token: string, i: number) => {
        if (token === "0x0000000000000000000000000000000000000000") return null;
        const supplyAPY = convertVenusRate(supplyRates[i]);
        const borrowAPY = convertVenusRate(borrowRates[i]);
        const price = Number(formatUnits(prices[i], 18 + (18 - decimals[i])));
        const utilization = borrowAPY > 0 ? (supplyAPY / borrowAPY) * 100 : 0;
        return {
          icon: tokenNameToLogo(symbols[i]),
          name: symbols[i],
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
};

const useVesuData = (): MarketData[] => {
  const poolId = POOL_IDS["Genesis"];
  const { data: supportedAssets } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });
  return useMemo(() => {
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
};

export const MarketsGrouped = () => {
  const aave = useAaveData();
  const nostra = useNostraData();
  const venus = useVenusData();
  const vesu = useVesuData();
  const [sortBy, setSortBy] = useState<"supply" | "borrow">("supply");

  const groups = useMemo(() => {
    const all = [...aave, ...nostra, ...venus, ...vesu];
    const map = new Map<string, { icon: string; markets: MarketData[] }>();
    all.forEach(m => {
      const entry = map.get(m.name);
      if (entry) {
        entry.markets.push(m);
      } else {
        map.set(m.name, { icon: m.icon, markets: [m] });
      }
    });
    return Array.from(map.entries()).map(([name, { icon, markets }]) => ({ name, icon, markets }));
  }, [aave, nostra, venus, vesu]);

  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      const aMetric =
        sortBy === "supply"
          ? Math.max(...a.markets.map(m => parseFloat(m.supplyRate)))
          : Math.min(...a.markets.map(m => parseFloat(m.borrowRate)));
      const bMetric =
        sortBy === "supply"
          ? Math.max(...b.markets.map(m => parseFloat(m.supplyRate)))
          : Math.min(...b.markets.map(m => parseFloat(m.borrowRate)));
      return sortBy === "supply" ? bMetric - aMetric : aMetric - bMetric;
    });
  }, [groups, sortBy]);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="join">
          <button
            className={`btn btn-xs join-item ${sortBy === "supply" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSortBy("supply")}
          >
            Supply
          </button>
          <button
            className={`btn btn-xs join-item ${sortBy === "borrow" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSortBy("borrow")}
          >
            Borrow
          </button>
        </div>
      </div>
      {sorted.map(group => (
        <details key={group.name} className="mb-2 collapse collapse-arrow bg-base-200">
          <summary className="collapse-title flex items-center gap-2 cursor-pointer">
            <Image src={group.icon} alt={group.name} width={24} height={24} className="rounded-full" />
            {group.name}
          </summary>
          <div className="collapse-content">
            <div className="overflow-x-auto">
              <table className="table table-compact w-full">
                <thead>
                  <tr>
                    <th>Protocol</th>
                    <th>Network</th>
                    <th>Supply</th>
                    <th>Borrow</th>
                  </tr>
                </thead>
                <tbody>
                  {group.markets.map(m => (
                    <tr key={m.protocol + m.address}>
                      <td className="capitalize">{m.protocol}</td>
                      <td className="capitalize">{m.networkType}</td>
                      <td>{m.supplyRate}</td>
                      <td>{m.borrowRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
};

export default MarketsGrouped;
