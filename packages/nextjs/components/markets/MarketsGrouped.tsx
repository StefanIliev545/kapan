"use client";

import { FC, useMemo, useState } from "react";
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
import { RatePill } from "./RatePill";

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
    () =>
      assetInfos
        ? Array.from(assetInfos as unknown as any[], info => `0x${info[0].toString(16).padStart(64, "0")}`)
        : [],
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
    const infos = Array.from(assetInfos as unknown as any[]);
    const rates = Array.from(interestRates as unknown as any[]);
    const priceArr = Array.from((prices as unknown as bigint[]) ?? []);
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
    const [, tokens, symbols, , decimals] = marketDetails as unknown as any[];
    const [prices, supplyRates, borrowRates] = ratesData as unknown as any[];
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
    return (supportedAssets as unknown as ContractResponse).map(asset => {
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

export const MarketsGrouped: FC<{ search: string }> = ({ search }) => {
  const aave = useAaveData();
  const nostra = useNostraData();
  const venus = useVenusData();
  const vesu = useVesuData();
  const [sortBy, setSortBy] = useState<"supply" | "borrow">("supply");

  const all = useMemo(() => [...aave, ...nostra, ...venus, ...vesu], [aave, nostra, venus, vesu]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        icon: string;
        markets: MarketData[];
        bestSupply: MarketData;
        bestBorrow: MarketData;
      }
    >();
    all.forEach(m => {
      const entry = map.get(m.name);
      if (entry) {
        entry.markets.push(m);
        if (parseFloat(m.supplyRate) > parseFloat(entry.bestSupply.supplyRate)) entry.bestSupply = m;
        if (parseFloat(m.borrowRate) < parseFloat(entry.bestBorrow.borrowRate)) entry.bestBorrow = m;
      } else {
        map.set(m.name, {
          icon: m.icon,
          markets: [m],
          bestSupply: m,
          bestBorrow: m,
        });
      }
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, ...value }));
  }, [all]);

  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      const aMetric =
        sortBy === "supply"
          ? parseFloat(a.bestSupply.supplyRate)
          : parseFloat(a.bestBorrow.borrowRate);
      const bMetric =
        sortBy === "supply"
          ? parseFloat(b.bestSupply.supplyRate)
          : parseFloat(b.bestBorrow.borrowRate);
      return sortBy === "supply" ? bMetric - aMetric : aMetric - bMetric;
    });
  }, [groups, sortBy]);

  const filtered = useMemo(
    () => sorted.filter(g => g.name.toLowerCase().includes(search.toLowerCase())),
    [sorted, search],
  );

  const networkIcons: Record<"evm" | "starknet", string> = {
    evm: "/logos/arb.svg",
    starknet: "/logos/starknet.svg",
  };

  const protocolIcons: Record<"aave" | "nostra" | "venus" | "vesu", string> = {
    aave: "/logos/aave.svg",
    nostra: "/logos/nostra.svg",
    venus: "/logos/venus.svg",
    vesu: "/logos/vesu.svg",
  };

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
      {filtered.map(group => (
        <details key={group.name} className="mb-2 collapse collapse-arrow bg-base-200">
          <summary className="collapse-title flex flex-row items-center gap-2 cursor-pointer">
            <Image src={group.icon} alt={group.name} width={24} height={24} className="rounded-full" />
            <span className="font-medium">{group.name}</span>
            <div className="ml-auto flex gap-2">
              <RatePill
                label="supply"
                rate={group.bestSupply.supplyRate}
                networkType={group.bestSupply.networkType}
                protocol={group.bestSupply.protocol}
              />
              <RatePill
                label="borrow"
                rate={group.bestBorrow.borrowRate}
                networkType={group.bestBorrow.networkType}
                protocol={group.bestBorrow.protocol}
              />
            </div>
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
                      <td className="capitalize">
                        <div className="flex items-center gap-2">
                          <Image
                            src={protocolIcons[m.protocol]}
                            alt={m.protocol}
                            width={16}
                            height={16}
                          />
                          {m.protocol}
                        </div>
                      </td>
                      <td>
                        <Image
                          src={networkIcons[m.networkType]}
                          alt={m.networkType}
                          width={16}
                          height={16}
                        />
                      </td>
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
