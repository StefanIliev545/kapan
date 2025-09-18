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

type StrategyHop = {
  title: string;
  description: string;
  rate: number;
  rateLabel: string;
  protocol: ProtocolName;
};

type StrategyCandidate = {
  id: string;
  symbol: string;
  tokenAddress: string;
  netYield: number;
  borrow: MarketRate;
  supply: MarketRate;
  collateral?: MarketRate;
  hops: StrategyHop[];
};

const toHexAddress = (value: bigint | string) => {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  return `0x${bigintValue.toString(16).padStart(64, "0")}`;
};

const createHop = ({
  title,
  description,
  rate,
  protocol,
  rateLabel,
}: Omit<StrategyHop, "rateLabel"> & { rateLabel?: string }): StrategyHop => ({
  title,
  description,
  rate,
  protocol,
  rateLabel: rateLabel ?? `${formatPercentage(rate)}% ${rate >= 0 ? "APY" : "APR"}`,
});

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

    const pickCollateral = (protocol: ProtocolName, excludeSymbol: string): MarketRate | undefined => {
      const pool = protocol === "Nostra" ? nostraMarkets : vesuMarkets;
      return pool
        .filter(market => market.symbol !== excludeSymbol && market.supplyAPY > 0)
        .sort((a, b) => b.supplyAPY - a.supplyAPY)[0];
    };

    const candidates: StrategyCandidate[] = [];

    for (const [symbol, entry] of bySymbol.entries()) {
      const nostra = entry.Nostra;
      const vesu = entry.Vesu;

      if (!nostra || !vesu) continue;
      if (nostra.borrowAPR === 0 && vesu.borrowAPR === 0) continue;

      const bestSupply = nostra.supplyAPY >= vesu.supplyAPY ? nostra : vesu;
      const bestBorrow = nostra.borrowAPR <= vesu.borrowAPR ? nostra : vesu;

      if (bestSupply.protocol === bestBorrow.protocol) continue;

      const netYield = bestSupply.supplyAPY - bestBorrow.borrowAPR;
      if (netYield <= 0) continue;

      const collateral = pickCollateral(bestBorrow.protocol, symbol);

      const hops: StrategyHop[] = [];

      if (collateral) {
        hops.push(
          createHop({
            title: `Supply ${collateral.symbol} on ${collateral.protocol}`,
            description:
              `Provide ${collateral.symbol} as collateral on ${collateral.protocol} to unlock borrowing power while still collecting its ${formatPercentage(collateral.supplyAPY)}% APY.`,
            protocol: collateral.protocol,
            rate: collateral.supplyAPY,
            rateLabel: `${formatPercentage(collateral.supplyAPY)}% APY`,
          }),
        );
      }

      hops.push(
        createHop({
          title: `Borrow ${symbol} on ${bestBorrow.protocol}`,
          description: `Draw $100 worth of ${symbol} against the collateral at the current ${formatPercentage(bestBorrow.borrowAPR)}% APR.`,
          protocol: bestBorrow.protocol,
          rate: bestBorrow.borrowAPR,
          rateLabel: `${formatPercentage(bestBorrow.borrowAPR)}% APR`,
        }),
      );

      hops.push(
        createHop({
          title: `Deposit ${symbol} on ${bestSupply.protocol}`,
          description: `Loop the borrowed ${symbol} into ${bestSupply.protocol} to earn the ${formatPercentage(bestSupply.supplyAPY)}% supply APY.`,
          protocol: bestSupply.protocol,
          rate: bestSupply.supplyAPY,
          rateLabel: `${formatPercentage(bestSupply.supplyAPY)}% APY`,
        }),
      );

      candidates.push({
        id: `${symbol}-${bestBorrow.protocol}-to-${bestSupply.protocol}`,
        symbol,
        tokenAddress: nostra.tokenAddress || vesu.tokenAddress,
        netYield,
        borrow: bestBorrow,
        supply: bestSupply,
        collateral,
        hops,
      });
    }

    return candidates.sort((a, b) => b.netYield - a.netYield);
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
          We continuously read the supported markets from the Vesu and Nostra gateways on Starknet and pair them with the on-chain
          optimal interest rate finder. Whenever one protocol offers a cheaper borrow than the other protocol&apos;s supply yield, you
          get a concrete loop opportunity.
        </p>
      </div>

      {loading && strategies.length === 0 ? (
        <div className="flex justify-center py-20">
          <Spinner size="loading-lg" />
        </div>
      ) : strategies.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-base-300 bg-base-100/60 p-10 text-center">
          <h2 className="text-2xl font-semibold text-base-content">No cross-protocol spreads right now</h2>
          <p className="mt-3 text-base text-base-content/70">
            Vesu and Nostra are currently pricing borrow and supply rates within each other&apos;s ranges. Check back soon as market
            utilization shifts.
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
  const { protocol: optimalBorrowProtocol, rate: optimalBorrowRate } = useOptimalRate({
    networkType: "starknet",
    tokenAddress: strategy.tokenAddress,
    type: "borrow",
  });

  const { protocol: optimalSupplyProtocol, rate: optimalSupplyRate } = useOptimalRate({
    networkType: "starknet",
    tokenAddress: strategy.tokenAddress,
    type: "supply",
  });

  const borrowProtocol = (optimalBorrowProtocol || strategy.borrow.protocol) as ProtocolName;
  const borrowRate = optimalBorrowRate > 0 ? optimalBorrowRate : strategy.borrow.borrowAPR;

  const supplyProtocol = (optimalSupplyProtocol || strategy.supply.protocol) as ProtocolName;
  const supplyRate = optimalSupplyRate > 0 ? optimalSupplyRate : strategy.supply.supplyAPY;

  const displayNetYield = supplyRate - borrowRate;

  const borrowHopIndex = strategy.collateral ? 1 : 0;
  const depositHopIndex = borrowHopIndex + 1;

  const displayHops = strategy.hops.map((hop, index) => {
    if (index === borrowHopIndex) {
      return {
        ...hop,
        title: `Borrow ${strategy.symbol} on ${borrowProtocol}`,
        rateLabel: `${formatPercentage(borrowRate)}% APR`,
        description: `Draw $100 worth of ${strategy.symbol} against the collateral at the ${formatPercentage(borrowRate)}% APR advertised by ${borrowProtocol}.`,
      } satisfies StrategyHop;
    }
    if (index === depositHopIndex) {
      return {
        ...hop,
        title: `Deposit ${strategy.symbol} on ${supplyProtocol}`,
        rateLabel: `${formatPercentage(supplyRate)}% APY`,
        description: `Loop the borrowed ${strategy.symbol} into ${supplyProtocol} and collect the ${formatPercentage(supplyRate)}% supply APY.`,
      } satisfies StrategyHop;
    }
    return hop;
  });

  return (
    <article className="rounded-3xl border border-base-300 bg-base-100/80 p-6 shadow-sm">
      <header className="flex flex-col gap-2 pb-4 border-b border-base-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary/80">{strategy.symbol} loop</p>
            <h2 className="text-2xl font-semibold text-base-content">
              {borrowProtocol} ➜ {supplyProtocol}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-base-content/50">Net yield on $100</p>
            <p className="text-3xl font-bold text-success">{formatPercentage(displayNetYield)}%</p>
          </div>
        </div>
        <p className="text-sm text-base-content/60">
          Borrow {strategy.symbol} on {borrowProtocol} at {formatPercentage(borrowRate)}% APR and park it on {supplyProtocol} for
          {" "}
          {formatPercentage(supplyRate)}% APY. The spread compounds on a $100 deposit of {strategy.symbol}.
        </p>
      </header>

      <ol className="mt-6 space-y-4">
        {displayHops.map((hop, index) => (
          <li key={`${strategy.id}-hop-${index}`} className="rounded-2xl border border-base-200 bg-base-100 p-4">
            <div className="flex items-center justify-between">
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
          <span className="font-semibold text-base-content">Risk notes:</span> Monitor liquidation buffers on {borrowProtocol} and keep an
          eye on utilization-driven rate jumps on {supplyProtocol}.
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
