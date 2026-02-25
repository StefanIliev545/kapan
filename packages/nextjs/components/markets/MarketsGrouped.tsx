"use client";

import { FC, useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ScrollArea } from "@radix-ui/themes";
import { ContractResponse } from "../specific/vesu/VesuMarkets";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import { VESU_V1_POOLS, VESU_V2_POOLS, getV1PoolDisplay, getV2PoolDisplay } from "../specific/vesu/pools";
import { MarketData } from "./MarketsSection";
import { RatePill } from "./RatePill";
import { Abi, Address, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract as useEvmReadContract } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useCompoundMarketData } from "~~/hooks/useCompoundMarketData";
import { useVesuV2Assets } from "~~/hooks/useVesuV2Assets";
import { arbitrum, base, linea, optimism } from "wagmi/chains";
import { feltToString, formatPrice, formatRate, formatUtilization, toAnnualRates } from "~~/utils/protocols";
import formatPercentage from "~~/utils/formatPercentage";
import { useExternalYields } from "~~/hooks/useExternalYields";
import { aaveRateToAPY, venusRateToAPY, CHAIN_ID_TO_NETWORK } from "~~/utils/protocolRates";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import { isPTToken } from "~~/hooks/usePendlePTYields";

const TOKEN_ALIASES: Record<string, string> = {
  usdt: "USDT",
  "usd₮0": "USDT",
  weth: "ETH",
  eth: "ETH",
};

const canonicalizeTokenName = (name: string) => TOKEN_ALIASES[name.toLowerCase()] || name;

const AAVE_CHAIN_IDS = [arbitrum.id, base.id, optimism.id, linea.id];

const useAaveLikeData = (
  contractName: "AaveGatewayView",
  protocol: MarketData["protocol"],
  chainIds: number[],
): MarketData[] => {
  const { address: connectedAddress } = useAccount();
  // External yields (LST staking yields, etc.) — chain-independent for LSTs
  const { getEffectiveSupplyRate } = useExternalYields();

  const arbInfo = useDeployedContractInfo({ contractName: contractName as any, chainId: arbitrum.id as any });
  const baseInfo = useDeployedContractInfo({ contractName: contractName as any, chainId: base.id as any });
  const optInfo = useDeployedContractInfo({ contractName: contractName as any, chainId: optimism.id as any });
  const lineaInfo = useDeployedContractInfo({ contractName: contractName as any, chainId: linea.id as any });

  const contracts = useMemo(() => {
    const entries: { chainId: number; data: typeof arbInfo.data }[] = [
      { chainId: arbitrum.id, data: arbInfo.data },
      { chainId: base.id, data: baseInfo.data },
      { chainId: optimism.id, data: optInfo.data },
      { chainId: linea.id, data: lineaInfo.data },
    ].filter(entry => chainIds.includes(entry.chainId));

    return entries.flatMap(entry => {
      const info = entry.data;
      const queryAddress = connectedAddress || info?.address;
      if (!info?.address || !info?.abi || !queryAddress) return [];
      return [
        {
          address: info.address as Address,
          abi: info.abi as Abi,
          functionName: "getAllTokensInfo" as const,
          args: [queryAddress as Address],
          chainId: entry.chainId,
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbInfo.data, baseInfo.data, lineaInfo.data, optInfo.data, chainIds, connectedAddress]);

  const { data: results } = useReadContracts({
    contracts,
    allowFailure: true,
    query: {
      enabled: contracts.length > 0,
      staleTime: 10_000,
    },
  });

  return useMemo(() => {
    if (!results) return [];

    return results.flatMap((result, index) => {
      if (!result || result.status !== "success" || !result.result) return [];
      const chainId = contracts[index]?.chainId;
      const network = (chainId && CHAIN_ID_TO_NETWORK[chainId]) || "arbitrum";
      return (result.result as any[]).map(token => {
        const protocolSupplyAPY = aaveRateToAPY(token.supplyRate);
        const borrowAPY = aaveRateToAPY(token.borrowRate);
        // Apply external yields (LST staking yields, PT fixed yields, etc.)
        const supplyAPY = getEffectiveSupplyRate(token.token, token.symbol, protocolSupplyAPY);
        const price = Number(formatUnits(token.price, 8));
        const utilization = borrowAPY > 0 ? (protocolSupplyAPY / borrowAPY) * 100 : 0;
        return {
          icon: tokenNameToLogo(token.symbol),
          name: token.symbol,
          supplyRate: `${formatPercentage(supplyAPY, 2, false)}%`,
          borrowRate: `${formatPercentage(borrowAPY, 2, false)}%`,
          price: price.toFixed(2),
          utilization: utilization.toFixed(2),
          address: token.token,
          networkType: "evm",
          network,
          protocol,
        } as MarketData;
      });
    });
  }, [contracts, protocol, results, getEffectiveSupplyRate]);
};

const useNostraData = (): MarketData[] => {
  const { data: assetInfos } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: ["0x0"],
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
      // Rates are provided in WAD (1e18); divide by 1e16 to obtain percentage values
      const supplyAPY = Number(rate.lending_rate) / 1e16;
      const borrowAPR = Number(rate.borrowing_rate) / 1e16;
      const utilization = borrowAPR > 0 ? (supplyAPY / borrowAPR) * 100 : 0;
      const price = priceArr[idx] ? formatPrice(priceArr[idx]) : "0.00";
      const display = symbol && symbol.trim().length > 0 ? symbol : getTokenNameFallback(address) ?? symbol;
      return {
        icon: tokenNameToLogo(display.toLowerCase()),
        name: display,
        supplyRate: `${formatPercentage(supplyAPY, 2, false)}%`,
        borrowRate: `${formatPercentage(borrowAPR, 2, false)}%`,
        price,
        utilization: utilization.toFixed(2),
        address,
        networkType: "starknet",
        network: "starknet",
        protocol: "nostra",
      } as MarketData;
    });
  }, [assetInfos, interestRates, prices]);
};

