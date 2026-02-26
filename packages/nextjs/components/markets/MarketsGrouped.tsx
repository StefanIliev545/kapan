"use client";

import { FC, useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
// TanStack Table is used by protocol-specific market sections (MorphoMarketsSection, etc.)
// This grouped view uses custom sorting for unified layout with collapsible sections
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
import { arbitrum, base, linea, optimism, mainnet } from "wagmi/chains";
import { feltToString, formatPrice, formatRate, formatUtilization, toAnnualRates } from "~~/utils/protocols";
import formatPercentage from "~~/utils/formatPercentage";
import { useExternalYields } from "~~/hooks/useExternalYields";
import { aaveRateToAPY, venusRateToAPY, CHAIN_ID_TO_NETWORK } from "~~/utils/protocolRates";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import { isPTToken } from "~~/hooks/usePendlePTYields";
import { useMorphoMarketsQuery } from "~~/utils/morpho/marketApi";
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";
import { getMorphoMarketUrl } from "~~/utils/morpho";

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

// ── Morpho & Euler data hooks ────────────────────────────────────────

/** Euler app network names for building vault URLs */
const EULER_NETWORK_NAMES: Record<number, string> = {
  1: "ethereum", 42161: "arbitrum", 8453: "base", 10: "optimism",
};

/**
 * Morpho data hook — returns individual markets with per-market links and TVL.
 * Grouping/collapse is handled by GroupMarketsTable for clean separation.
 */
const useMorphoData = (): MarketData[] => {
  const mainnetQuery = useMorphoMarketsQuery(mainnet.id);
  const arbitrumQuery = useMorphoMarketsQuery(arbitrum.id);
  const baseQuery = useMorphoMarketsQuery(base.id);

  return useMemo(() => {
    const results: MarketData[] = [];
    const queries = [
      { data: mainnetQuery.data, chainId: mainnet.id },
      { data: arbitrumQuery.data, chainId: arbitrum.id },
      { data: baseQuery.data, chainId: base.id },
    ];

    queries.forEach(({ data, chainId }) => {
      if (!data) return;
      const network = CHAIN_ID_TO_NETWORK[chainId] || "ethereum";
      data.forEach(market => {
        const supplyApy = (market.state?.supplyApy ?? 0) * 100;
        const borrowApy = (market.state?.borrowApy ?? 0) * 100;
        const utilization = (market.state?.utilization ?? 0) * 100;
        const collateralSymbol = market.collateralAsset?.symbol ?? "";
        const loanSymbol = market.loanAsset.symbol;
        results.push({
          icon: tokenNameToLogo(loanSymbol.toLowerCase()),
          name: loanSymbol,
          supplyRate: `${formatPercentage(supplyApy, 2, false)}%`,
          borrowRate: `${formatPercentage(borrowApy, 2, false)}%`,
          price: market.loanAsset.priceUsd?.toFixed(2) ?? "0.00",
          utilization: utilization.toFixed(2),
          address: market.uniqueKey,
          networkType: "evm",
          network,
          protocol: "morpho",
          poolName: collateralSymbol || undefined,
          tvlUsd: market.state?.supplyAssetsUsd ?? undefined,
          marketUrl: getMorphoMarketUrl(chainId, market.uniqueKey, collateralSymbol, loanSymbol) ?? undefined,
        });
      });
    });

    return results;
  }, [mainnetQuery.data, arbitrumQuery.data, baseQuery.data]);
};

const useEulerData = (): MarketData[] => {
  const arbitrumQuery = useEulerVaultsQuery(arbitrum.id);
  const baseQuery = useEulerVaultsQuery(base.id);
  const optimismQuery = useEulerVaultsQuery(optimism.id);
  const lineaQuery = useEulerVaultsQuery(linea.id);

  return useMemo(() => {
    const results: MarketData[] = [];
    const queries = [
      { data: arbitrumQuery.data, chainId: arbitrum.id },
      { data: baseQuery.data, chainId: base.id },
      { data: optimismQuery.data, chainId: optimism.id },
      { data: lineaQuery.data, chainId: linea.id },
    ];

    queries.forEach(({ data, chainId }) => {
      if (!data) return;
      const network = CHAIN_ID_TO_NETWORK[chainId] || "arbitrum";
      const eulerNetwork = EULER_NETWORK_NAMES[chainId] || "ethereum";
      data.forEach(vault => {
        const supplyApy = (vault.supplyApy ?? 0) * 100;
        const borrowApy = (vault.borrowApy ?? 0) * 100;
        const utilization = (vault.utilization ?? 0) * 100;
        results.push({
          icon: tokenNameToLogo(vault.asset.symbol.toLowerCase()),
          name: vault.asset.symbol,
          supplyRate: `${formatPercentage(supplyApy, 2, false)}%`,
          borrowRate: `${formatPercentage(borrowApy, 2, false)}%`,
          price: "0.00",
          utilization: utilization.toFixed(2),
          address: vault.address,
          networkType: "evm",
          network,
          protocol: "euler",
          poolName: vault.name,
          marketUrl: `https://app.euler.finance/vault/${vault.address}?network=${eulerNetwork}`,
        });
      });
    });

    return results;
  }, [arbitrumQuery.data, baseQuery.data, optimismQuery.data, lineaQuery.data]);
};

// ── TanStack Table for inner group markets ──────────────────────────

const networkIcons: Record<MarketData["network"], string> = {
  ethereum: "/logos/ethereum.svg",
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
  morpho: "/logos/morpho.svg",
  euler: "/logos/euler.svg",
};

const networkNames: Record<MarketData["network"], string> = {
  ethereum: "Ethereum",
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
  morpho: "Morpho",
  euler: "Euler",
};

/** Format USD value compactly: $1.2M, $340K, $12.5B, etc. */
const formatTvl = (usd: number | undefined): string => {
  if (usd == null || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
};

// Protocols with many entries per token — these get collapsed into expandable sections
const COLLAPSIBLE_PROTOCOLS = new Set<MarketData["protocol"]>(["morpho", "euler"]);
const COLLAPSIBLE_LABELS: Record<string, string> = { morpho: "Collateral / Loan pairs", euler: "Vaults" };

type SortColumn = "borrowRate" | "supplyRate" | "utilization" | "tvlUsd";
type SortDir = "asc" | "desc";

/** A single row or a collapsible group, unified for sorting */
type TableItem =
  | { kind: "row"; key: string; market: MarketData; sortSupply: number; sortBorrow: number; sortUtil: number; sortTvl: number }
  | { kind: "group"; key: string; protocol: MarketData["protocol"]; network: MarketData["network"]; markets: MarketData[]; bestSupply: number; bestBorrow: number; totalTvl: number; sortSupply: number; sortBorrow: number; sortUtil: number; sortTvl: number };

function buildTableItems(markets: MarketData[]): TableItem[] {
  const rows: TableItem[] = [];
  // Groups keyed by "protocol:network"
  const groups = new Map<string, { protocol: MarketData["protocol"]; network: MarketData["network"]; markets: MarketData[] }>();

  markets.forEach(m => {
    if (COLLAPSIBLE_PROTOCOLS.has(m.protocol)) {
      const gk = `${m.protocol}:${m.network}`;
      const g = groups.get(gk) || { protocol: m.protocol, network: m.network, markets: [] };
      g.markets.push(m);
      groups.set(gk, g);
    } else {
      rows.push({
        kind: "row",
        key: `${m.protocol}-${m.network}-${m.address}-${m.poolName ?? ""}`,
        market: m,
        sortSupply: parseFloat(m.supplyRate) || 0,
        sortBorrow: parseFloat(m.borrowRate) || 0,
        sortUtil: parseFloat(m.utilization) || 0,
        sortTvl: m.tvlUsd ?? 0,
      });
    }
  });

  groups.forEach((g, gk) => {
    const bestSupply = Math.max(...g.markets.map(m => parseFloat(m.supplyRate) || 0));
    const bestBorrow = Math.min(...g.markets.map(m => parseFloat(m.borrowRate) || 0));
    const totalTvl = g.markets.reduce((s, m) => s + (m.tvlUsd ?? 0), 0);
    const avgUtil = g.markets.reduce((s, m) => s + (parseFloat(m.utilization) || 0), 0) / g.markets.length;
    rows.push({
      kind: "group",
      key: gk,
      protocol: g.protocol,
      network: g.network,
      markets: g.markets,
      bestSupply,
      bestBorrow,
      totalTvl,
      sortSupply: bestSupply,
      sortBorrow: bestBorrow,
      sortUtil: avgUtil,
      sortTvl: totalTvl,
    });
  });

  return rows;
}

function sortTableItems(items: TableItem[], col: SortColumn, dir: SortDir): TableItem[] {
  const key = col === "supplyRate" ? "sortSupply" : col === "borrowRate" ? "sortBorrow" : col === "utilization" ? "sortUtil" : "sortTvl";
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => (a[key] - b[key]) * mult);
}

/** Header row for the unified layout */
const COLUMNS = [
  { id: "network" as const, label: "Network", center: false, sortable: false },
  { id: "protocol" as const, label: "Protocol", center: false, sortable: false },
  { id: "tvlUsd" as const, label: "TVL", center: true, sortable: true },
  { id: "utilization" as const, label: "Utilization", center: true, sortable: true },
  { id: "supplyRate" as const, label: "Supply APY", center: true, sortable: true },
  { id: "borrowRate" as const, label: "Borrow APR", center: true, sortable: true },
];

/** Inner table for a single token group — unified sorted layout with collapsible protocol sections */
const GroupMarketsTable: FC<{ markets: MarketData[] }> = ({ markets }) => {
  const [sortCol, setSortCol] = useState<SortColumn>("borrowRate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const items = useMemo(() => buildTableItems(markets), [markets]);
  const sorted = useMemo(() => sortTableItems(items, sortCol, sortDir), [items, sortCol, sortDir]);

  const toggleSort = useCallback((col: SortColumn) => {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir("asc");
      return col;
    });
  }, []);

  return (
    <div className="border-x border-b border-base-content/[0.05] overflow-hidden">
      <ScrollArea scrollbars="horizontal" type="auto">
        {/* Header */}
        <div className="flex items-center">
          {COLUMNS.map(col => (
            <div
              key={col.id}
              className={`market-th flex-1 ${col.center ? "text-center" : "text-left"} ${
                col.sortable ? "hover:text-base-content/50 cursor-pointer select-none" : ""
              }`}
              onClick={col.sortable ? () => toggleSort(col.id as SortColumn) : undefined}
            >
              <span className={`inline-flex items-center gap-1 ${sortCol === col.id ? "text-base-content/60" : ""}`}>
                {col.label}
                {sortCol === col.id && sortDir === "desc" && <ChevronDown className="size-3" />}
                {sortCol === col.id && sortDir === "asc" && <ChevronUp className="size-3" />}
              </span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {sorted.map(item =>
          item.kind === "row" ? (
            <div key={item.key} className="market-row flex items-center">
              <div className="market-td flex-1 px-4">
                <div className="flex items-center gap-2">
                  <div className="relative size-4"><Image src={networkIcons[item.market.network]} alt={item.market.network} fill className="object-contain" /></div>
                  <span className="text-sm">{networkNames[item.market.network]}</span>
                </div>
              </div>
              <div className="market-td flex-1 px-4">
                <div className="flex items-center gap-2">
                  <div className="relative size-4"><Image src={protocolIcons[item.market.protocol]} alt={item.market.protocol} fill className="object-contain" /></div>
                  {item.market.marketUrl ? (
                    <a href={item.market.marketUrl} target="_blank" rel="noopener noreferrer" className="group/link flex items-center gap-1 text-sm hover:text-primary transition-colors">
                      {protocolNames[item.market.protocol]}
                      {item.market.poolName && <span className="text-base-content/40"> · {item.market.poolName}</span>}
                      <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/link:opacity-50" />
                    </a>
                  ) : (
                    <span className="text-sm">
                      {protocolNames[item.market.protocol]}
                      {item.market.poolName && <span className="text-base-content/40"> · {item.market.poolName}</span>}
                    </span>
                  )}
                </div>
              </div>
              <div className="market-td flex-1 px-4 text-center"><span className="text-base-content/50 text-sm tabular-nums">{formatTvl(item.market.tvlUsd)}</span></div>
              <div className="market-td flex-1 px-4 text-center"><span className="text-base-content/50 text-sm tabular-nums">{item.market.utilization}%</span></div>
              <div className="market-td flex-1 px-4 text-center"><span className="text-success text-sm font-semibold tabular-nums">{item.market.supplyRate}</span></div>
              <div className="market-td flex-1 px-4 text-center"><span className="text-sm tabular-nums">{item.market.borrowRate}</span></div>
            </div>
          ) : (
            <CollapsibleProtocolGroup key={item.key} item={item} />
          ),
        )}
      </ScrollArea>
    </div>
  );
};

/** Column config for the inner expanded sub-table */
const INNER_COLUMNS: { id: string; label: string; sortKey?: SortColumn }[] = [
  { id: "market", label: "" },
  { id: "tvlUsd", label: "TVL", sortKey: "tvlUsd" },
  { id: "utilization", label: "Util", sortKey: "utilization" },
  { id: "supplyRate", label: "Supply", sortKey: "supplyRate" },
  { id: "borrowRate", label: "Borrow", sortKey: "borrowRate" },
];

/** Sort MarketData[] by a given column */
function sortMarkets(markets: MarketData[], col: SortColumn, dir: SortDir): MarketData[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...markets].sort((a, b) => {
    const av = col === "tvlUsd" ? (a.tvlUsd ?? 0) : parseFloat((a as any)[col]) || 0;
    const bv = col === "tvlUsd" ? (b.tvlUsd ?? 0) : parseFloat((b as any)[col]) || 0;
    return (av - bv) * mult;
  });
}

/** Expandable group row for Morpho/Euler within the unified sorted list */
const CollapsibleProtocolGroup: FC<{
  item: Extract<TableItem, { kind: "group" }>;
}> = ({ item }) => {
  const { protocol, network, markets, bestSupply, bestBorrow, totalTvl } = item;

  // Independent sort state for the expanded sub-table
  const [innerSortCol, setInnerSortCol] = useState<SortColumn>("borrowRate");
  const [innerSortDir, setInnerSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(
    () => sortMarkets(markets, innerSortCol, innerSortDir),
    [markets, innerSortCol, innerSortDir],
  );

  const toggleInnerSort = useCallback((col: SortColumn) => {
    setInnerSortCol(prev => {
      if (prev === col) {
        setInnerSortDir(d => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setInnerSortDir("asc");
      return col;
    });
  }, []);

  return (
    <details className="group/coll market-row">
      {/* Summary row — same flex layout as regular rows */}
      <summary className="cursor-pointer list-none flex items-center hover:bg-base-content/[0.02]">
        <div className="market-td flex-1 px-4">
          <div className="flex items-center gap-2">
            <div className="relative size-4"><Image src={networkIcons[network]} alt={network} fill className="object-contain" /></div>
            <span className="text-sm">{networkNames[network]}</span>
          </div>
        </div>
        <div className="market-td flex-1 px-4">
          <div className="flex items-center gap-2">
            <div className="relative size-4"><Image src={protocolIcons[protocol]} alt={protocol} fill className="object-contain" /></div>
            <span className="text-sm">
              {protocolNames[protocol]}
              <span className="text-base-content/40"> · {markets.length} mkts</span>
            </span>
            <svg className="text-base-content/30 group-open/coll:text-base-content/50 size-3 transition-transform duration-200 group-open/coll:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className="market-td flex-1 px-4 text-center"><span className="text-base-content/50 text-sm tabular-nums">{formatTvl(totalTvl)}</span></div>
        <div className="market-td flex-1 px-4 text-center"><span className="text-base-content/50 text-sm tabular-nums">—</span></div>
        <div className="market-td flex-1 px-4 text-center"><span className="text-success text-sm font-semibold tabular-nums">{formatPercentage(bestSupply, 2, false)}%</span></div>
        <div className="market-td flex-1 px-4 text-center"><span className="text-sm tabular-nums">{formatPercentage(bestBorrow, 2, false)}%</span></div>
      </summary>

      {/* Expanded: sortable sub-table of individual markets */}
      <div className="bg-base-content/[0.015] border-t border-base-content/[0.04]">
        {/* Sub-table column headers */}
        <div className="flex items-center px-4 py-1.5 border-b border-base-content/[0.03]">
          <div className="min-w-[320px]">
            <span className="text-[9px] tracking-[0.12em] text-base-content/25 font-normal uppercase">
              {COLLAPSIBLE_LABELS[protocol] || "Markets"}
            </span>
          </div>
          {INNER_COLUMNS.filter(c => c.sortKey).map(col => (
            <div
              key={col.id}
              className="min-w-[80px] text-center cursor-pointer select-none hover:text-base-content/50"
              onClick={() => toggleInnerSort(col.sortKey!)}
            >
              <span className={`inline-flex items-center gap-0.5 text-[9px] tracking-[0.12em] uppercase font-normal ${
                innerSortCol === col.sortKey ? "text-base-content/50" : "text-base-content/25"
              }`}>
                {col.label}
                {innerSortCol === col.sortKey && innerSortDir === "desc" && <ChevronDown className="size-2.5" />}
                {innerSortCol === col.sortKey && innerSortDir === "asc" && <ChevronUp className="size-2.5" />}
              </span>
            </div>
          ))}
        </div>

        {/* Individual market rows */}
        {sorted.map(m => (
          <div key={`${m.address}-${m.poolName ?? ""}`} className="flex items-center px-4 py-2 border-t border-base-content/[0.03] hover:bg-base-content/[0.02] transition-colors">
            <div className="min-w-[320px]">
              {m.marketUrl ? (
                <a href={m.marketUrl} target="_blank" rel="noopener noreferrer" className="group/link inline-flex items-center gap-1.5 text-sm hover:text-primary transition-colors">
                  {m.poolName && <span className="text-base-content/60">{m.poolName}</span>}
                  {m.poolName && <span className="text-base-content/25">/</span>}
                  <span className="font-medium">{m.name}</span>
                  <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/link:opacity-50" />
                </a>
              ) : (
                <span className="text-sm">
                  {m.poolName && <><span className="text-base-content/60">{m.poolName}</span><span className="text-base-content/25"> / </span></>}
                  <span className="font-medium">{m.name}</span>
                </span>
              )}
            </div>
            <span className="text-base-content/50 text-sm tabular-nums text-center min-w-[80px]">{formatTvl(m.tvlUsd)}</span>
            <span className="text-base-content/40 text-sm tabular-nums text-center min-w-[80px]">{m.utilization}%</span>
            <span className="text-success/80 text-sm tabular-nums text-center min-w-[90px]">{m.supplyRate}</span>
            <span className="text-base-content/80 text-sm tabular-nums text-center min-w-[90px]">{m.borrowRate}</span>
          </div>
        ))}
      </div>
    </details>
  );
};

// ── Main component ──────────────────────────────────────────────────

export const MarketsGrouped: FC<{ search: string; network?: string }> = ({ search, network }) => {
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
  const morpho = useMorphoData();
  const euler = useEulerData();
  const [sortBy, setSortBy] = useState<"supply" | "borrow">("supply");

  const all = useMemo(() => {
    const combined = [...aave, ...compound, ...nostra, ...venus, ...vesu, ...morpho, ...euler];
    if (!network || network === "all") return combined;
    return combined.filter(m => m.network === network);
  }, [aave, compound, nostra, venus, vesu, morpho, euler, network]);

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
