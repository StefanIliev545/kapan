"use client";

import { useMemo } from "react";
import { ArrowTopRightOnSquareIcon, BoltIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import Spinner from "~~/components/common/Spinner";
import { POOL_IDS } from "~~/components/specific/vesu/VesuMarkets";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import formatPercentage from "~~/utils/formatPercentage";
import { feltToString, toAnnualRates } from "~~/utils/protocols";

const VESU_POOL_ID = POOL_IDS.Genesis;

type ProtocolName = "Nostra" | "Vesu";

type MarketRate = {
  protocol: ProtocolName;
  symbol: string;
  tokenAddress: string;
  supplyAPY: number; // percentage (e.g. 5.12 => 5.12%)
  borrowAPR: number; // percentage (e.g. 3.45 => 3.45%)
};

type StrategyLeg = {
  asset: string;
  tokenAddress: string;
  borrow: MarketRate;
  supply: MarketRate;
  netSpread: number;
};

type StrategyCandidate = {
  id: string;
  collateral: MarketRate;
  legs: StrategyLeg[];
  netYield: number;
};

const toHexAddress = (value: bigint | string) => {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  return `0x${bigintValue.toString(16).padStart(64, "0")}`;
};

const normalizeProtocolName = (value: string): ProtocolName => {
  const normalized = value.toLowerCase();
  if (normalized.includes("nostra")) return "Nostra";
  if (normalized.includes("vesu")) return "Vesu";
  return value as ProtocolName;
};

const StrategiesPage = () => {
  const {
    data: nostraAssetInfos,
    isLoading: isLoadingNostraAssets,
  } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_supported_assets_info",
    args: [0n],
  });

  const nostraTokenAddresses = useMemo(
    () =>
      nostraAssetInfos
        ? (nostraAssetInfos as unknown as any[]).map(info =>
            `0x${info[0].toString(16).padStart(64, "0")}`,
          )
        : [],
    [nostraAssetInfos],
  );

  const {
    data: nostraInterestRates,
    isLoading: isLoadingNostraRates,
  } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "NostraGateway",
    functionName: "get_interest_rates",
    args: [nostraTokenAddresses],
    refetchInterval: 0,
  });

  const {
    data: vesuSupportedAssets,
    isLoading: isLoadingVesu,
  } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [VESU_POOL_ID],
    refetchInterval: 0,
  });

  const nostraMarkets = useMemo<MarketRate[]>(() => {
    if (!nostraAssetInfos || !nostraInterestRates) return [];

    const infos = nostraAssetInfos as unknown as any[];
    const rates = nostraInterestRates as unknown as any[];

    return infos.map((info, index) => {
      const tokenAddress = `0x${info[0].toString(16).padStart(64, "0")}`;
      const symbol = feltToString(info[1]);
      const rate = rates[index];
      const supplyAPY = Number(rate?.lending_rate ?? 0n) / 1e16;
      const borrowAPR = Number(rate?.borrowing_rate ?? 0n) / 1e16;

      return {
        protocol: "Nostra" as const,
        symbol,
        tokenAddress,
        supplyAPY,
        borrowAPR,
      };
    });
  }, [nostraAssetInfos, nostraInterestRates]);

  const vesuMarkets = useMemo<MarketRate[]>(() => {
    if (!vesuSupportedAssets) return [];

    const assets = vesuSupportedAssets as unknown as Array<{
      address: bigint;
      symbol: bigint;
      fee_rate: bigint;
      total_nominal_debt: bigint;
      last_rate_accumulator: bigint;
      reserve: bigint;
      scale: bigint;
    }>;

    return assets.map(asset => {
      const { borrowAPR, supplyAPY } = toAnnualRates(
        asset.fee_rate,
        asset.total_nominal_debt,
        asset.last_rate_accumulator,
        asset.reserve,
        asset.scale,
      );

      return {
        protocol: "Vesu" as const,
        symbol: feltToString(asset.symbol),
        tokenAddress: toHexAddress(asset.address),
        supplyAPY: (supplyAPY ?? 0) * 100,
        borrowAPR: (borrowAPR ?? 0) * 100,
      };
    });
  }, [vesuSupportedAssets]);

  const strategies = useMemo<StrategyCandidate[]>(() => {
    if (nostraMarkets.length === 0 || vesuMarkets.length === 0) return [];

    const bySymbol = new Map<string, Partial<Record<ProtocolName, MarketRate>>>();

    nostraMarkets.forEach(market => {
      bySymbol.set(market.symbol, { ...bySymbol.get(market.symbol), Nostra: market });
    });

    vesuMarkets.forEach(market => {
      bySymbol.set(market.symbol, { ...bySymbol.get(market.symbol), Vesu: market });
    });

    const spreads: StrategyLeg[] = [];

    for (const [symbol, entry] of bySymbol.entries()) {
      const nostra = entry.Nostra;
      const vesu = entry.Vesu;

      if (!nostra || !vesu) continue;

      const bestSupply = nostra.supplyAPY >= vesu.supplyAPY ? nostra : vesu;
      const bestBorrow = nostra.borrowAPR <= vesu.borrowAPR ? nostra : vesu;

      if (bestSupply.protocol === bestBorrow.protocol) continue;

      const netSpread = bestSupply.supplyAPY - bestBorrow.borrowAPR;
      if (netSpread <= 0) continue;

      spreads.push({
        asset: symbol,
        tokenAddress: bestSupply.tokenAddress || bestBorrow.tokenAddress,
        borrow: bestBorrow,
        supply: bestSupply,
        netSpread,
      });
    }

    const preferredCollateralSymbols = new Set([
      "WBTC",
      "BTC",
      "WBTC.E",
      "ETH",
      "WETH",
      "STETH",
      "WSTETH",
    ]);

    const combinedMarkets = [...nostraMarkets, ...vesuMarkets];

    const collateralOptions = combinedMarkets
      .filter(market => preferredCollateralSymbols.has(market.symbol.toUpperCase()))
      .filter(market => market.supplyAPY > 0)
      .sort((a, b) => b.supplyAPY - a.supplyAPY);

    const fallbacks = combinedMarkets.filter(market => market.supplyAPY > 0).sort((a, b) => b.supplyAPY - a.supplyAPY);

    const collateralCandidates = collateralOptions.length > 0 ? collateralOptions : fallbacks;

    const candidates: StrategyCandidate[] = [];

    collateralCandidates.forEach(collateral => {
      const firstLegOptions = spreads
        .filter(spread => spread.borrow.protocol === collateral.protocol)
        .sort((a, b) => b.netSpread - a.netSpread);

      firstLegOptions.forEach(firstLeg => {
        const distinctAssetOptions = spreads
          .filter(
            spread =>
              spread.borrow.protocol === firstLeg.supply.protocol &&
              spread.asset.toLowerCase() !== firstLeg.asset.toLowerCase(),
          )
          .sort((a, b) => b.netSpread - a.netSpread);

        const sameAssetFallback = spreads
          .filter(
            spread =>
              spread.borrow.protocol === firstLeg.supply.protocol &&
              spread.asset.toLowerCase() === firstLeg.asset.toLowerCase(),
          )
          .sort((a, b) => b.netSpread - a.netSpread);

        const bestSecondLeg = (distinctAssetOptions[0] || sameAssetFallback[0]) as StrategyLeg | undefined;
        if (!bestSecondLeg) return;

        const netYield = firstLeg.netSpread + bestSecondLeg.netSpread;

        if (netYield <= 0) return;

        candidates.push({
          id: `${collateral.symbol}-${collateral.protocol}-${firstLeg.asset}-${bestSecondLeg.asset}-${firstLeg.supply.protocol}-${bestSecondLeg.supply.protocol}`,
          collateral,
          legs: [firstLeg, bestSecondLeg],
          netYield,
        });
      });
    });

    return candidates
      .sort((a, b) => b.netYield - a.netYield)
      .filter((candidate, index, arr) => arr.findIndex(other => other.id === candidate.id) === index)
      .slice(0, 4);
  }, [nostraMarkets, vesuMarkets]);

  const loading = isLoadingNostraAssets || isLoadingNostraRates || isLoadingVesu;

  return (
    <div className="container mx-auto px-4 pb-16">
      <div className="max-w-3xl mx-auto text-center py-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <BoltIcon className="h-4 w-4" />
          Starknet Lending Arbitrage
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-base-content">
          Cross-protocol strategies powered by live optimal rates
        </h1>
        <p className="mt-4 text-base text-base-content/70">
          We continuously read the supported markets from the Vesu and Nostra gateways on Starknet and cross-check them with the
          on-chain optimal interest rate finder. When two assets simultaneously clear with a cheaper borrow on one desk and a richer
          supply on the other, we stitch them into a five-hop loop so long ETH or WBTC vaults can auto-amplify their carry in real time.
        </p>
      </div>

      {loading && strategies.length === 0 ? (
        <div className="flex justify-center py-20">
          <Spinner size="loading-lg" />
        </div>
      ) : strategies.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-base-300 bg-base-100/60 p-10 text-center">
          <h2 className="text-2xl font-semibold text-base-content">No multi-hop spreads right now</h2>
          <p className="mt-3 text-base text-base-content/70">
            We need two assets with opposing borrow/supply quotes across Vesu and Nostra to build a five-step loop. Utilization is
            tight at the moment, so check back when the Starknet desks desync.
          </p>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          {strategies.map(strategy => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      )}
    </div>
  );
};

