"use client";

import { FC, useMemo, useState } from "react";
import Image from "next/image";
import VesuLogo from "../assets/VesuLogo";
import { ContractResponse, POOL_IDS } from "../specific/vesu/VesuMarkets";
import { MarketData } from "./MarketsSection";
import { RatePill } from "./RatePill";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract as useEvmReadContract } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { feltToString, formatPrice, formatRate, formatUtilization, toAnnualRates } from "~~/utils/protocols";

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

// Helper: Compound rate conversion
const convertCompoundRate = (ratePerSecond: bigint): number => {
  const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
  const SCALE = 1e18;
  return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / SCALE;
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

const useCompoundData = (): MarketData[] => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const { data: weth } = useDeployedContractInfo({ contractName: "eth" });
  const { data: usdc } = useDeployedContractInfo({ contractName: "USDC" });
  const { data: usdt } = useDeployedContractInfo({ contractName: "USDT" });
  const { data: usdcE } = useDeployedContractInfo({ contractName: "USDCe" });

  const { data: wethData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [weth?.address, ZERO_ADDRESS],
  });
  const { data: usdcData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdc?.address, ZERO_ADDRESS],
  });
  const { data: usdtData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdt?.address, ZERO_ADDRESS],
  });
  const { data: usdcEData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcE?.address, ZERO_ADDRESS],
  });

  return useMemo(() => {
    const tokens = [
      { symbol: "WETH", address: weth?.address, data: wethData },
      { symbol: "USDC", address: usdc?.address, data: usdcData },
      { symbol: "USDT", address: usdt?.address, data: usdtData },
      { symbol: "USDC.e", address: usdcE?.address, data: usdcEData },
    ];
    return tokens
      .filter(t => t.address && t.data)
      .map(t => {
        const [supplyRate, borrowRate, , , price] = t.data as any;
        const supplyAPR = supplyRate ? convertCompoundRate(BigInt(supplyRate)) : 0;
        const borrowAPR = borrowRate ? convertCompoundRate(BigInt(borrowRate)) : 0;
        const priceNum = price ? Number(formatUnits(price, 8)) : 0;
        const utilization = borrowAPR > 0 ? (supplyAPR / borrowAPR) * 100 : 0;
        return {
          icon: tokenNameToLogo(t.symbol),
          name: t.symbol,
          supplyRate: `${supplyAPR.toFixed(2)}%`,
          borrowRate: `${borrowAPR.toFixed(2)}%`,
          price: priceNum.toFixed(2),
          utilization: utilization.toFixed(2),
          address: t.address as string,
          networkType: "evm",
          protocol: "compound",
        } as MarketData;
      });
  }, [weth?.address, usdc?.address, usdt?.address, usdcE?.address, wethData, usdcData, usdtData, usdcEData]);
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
  const compound = useCompoundData();
  const nostra = useNostraData();
  const venus = useVenusData();
  const vesu = useVesuData();
  const [sortBy, setSortBy] = useState<"supply" | "borrow">("supply");

  const aliases: Record<string, string> = {
    usdt: "USDT",
    "usd₮0": "USDT",
    weth: "ETH",
    eth: "ETH",
  };

  const canonicalName = (name: string) => aliases[name.toLowerCase()] || name;

  const all = useMemo(
    () => [...aave, ...compound, ...nostra, ...venus, ...vesu],
    [aave, compound, nostra, venus, vesu],
  );

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
      const key = canonicalName(m.name);
      const entry = map.get(key);
      if (entry) {
        entry.markets.push(m);
        if (parseFloat(m.supplyRate) > parseFloat(entry.bestSupply.supplyRate)) entry.bestSupply = m;
        if (parseFloat(m.borrowRate) < parseFloat(entry.bestBorrow.borrowRate)) entry.bestBorrow = m;
      } else {
        map.set(key, {
          icon: tokenNameToLogo(key.toLowerCase()),
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
      const aMetric = sortBy === "supply" ? parseFloat(a.bestSupply.supplyRate) : parseFloat(a.bestBorrow.borrowRate);
      const bMetric = sortBy === "supply" ? parseFloat(b.bestSupply.supplyRate) : parseFloat(b.bestBorrow.borrowRate);
      return sortBy === "supply" ? bMetric - aMetric : aMetric - bMetric;
    });
  }, [groups, sortBy]);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    const canon = canonicalName(search).toLowerCase();
    return sorted.filter(g => g.name.toLowerCase().includes(lower) || g.name.toLowerCase().includes(canon));
  }, [sorted, search]);

  const networkIcons: Record<"evm" | "starknet", string> = {
    evm: "/logos/arb.svg",
    starknet: "/logos/starknet.svg",
  };

  const protocolIcons: Record<"aave" | "nostra" | "venus" | "vesu" | "compound", string> = {
    aave: "/logos/aave.svg",
    nostra: "/logos/nostra.svg",
    venus: "/logos/venus.svg",
    vesu: "/logos/vesu.svg",
    compound: "/logos/compound.svg",
  };

  const networkNames: Record<"evm" | "starknet", string> = {
    evm: "Arbitrum",
    starknet: "Starknet",
  };

  const protocolNames: Record<"aave" | "nostra" | "venus" | "vesu" | "compound", string> = {
    aave: "Aave",
    nostra: "Nostra",
    venus: "Venus",
    vesu: "Vesu",
    compound: "Compound",
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
      <div className="space-y-4">
        {filtered.map(group => (
          <details key={group.name} className="collapse collapse-arrow rounded-lg">
            <summary className="collapse-title p-0 list-none">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 cursor-pointer">
                <Image src={group.icon} alt={group.name} width={24} height={24} className="rounded-full" />
                <span className="font-medium">{group.name}</span>
                <div className="ml-auto mr-8 flex gap-4">
                  <RatePill
                    variant="supply"
                    label="Supply Rate"
                    rate={group.bestSupply.supplyRate}
                    networkType={group.bestSupply.networkType}
                    protocol={group.bestSupply.protocol}
                  />
                  <RatePill
                    variant="borrow"
                    label="Borrow Rate"
                    rate={group.bestBorrow.borrowRate}
                    networkType={group.bestBorrow.networkType}
                    protocol={group.bestBorrow.protocol}
                  />
                </div>
              </div>
            </summary>
            <div className="collapse-content p-0 mt-2 space-y-2">
              {group.markets.map(m => (
                <div
                  key={m.protocol + m.address}
                  className="grid grid-cols-4 items-center gap-4 p-3 rounded-lg bg-base-100"
                >
                  <div className="flex items-center gap-2">
                    <Image src={networkIcons[m.networkType]} alt={m.networkType} width={16} height={16} />
                    <span>{networkNames[m.networkType]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.protocol === "vesu" ? (
                      <VesuLogo width={16} height={16} />
                    ) : (
                      <Image src={protocolIcons[m.protocol]} alt={m.protocol} width={16} height={16} />
                    )}
                    <span className="capitalize">{protocolNames[m.protocol]}</span>
                  </div>
                  <div className="justify-self-center">
                    <RatePill
                      variant="supply"
                      label="Supply Rate"
                      rate={m.supplyRate}
                      networkType={m.networkType}
                      protocol={m.protocol}
                      showIcons={false}
                    />
                  </div>
                  <div className="justify-self-center">
                    <RatePill
                      variant="borrow"
                      label="Borrow Rate"
                      rate={m.borrowRate}
                      networkType={m.networkType}
                      protocol={m.protocol}
                      showIcons={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};

export default MarketsGrouped;