const useVenusData = (): MarketData[] => {
  // External yields (LST staking yields, etc.) — chain-independent for LSTs
  const { getEffectiveSupplyRate } = useExternalYields();

  const venusArbMarkets = useEvmReadContract({
    contractName: "VenusGatewayView",
    functionName: "getAllVenusMarkets",
    chainId: arbitrum.id as any,
  });
  const venusBaseMarkets = useEvmReadContract({
    contractName: "VenusGatewayView",
    functionName: "getAllVenusMarkets",
    chainId: base.id as any,
  });

  const venusArbRates = useEvmReadContract({
    contractName: "VenusGatewayView",
    functionName: "getMarketRates",
    args: [venusArbMarkets.data?.[0]],
    chainId: arbitrum.id as any,
  });
  const venusBaseRates = useEvmReadContract({
    contractName: "VenusGatewayView",
    functionName: "getMarketRates",
    args: [venusBaseMarkets.data?.[0]],
    chainId: base.id as any,
  });

  return useMemo(() => {
    const aggregated: MarketData[] = [];
    const marketEntries = [
      { markets: venusArbMarkets.data, rates: venusArbRates.data, chainId: arbitrum.id },
      { markets: venusBaseMarkets.data, rates: venusBaseRates.data, chainId: base.id },
    ];

    marketEntries.forEach(({ markets, rates, chainId }) => {
      if (!markets || !rates) return;
      const [, tokens, symbols, , decimals] = markets as unknown as any[];
      const [prices, supplyRates, borrowRates] = rates as unknown as any[];
      const network = CHAIN_ID_TO_NETWORK[chainId];

      tokens.forEach((token: string, i: number) => {
        if (token === "0x0000000000000000000000000000000000000000") return;
        const protocolSupplyAPY = venusRateToAPY(supplyRates[i]);
        const borrowAPY = venusRateToAPY(borrowRates[i]);
        // Apply external yields (LST staking yields, PT fixed yields, etc.)
        const supplyAPY = getEffectiveSupplyRate(token, symbols[i], protocolSupplyAPY);
        const price = Number(formatUnits(prices[i], 18 + (18 - decimals[i])));
        const utilization = borrowAPY > 0 ? (protocolSupplyAPY / borrowAPY) * 100 : 0;
        aggregated.push({
          icon: tokenNameToLogo(symbols[i]),
          name: symbols[i],
          supplyRate: `${formatPercentage(supplyAPY, 2, false)}%`,
          borrowRate: `${formatPercentage(borrowAPY, 2, false)}%`,
          price: price.toFixed(2),
          utilization: utilization.toFixed(2),
          address: token,
          networkType: "evm",
          network,
          protocol: "venus",
        });
      });
    });

    return aggregated;
  }, [venusArbMarkets.data, venusArbRates.data, venusBaseMarkets.data, venusBaseRates.data, getEffectiveSupplyRate]);
};