const StrategyCard = ({ strategy }: { strategy: StrategyCandidate }) => {
  const [firstLeg, secondLeg] = strategy.legs as [StrategyLeg, StrategyLeg];

  const firstBorrow = useOptimalRate({
    networkType: "starknet",
    tokenAddress: firstLeg.tokenAddress,
    type: "borrow",
  });

  const firstSupply = useOptimalRate({
    networkType: "starknet",
    tokenAddress: firstLeg.tokenAddress,
    type: "supply",
  });

  const secondBorrow = useOptimalRate({
    networkType: "starknet",
    tokenAddress: secondLeg.tokenAddress,
    type: "borrow",
  });

  const secondSupply = useOptimalRate({
    networkType: "starknet",
    tokenAddress: secondLeg.tokenAddress,
    type: "supply",
  });

  const collateralProtocol = strategy.collateral.protocol;

  const firstBorrowProtocol = normalizeProtocolName(firstBorrow.protocol || firstLeg.borrow.protocol);
  const firstBorrowRate = firstBorrow.rate > 0 ? firstBorrow.rate : firstLeg.borrow.borrowAPR;

  const firstSupplyProtocol = normalizeProtocolName(firstSupply.protocol || firstLeg.supply.protocol);
  const firstSupplyRate = firstSupply.rate > 0 ? firstSupply.rate : firstLeg.supply.supplyAPY;

  const secondBorrowProtocol = normalizeProtocolName(secondBorrow.protocol || secondLeg.borrow.protocol);
  const secondBorrowRate = secondBorrow.rate > 0 ? secondBorrow.rate : secondLeg.borrow.borrowAPR;

  const secondSupplyProtocol = normalizeProtocolName(secondSupply.protocol || secondLeg.supply.protocol);
  const secondSupplyRate = secondSupply.rate > 0 ? secondSupply.rate : secondLeg.supply.supplyAPY;

  const loopNetYield = firstSupplyRate + secondSupplyRate - firstBorrowRate - secondBorrowRate;
  const collateralYield = strategy.collateral.supplyAPY;

  const hops = [
    {
      title: `Supply ${strategy.collateral.symbol} on ${collateralProtocol}`,
      description: `Post your ${strategy.collateral.symbol} as collateral on ${collateralProtocol} and keep stacking its ${formatPercentage(collateralYield)}% APY while unlocking borrow power.`,
      rateLabel: `${formatPercentage(collateralYield)}% APY`,
    },
    {
      title: `Borrow ${firstLeg.asset} on ${firstBorrowProtocol}`,
      description: `Tap the ${strategy.collateral.symbol} position to draw $100 of ${firstLeg.asset} at ${formatPercentage(firstBorrowRate)}% APR.`,
      rateLabel: `${formatPercentage(firstBorrowRate)}% APR`,
    },
    {
      title: `Deposit ${firstLeg.asset} on ${firstSupplyProtocol}`,
      description: `Loop the borrowed ${firstLeg.asset} into ${firstSupplyProtocol} and earn ${formatPercentage(firstSupplyRate)}% APY on it.`,
      rateLabel: `${formatPercentage(firstSupplyRate)}% APY`,
    },
    {
      title: `Borrow ${secondLeg.asset} on ${secondBorrowProtocol}`,
      description: `Against the ${firstLeg.asset} stack, borrow ${secondLeg.asset} for $100 notional at ${formatPercentage(secondBorrowRate)}% APR.`,
      rateLabel: `${formatPercentage(secondBorrowRate)}% APR`,
    },
    {
      title: `Deposit ${secondLeg.asset} on ${secondSupplyProtocol}`,
      description: `Park the ${secondLeg.asset} flow on ${secondSupplyProtocol} to add another ${formatPercentage(secondSupplyRate)}% APY layer.`,
      rateLabel: `${formatPercentage(secondSupplyRate)}% APY`,
    },
  ];

  const assetPath = `${strategy.collateral.symbol} ➜ ${firstLeg.asset} ➜ ${secondLeg.asset}`;

  return (
    <article className="rounded-3xl border border-base-300 bg-base-100/80 p-6 shadow-sm">
      <header className="flex flex-col gap-2 border-b border-base-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary/80">{strategy.collateral.symbol} collateral loop</p>
            <h2 className="text-2xl font-semibold text-base-content">{assetPath}</h2>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-base-content/50">Net yield on $100</p>
            <p className="text-3xl font-bold text-success">{formatPercentage(loopNetYield)}%</p>
          </div>
        </div>
        <p className="text-sm text-base-content/60">
          Stake {strategy.collateral.symbol} on {collateralProtocol} to unlock credit, borrow {firstLeg.asset} on {firstBorrowProtocol} and
          stream it into {firstSupplyProtocol} for yield, then tap that desk to borrow {secondLeg.asset} and shuttle it back to {secondSupplyProtocol}.
          Each borrow leg is sized to $100 notionally, so the net shown is the annualized spread you earn while the collateral keeps compounding.
        </p>
        <div className="flex flex-wrap gap-4 text-xs text-base-content/60">
          <span className="rounded-full bg-base-200 px-3 py-1 font-medium text-base-content">
            Collateral APY: {formatPercentage(collateralYield)}%
          </span>
          <span className="rounded-full bg-base-200 px-3 py-1 font-medium text-base-content">
            Borrow cost: {formatPercentage(firstBorrowRate + secondBorrowRate)}% APR
          </span>
          <span className="rounded-full bg-base-200 px-3 py-1 font-medium text-base-content">
            Supply stack: {formatPercentage(firstSupplyRate + secondSupplyRate)}% APY
          </span>
        </div>
      </header>

      <ol className="mt-6 space-y-4">
        {hops.map((hop, index) => (
          <li key={`${strategy.id}-hop-${index}`} className="rounded-2xl border border-base-200 bg-base-100 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="text-base font-semibold text-base-content">{hop.title}</p>
                  <p className="text-sm text-base-content/60">{hop.description}</p>
                </div>
              </div>
              <div className="text-right text-sm font-medium text-base-content/70">{hop.rateLabel}</div>
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-base-200 pt-4 text-sm text-base-content/60">
        <div>
          <span className="font-semibold text-base-content">Risk notes:</span> Keep health factors padded on {collateralProtocol} and
          watch utilization shocks on {firstBorrowProtocol} / {secondBorrowProtocol} that can reprice the borrow legs.
        </div>
        <Link href="/markets" className="inline-flex items-center gap-1 text-primary hover:text-primary-focus" prefetch={false}>
          View live markets
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </Link>
      </footer>
    </article>
  );
};

export default StrategiesPage;