const VESU_V1_POOL_CONFIGS = [
  { poolName: "Genesis", poolId: VESU_V1_POOLS.Genesis },
  { poolName: "CarmineRunes", poolId: VESU_V1_POOLS.CarmineRunes },
  { poolName: "Re7StarknetEcosystem", poolId: VESU_V1_POOLS.Re7StarknetEcosystem },
  { poolName: "Re7xSTRK", poolId: VESU_V1_POOLS.Re7xSTRK },
] as const;

const VESU_V2_POOL_CONFIGS = [
  { poolName: "Prime", address: VESU_V2_POOLS.Prime },
  { poolName: "Re7xBTC", address: VESU_V2_POOLS.Re7xBTC },
  { poolName: "Re7USDCCore", address: VESU_V2_POOLS.Re7USDCCore },
  { poolName: "Re7USDCPrime", address: VESU_V2_POOLS.Re7USDCPrime },
  { poolName: "Re7USDCStableCore", address: VESU_V2_POOLS.Re7USDCStableCore },
] as const;

const useVesuData = (): MarketData[] => {
  const vesuGenesis = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [VESU_V1_POOLS.Genesis],
    refetchInterval: 0,
  });
  const vesuCarmineRunes = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [VESU_V1_POOLS.CarmineRunes],
    refetchInterval: 0,
  });
  const vesuRe7StarknetEcosystem = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [VESU_V1_POOLS.Re7StarknetEcosystem],
    refetchInterval: 0,
  });
  const vesuRe7xSTRK = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [VESU_V1_POOLS.Re7xSTRK],
    refetchInterval: 0,
  });

  const vesuPrime = useVesuV2Assets(VESU_V2_POOLS.Prime);
  const vesuRe7xBTC = useVesuV2Assets(VESU_V2_POOLS.Re7xBTC);
  const vesuRe7USDCCore = useVesuV2Assets(VESU_V2_POOLS.Re7USDCCore);
  const vesuRe7USDCPrime = useVesuV2Assets(VESU_V2_POOLS.Re7USDCPrime);
  const vesuRe7USDCStableCore = useVesuV2Assets(VESU_V2_POOLS.Re7USDCStableCore);

  const allowDeposit = false;

  return useMemo(() => {
    const markets: MarketData[] = [];

    // Build arrays inside useMemo to avoid dependency array issues
    const v1Assets = [vesuGenesis, vesuCarmineRunes, vesuRe7StarknetEcosystem, vesuRe7xSTRK];
    const v2Assets = [vesuPrime, vesuRe7xBTC, vesuRe7USDCCore, vesuRe7USDCPrime, vesuRe7USDCStableCore];

    v1Assets.forEach(({ data }, index) => {
      if (!data) return;
      const poolName = getV1PoolDisplay(VESU_V1_POOL_CONFIGS[index].poolName as any).name;
      (data as unknown as ContractResponse).forEach(asset => {
        const address = `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;
        const raw = typeof (asset as any).symbol === "bigint" ? feltToString((asset as any).symbol) : String((asset as any).symbol ?? "");
        const symbol = raw && raw.trim().length > 0 ? raw : getTokenNameFallback(address) ?? raw;
        const { borrowAPR, supplyAPY } = toAnnualRates(
          asset.fee_rate,
          asset.total_nominal_debt,
          asset.last_rate_accumulator,
          asset.reserve,
          asset.scale,
        );
        markets.push({
          icon: tokenNameToLogo(symbol.toLowerCase()),
          name: symbol,
          supplyRate: formatRate(supplyAPY, false),
          borrowRate: formatRate(borrowAPR, false),
          price: formatPrice(asset.price.value),
          utilization: formatUtilization(asset.utilization),
          address,
          networkType: "starknet",
          network: "starknet",
          protocol: "vesu",
          allowDeposit,
          poolName,
        });
      });
    });

    v2Assets.forEach(({ assetsWithRates }, index) => {
      const { name: poolName } = getV2PoolDisplay(VESU_V2_POOL_CONFIGS[index].poolName as any);
      assetsWithRates.forEach(asset => {
        const address = `0x${asset.address.toString(16).padStart(64, "0")}`;
        const rawSymbol = typeof asset.symbol === "bigint" ? feltToString(asset.symbol) : String(asset.symbol ?? "");
        const symbol = rawSymbol && rawSymbol.trim().length > 0 ? rawSymbol : getTokenNameFallback(address) ?? rawSymbol;
        const borrowAPR = asset.borrowAPR ?? 0;
        const supplyAPY = asset.supplyAPY ?? 0;
        markets.push({
          icon: tokenNameToLogo(symbol.toLowerCase()),
          name: symbol,
          supplyRate: formatRate(supplyAPY, false),
          borrowRate: formatRate(borrowAPR, false),
          price: formatPrice(asset.price?.value ?? 0n),
          utilization: formatUtilization(asset.utilization ?? 0n),
          address,
          networkType: "starknet",
          network: "starknet",
          protocol: "vesu",
          allowDeposit,
          poolName,
        });
      });
    });

    return markets;
  }, [
    allowDeposit,
    vesuGenesis, vesuCarmineRunes, vesuRe7StarknetEcosystem, vesuRe7xSTRK,
    vesuPrime, vesuRe7xBTC, vesuRe7USDCCore, vesuRe7USDCPrime, vesuRe7USDCStableCore,
  ]);
};

// ── TanStack Table for inner group markets ──────────────────────────

const networkIcons: Record<MarketData["network"], string> = {
  arbitrum: "/logos/arb.svg",
  base: "/logos/base.svg",
  optimism: "/logos/optimism.svg",
  linea: "/logos/linea.svg",
  starknet: "/logos/starknet.svg",
};

const protocolIcons: Record<MarketData["protocol"], string> = {
  aave: "/logos/aave.svg",
  nostra: "/logos/nostra.svg",
  venus: "/logos/venus.svg",
  vesu: "/logos/vesu.svg",
  compound: "/logos/compound.svg",
};

const networkNames: Record<MarketData["network"], string> = {
  arbitrum: "Arbitrum",
  base: "Base",
  optimism: "Optimism",
  linea: "Linea",
  starknet: "Starknet",
};

const protocolNames: Record<MarketData["protocol"], string> = {
  aave: "Aave",
  nostra: "Nostra",
  venus: "Venus",
  vesu: "Vesu",
  compound: "Compound",
};

const groupColumnHelper = createColumnHelper<MarketData>();

const groupColumns = [
  groupColumnHelper.accessor("network", {
    id: "network",
    header: "Network",
    cell: info => {
      const network = info.getValue();
      return (
        <div className="flex items-center gap-2">
          <div className="relative size-4">
            <Image src={networkIcons[network]} alt={network} fill className="object-contain" />
          </div>
          <span className="text-sm">{networkNames[network]}</span>
        </div>
      );
    },
    enableSorting: false,
  }),
  groupColumnHelper.accessor("protocol", {
    id: "protocol",
    header: "Protocol",
    cell: info => {
      const protocol = info.getValue();
      const poolName = info.row.original.poolName;
      return (
        <div className="flex items-center gap-2">
          <div className="relative size-4">
            <Image src={protocolIcons[protocol]} alt={protocol} fill className="object-contain" />
          </div>
          <span className="text-sm">
            {protocolNames[protocol]}
            {poolName ? <span className="text-base-content/40"> · {poolName}</span> : ""}
          </span>
        </div>
      );
    },
    enableSorting: false,
  }),
  groupColumnHelper.accessor("utilization", {
    id: "utilization",
    header: "Utilization",
    cell: info => (
      <span className="text-base-content/50 text-sm tabular-nums">{info.getValue()}%</span>
    ),
    sortingFn: (rowA, rowB) =>
      parseFloat(rowA.original.utilization) - parseFloat(rowB.original.utilization),
  }),
  groupColumnHelper.accessor("supplyRate", {
    id: "supplyRate",
    header: "Supply APY",
    cell: info => (
      <span className="text-success text-sm font-semibold tabular-nums">{info.getValue()}</span>
    ),
    sortingFn: (rowA, rowB) =>
      parseFloat(rowA.original.supplyRate) - parseFloat(rowB.original.supplyRate),
  }),
  groupColumnHelper.accessor("borrowRate", {
    id: "borrowRate",
    header: "Borrow APR",
    cell: info => (
      <span className="text-sm tabular-nums">{info.getValue()}</span>
    ),
    sortingFn: (rowA, rowB) =>
      parseFloat(rowA.original.borrowRate) - parseFloat(rowB.original.borrowRate),
  }),
];

/** Inner table for a single token group — uses TanStack Table for sorting */
const GroupMarketsTable: FC<{ markets: MarketData[] }> = ({ markets }) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: "borrowRate", desc: false }]);

  const table = useReactTable({
    data: markets,
    columns: groupColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="border-x border-b border-base-content/[0.05] overflow-hidden">
      <ScrollArea scrollbars="horizontal" type="auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const columnId = header.column.id;
                  const isCenter = columnId === "utilization" || columnId === "supplyRate" || columnId === "borrowRate";

                  return (
                    <th
                      key={header.id}
                      className={`market-th ${isCenter ? "text-center" : "text-left"} ${
                        canSort ? "hover:text-base-content/50 cursor-pointer" : ""
                      }`}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className={`inline-flex items-center gap-1 ${header.column.getIsSorted() ? "text-base-content/60" : ""}`}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "desc" && <ChevronDown className="size-3" />}
                        {header.column.getIsSorted() === "asc" && <ChevronUp className="size-3" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="market-row">
                {row.getVisibleCells().map(cell => {
                  const columnId = cell.column.id;
                  const isCenter = columnId === "utilization" || columnId === "supplyRate" || columnId === "borrowRate";

                  return (
                    <td
                      key={cell.id}
                      className={`market-td px-4 ${isCenter ? "text-center" : ""}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────

export const MarketsGrouped: FC<{ search: string }> = ({ search }) => {
  const aave = useAaveLikeData("AaveGatewayView", "aave", AAVE_CHAIN_IDS);
  const compoundArbitrum = useCompoundMarketData({ chainId: arbitrum.id });
  const compoundBase = useCompoundMarketData({ chainId: base.id });
  const compoundOptimism = useCompoundMarketData({ chainId: optimism.id });
  const compoundLinea = useCompoundMarketData({ chainId: linea.id });
  const compound = useMemo(
    () => [...compoundArbitrum, ...compoundBase, ...compoundOptimism, ...compoundLinea],
    [compoundArbitrum, compoundBase, compoundOptimism, compoundLinea],
  );
  const nostra = useNostraData();
  const venus = useVenusData();
  const vesu = useVesuData();
  const [sortBy, setSortBy] = useState<"supply" | "borrow">("supply");

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
      const key = canonicalizeTokenName(m.name);
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
    const canon = canonicalizeTokenName(search).toLowerCase();
    return sorted.filter(g => g.name.toLowerCase().includes(lower) || g.name.toLowerCase().includes(canon));
  }, [sorted, search]);

  // Memoized handlers for sort buttons
  const handleSortBySupply = useCallback(() => setSortBy("supply"), []);
  const handleSortByBorrow = useCallback(() => setSortBy("borrow"), []);

  return (
    <div className="space-y-6">
      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[9px] tracking-[0.12em] text-base-content/30 font-normal uppercase">Sort by best</span>
          <div className="bg-base-content/[0.03] flex p-0.5 border border-base-content/[0.05]">
            <button
              className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 ${
                sortBy === "supply"
                  ? "bg-success/15 text-success"
                  : "text-base-content/40 hover:text-base-content/70"
              }`}
              onClick={handleSortBySupply}
            >
              Supply APY
            </button>
            <button
              className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 ${
                sortBy === "borrow"
                  ? "bg-error/15 text-error"
                  : "text-base-content/40 hover:text-base-content/70"
              }`}
              onClick={handleSortByBorrow}
            >
              Borrow APR
            </button>
          </div>
        </div>
        <span className="text-base-content/25 text-[10px] tabular-nums">{filtered.length} tokens</span>
      </div>

      {/* Market Groups */}
      <div className="space-y-2">
        {filtered.map(group => (
          <details key={group.name} className="group overflow-hidden">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-4 border border-base-content/[0.05] bg-base-content/[0.02] px-4 py-3.5 transition-all duration-200 hover:bg-base-content/[0.04] hover:border-base-content/[0.08]">
                {/* Token Icon & Name */}
                <div className="flex min-w-[120px] items-center gap-3">
                  <div className="token-icon-wrapper-lg">
                    <Image src={group.icon} alt={group.name} fill className="object-contain" />
                  </div>
                  {isPTToken(group.name) ? (
                    <TokenSymbolDisplay symbol={group.name} size="base" variant="inline" />
                  ) : (
                    <span className="text-base font-semibold tracking-tight">{group.name}</span>
                  )}
                </div>

                {/* Rates */}
                <div className="flex flex-1 items-center justify-center gap-6 md:gap-12">
                  <RatePill
                    variant="supply"
                    label="Supply Rate"
                    rate={group.bestSupply.supplyRate}
                    networkType={group.bestSupply.networkType}
                    protocol={group.bestSupply.protocol}
                    poolName={group.bestSupply.poolName}
                  />
                  <RatePill
                    variant="borrow"
                    label="Borrow Rate"
                    rate={group.bestBorrow.borrowRate}
                    networkType={group.bestBorrow.networkType}
                    protocol={group.bestBorrow.protocol}
                    poolName={group.bestBorrow.poolName}
                  />
                </div>

                {/* Markets count & expand indicator */}
                <div className="flex items-center gap-3">
                  <span className="text-base-content/30 text-[10px] font-normal tracking-[0.12em]">
                    {group.markets.length} {group.markets.length === 1 ? "market" : "markets"}
                  </span>
                  <svg
                    className="text-base-content/30 group-open:text-base-content/50 size-4 transition-all duration-300 group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </summary>

            {/* Expanded: TanStack Table */}
            <GroupMarketsTable markets={group.markets} />
          </details>
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="bg-base-content/[0.03] border border-base-content/[0.05] mb-4 flex size-14 items-center justify-center">
            <MagnifyingGlassIcon className="text-base-content/20 size-6" />
          </div>
          <p className="text-base-content/30 text-sm">No markets found</p>
        </div>
      )}
    </div>
  );
};

export default MarketsGrouped;
