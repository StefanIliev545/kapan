"use client";

import { FC, useMemo, useState } from "react";
import Image from "next/image";
import type { NextPage } from "next";
import { arbitrum, base, linea, optimism } from "wagmi/chains";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits, type Address } from "viem";
import type { Abi } from "abitype";

import { NetworkFilter, type NetworkOption } from "~~/components/NetworkFilter";
import { RefinanceModalEvm } from "~~/components/modals/RefinanceModalEvmDemo";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import { useDeployedContractInfo, useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const networkOptions: NetworkOption[] = [
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
  { id: "linea", name: "Linea", logo: "/logos/linea.svg" },
];

const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  base: base.id,
  arbitrum: arbitrum.id,
  optimism: optimism.id,
  linea: linea.id,
};

type ActiveRefi = {
  fromProtocol: string;
  position: {
    name: string;
    tokenAddress: string;
    decimals: number;
    balance?: number | bigint;
    poolId?: bigint | string;
    type: "borrow";
  };
  chainId?: number;
};

type AggregatedBorrow = ProtocolPosition & { protocol: string };

const formatUsd = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);

const formatPercent = (v: number) => `${v.toFixed(2).replace(/\.00$/, "")}%`;

const normalizeProtocolName = (protocol?: string) =>
  (protocol || "")
    .toLowerCase()
    .replace(/\s+v\d+$/i, "")
    .replace(/\s+/g, "");

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

const ImportToAavePage: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("base");
  const [activeRefi, setActiveRefi] = useState<ActiveRefi | null>(null);
  const [showPerProtocolView, setShowPerProtocolView] = useState(false); // from previous step
  const [isOneShotRunning, setIsOneShotRunning] = useState(false); // NEW

  const chainId = NETWORK_TO_CHAIN_ID[selectedNetwork];

  const warnings = useMemo(
    () => ({
      arbitrum: "Arbitrum support is experimental and pre-audit.",
      base: "Base support is experimental and pre-audit.",
      optimism: "Optimism support is experimental and pre-audit.",
      linea: "Linea support is experimental and pre-audit.",
    }),
    [],
  );

  /* ---------------------- collect borrows from all protocols --------------------- */

  const aavePositions = useAaveLikePositions("AaveGatewayView", chainId);
  const zerolendPositions = useAaveLikePositions("ZeroLendGatewayView", chainId);
  const compoundBorrows = useCompoundBorrowPositions(chainId);
  const venusBorrows = useVenusBorrowPositions(chainId);

  const allBorrows: AggregatedBorrow[] = useMemo(() => {
    const mapWithProtocol = (arr: ProtocolPosition[], protocol: string): AggregatedBorrow[] =>
      (arr || [])
        .filter(p => typeof p.balance === "number" && (p.balance as number) < -0.000001)
        .map(p => ({ ...p, protocol }));

    return [
      ...mapWithProtocol(zerolendPositions.borrowedPositions, "ZeroLend"),
      ...mapWithProtocol(compoundBorrows.borrowedPositions, "Compound V3"),
      ...mapWithProtocol(venusBorrows.borrowedPositions, "Venus"),
      // add more protocols here later if needed
    ];
  }, [
    zerolendPositions.borrowedPositions,
    compoundBorrows.borrowedPositions,
    venusBorrows.borrowedPositions,
  ]);

  const isAnyLoading =
    zerolendPositions.isLoading ||
    compoundBorrows.isLoading ||
    venusBorrows.isLoading;

  /* -------------------------------- refinance modal (per-position) ---------------- */

  const openRefiModal = (fromProtocol: string, p: ProtocolPosition) => {
    if (!p.tokenAddress || p.tokenDecimals == null) return;

    setActiveRefi({
      fromProtocol,
      chainId,
      position: {
        name: p.name,
        tokenAddress: p.tokenAddress,
        decimals: p.tokenDecimals,
        balance: p.tokenBalance ?? undefined,
        type: "borrow",
      },
    });
  };

  const closeRefiModal = () => setActiveRefi(null);

  /* ----------------------------- One-shot ALL to Aave ---------------------------- */

  const { createMoveBuilder, executeFlowBatchedIfPossible } = useKapanRouterV2(); // NEW

  const handleRefiAllToAave = async () => {
    if (allBorrows.length === 0 || isAnyLoading) return;

    try {
      setIsOneShotRunning(true);

      // map protocol -> its collateral set (supplied positions)
      const protocolCollat: Record<string, ProtocolPosition[]> = {
        ZeroLend: zerolendPositions.suppliedPositions || [],
        Venus: venusBorrows.suppliedPositions || [],
        "Compound V3": [], // we don't have collateral data here yet
      };

      // SINGLE builder for all protocols / all borrows
      const builder = createMoveBuilder();

      // keep track of which (protocol, collateralToken) we already moved
      const movedCollatKeys = new Set<string>();

      for (const borrow of allBorrows) {
        const fromProtocol = borrow.protocol;
        const decimals = borrow.tokenDecimals ?? 18;
        const debtToken = borrow.tokenAddress as Address;
        const rawDebt = (borrow.tokenBalance as bigint) || 0n;
        if (rawDebt <= 0n) continue;

        const expectedDebt = formatUnits(rawDebt, decimals);

        const normalizedFrom = normalizeProtocolName(fromProtocol);
        if (normalizedFrom === "compound") {
          // NOTE: assumes setCompoundMarket config is applied
          // per-market before its related steps
          builder.setCompoundMarket(debtToken);
        }

        // 1) unlock full debt with Aave flash
        builder.buildUnlockDebt({
          fromProtocol,
          debtToken,
          expectedDebt,
          debtDecimals: decimals,
          flash: {
            version: "aave" as any,
            premiumBps: 9,
            bufferBps: 10,
          },
        });

        // 2) move ALL collateral we know for that protocol (max = true), de-duplicated
        const collats = protocolCollat[fromProtocol] || [];
        collats.forEach(c => {
          const bal = (c.tokenBalance as bigint) || 0n;
          if (!c.tokenAddress || bal <= 0n) return;

          const key = `${fromProtocol.toLowerCase()}-${(c.tokenAddress as string).toLowerCase()}`;
          if (movedCollatKeys.has(key)) return;

          movedCollatKeys.add(key);

          const cDecimals = c.tokenDecimals ?? 18;
          builder.buildMoveCollateral({
            fromProtocol,
            toProtocol: "Aave V3",
            collateralToken: c.tokenAddress as Address,
            withdraw: { max: true },
            collateralDecimals: cDecimals,
          });
        });

        // 3) borrow on Aave to cover flash for this debt token
        builder.buildBorrow({
          mode: "coverFlash",
          toProtocol: "Aave V3",
          token: debtToken,
          decimals,
          extraBps: 5,
          approveToRouter: true,
        });
      }

      // If nothing meaningful was added, exit quietly
      const flow = builder.build();
      const res = await executeFlowBatchedIfPossible(flow, true);
      if (!res) {
        await executeFlowBatchedIfPossible(flow, false);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("One-shot refi ALL → Aave error:", e);
    } finally {
      setIsOneShotRunning(false);
    }
  };


  return (
    <div className="min-h-[calc(100vh-6rem)] w-full bg-[#050816] text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 md:py-10 lg:py-12">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-2xl bg-slate-900/70 p-2 ring-sky-500/40">
                <Image src="/logos/aave.svg" alt="Aave" fill className="object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Refinance your position from any protocol to Aave.
                </h1>
                <p className="mt-1 max-w-xl text-sm text-slate-400">
                  Pick the network, we’ll scan supported protocols on that chain and list all
                  your open borrows that can be moved into Aave in a single streamlined flow.
                </p>
              </div>
            </div>
          </div>

          <div className="md:self-start">
            <NetworkFilter
              networks={networkOptions}
              defaultNetwork="base"
              onNetworkChange={setSelectedNetwork}
            />
          </div>
        </header>

        {/* Network warning */}
        {warnings[selectedNetwork as keyof typeof warnings] && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            {warnings[selectedNetwork as keyof typeof warnings]}
          </div>
        )}

        {/* Main layout */}
        <main className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Left: unified list of all source borrows */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Source
            </h2>

            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.7)] backdrop-blur">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Your open positions
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aggregated across ZeroLend, Compound, Venus on the selected network.
                  </p>
                </div>

                {/* NEW: One-shot refi button */}
                <button
                  type="button"
                  onClick={handleRefiAllToAave}
                  disabled={
                    isAnyLoading || isOneShotRunning || allBorrows.length === 0
                  }
                  className={`
                    inline-flex items-center gap-1 rounded-md
                    border border-sky-500/40 bg-sky-500/10
                    px-3 py-1 text-[11px] font-semibold
                    text-sky-200 transition
                    hover:bg-sky-500/20 hover:border-sky-400
                    disabled:cursor-not-allowed disabled:opacity-40
                  `}
                >
                  {isOneShotRunning ? "Refinancing…" : "Refinance all to Aave"}
                </button>
              </div>

              <div className="mt-4">
                {isAnyLoading && allBorrows.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-xs text-slate-400">
                    <span className="loading loading-spinner loading-xs" />
                    <span>Scanning protocols for open borrow positions…</span>
                  </div>
                ) : allBorrows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/60 px-4 py-4 text-xs text-slate-400">
                    No borrow positions found across supported protocols on this network.
                    Open a position in ZeroLend, Compound or Venus and it will appear here automatically.
                  </div>
                ) : (
                  <>
                    <BorrowList
                      items={allBorrows}
                      onSelect={openRefiModal}
                      aaveBorrowPositions={aavePositions.borrowedPositions}
                    />

                    {/* Collapsible per-protocol collateral/borrow breakdown */}
                    <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Per-protocol view
                          </h3>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            See how your collateral and borrows are distributed across each protocol.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowPerProtocolView(prev => !prev)}
                          className="
                            inline-flex items-center gap-1
                            rounded-md border border-slate-700/60
                            bg-slate-900/70 px-2 py-0.5
                            text-[10px] font-medium text-slate-200
                            hover:bg-slate-800 hover:border-slate-500
                            transition
                          "
                        >
                          {showPerProtocolView ? "Hide" : "Show"}
                          <span
                            className={`transition-transform ${
                              showPerProtocolView ? "rotate-180" : "rotate-0"
                            }`}
                          >
                            ▾
                          </span>
                        </button>
                      </div>

                      {showPerProtocolView && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <SourceProtocolCard
                            protocolName="ZeroLend"
                            suppliedPositions={zerolendPositions.suppliedPositions}
                            borrowedPositions={zerolendPositions.borrowedPositions}
                            hasCollateralData
                          />
                          <SourceProtocolCard
                            protocolName="Compound V3"
                            borrowedPositions={compoundBorrows.borrowedPositions}
                            hasCollateralData={false}
                          />
                          <SourceProtocolCard
                            protocolName="Venus"
                            suppliedPositions={venusBorrows.suppliedPositions}
                            borrowedPositions={venusBorrows.borrowedPositions}
                            hasCollateralData
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Right: Aave destination summary */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Destination
            </h2>

            <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-sky-950/40 p-4 shadow-[0_18px_60px_rgba(8,47,73,0.55)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-9 w-9 rounded-2xl bg-slate-950/80 p-1.5 ring-sky-400/60">
                    <Image src="/logos/aave.svg" alt="Aave" fill className="object-contain" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-50">
                        Aave V3 · Destination
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-300/80">
                      Any position you pick on the left will be rebalanced into Aave V3 on{" "}
                      <span className="font-medium">
                        {networkOptions.find(n => n.id === selectedNetwork)?.name}
                      </span>
                      , keeping your collateral and health factor safe.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-950/60 p-3 ring-1 ring-white/5 relative">
                <AaveSummaryCard
                  suppliedPositions={aavePositions.suppliedPositions}
                  borrowedPositions={aavePositions.borrowedPositions}
                />
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Refinance modal → Aave (per-position) */}
      {activeRefi && (
        <RefinanceModalEvm
          isOpen={!!activeRefi}
          onClose={closeRefiModal}
          fromProtocol={activeRefi.fromProtocol}
          position={activeRefi.position}
          chainId={activeRefi.chainId}
          forcedDestinationProtocol="Aave V3"
        />
      )}
    </div>
  );
};

export default ImportToAavePage;

/* -------------------------------------------------------------------------- */
/*  Borrow list (aggregated)                                                  */
/* -------------------------------------------------------------------------- */
type SourceProtocolCardProps = {
  protocolName: string;
  suppliedPositions?: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  hasCollateralData?: boolean;
};

const SourceProtocolCard: FC<SourceProtocolCardProps> = ({
  protocolName,
  suppliedPositions,
  borrowedPositions,
  hasCollateralData = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    totalSuppliedUsd,
    totalBorrowedUsd,
    suppliedNonZero,
    borrowedNonZero,
  } = useMemo(() => {
    const toNum = (v: unknown) =>
      typeof v === "number" ? (v as number) : 0;

    const suppliedList = (suppliedPositions || []).filter(p => toNum(p.balance) > 0.000001);
    const borrowedList = (borrowedPositions || []).filter(p => toNum(p.balance) < -0.000001);

    const totalSuppliedUsd = suppliedList.reduce(
      (acc, p) => acc + toNum(p.balance),
      0,
    );
    const totalBorrowedUsd = borrowedList.reduce(
      (acc, p) => acc + Math.abs(toNum(p.balance)),
      0,
    );

    return { totalSuppliedUsd, totalBorrowedUsd, suppliedNonZero: suppliedList, borrowedNonZero: borrowedList };
  }, [suppliedPositions, borrowedPositions]);

  const showToggle = suppliedNonZero.length > 0 || borrowedNonZero.length > 0;

  return (
    <div className="relative rounded-xl border border-slate-800/70 bg-slate-950/80 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {protocolName}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="text-[10px] text-slate-500">Supplied</div>
              <div className="font-semibold text-slate-50">
                {formatUsd(totalSuppliedUsd)}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] text-slate-500">Borrowed</div>
              <div className="font-semibold text-slate-50">
                {formatUsd(totalBorrowedUsd)}
              </div>
            </div>
          </div>
          {!hasCollateralData && (
            <div className="mt-1 text-[10px] text-slate-500">
              Collateral breakdown is not available for this protocol yet.
            </div>
          )}
        </div>

        {showToggle && (
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="
              mt-0.5
              inline-flex items-center gap-1
              rounded-md border border-slate-700/60
              bg-slate-900/70 px-2 py-0.5
              text-[10px] font-medium text-slate-200
              hover:bg-slate-800 hover:border-slate-500
              transition
            "
          >
            {isExpanded ? "Hide" : "Details"}
            <span
              className={`transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
            >
              ▾
            </span>
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 border-t border-slate-800/70 pt-2 text-[11px] text-slate-200">
          <div className="space-y-1.5">
            {hasCollateralData && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Collateral 
                </div>
                {suppliedNonZero.length === 0 ? (
                  <div className="rounded-md bg-slate-950/60 px-2 py-1 text-[10px] text-slate-500">
                    No supplied positions.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {suppliedNonZero.map((p, idx) => {
                      const usd = typeof p.balance === "number" ? (p.balance as number) : 0;
                      const apy = p.currentRate ?? 0;
                      return (
                        <li
                          key={`${protocolName}-sup-${p.tokenAddress || p.name}-${idx}`}
                          className="flex items-center justify-between rounded-md bg-slate-950/80 px-2 py-1"
                        >
                          <div className="flex items-center gap-2">
                            {p.icon && (
                              <div className="relative h-3.5 w-3.5 overflow-hidden rounded-full bg-slate-900">
                                <Image src={p.icon} alt={p.name} fill className="object-contain" />
                              </div>
                            )}
                            <span>{p.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">
                              {formatUsd(usd)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Supply APY · {formatPercent(apy || 0)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Borrowed
            </div>
            {borrowedNonZero.length === 0 ? (
              <div className="rounded-md bg-slate-950/60 px-2 py-1 text-[10px] text-slate-500">
                No borrow positions.
              </div>
            ) : (
              <ul className="space-y-1">
                {borrowedNonZero.map((p, idx) => {
                  const raw = typeof p.balance === "number" ? (p.balance as number) : 0;
                  const usd = Math.abs(raw);
                  const apy = p.currentRate ?? 0;
                  return (
                    <li
                      key={`${protocolName}-bor-${p.tokenAddress || p.name}-${idx}`}
                      className="flex items-center justify-between rounded-md bg-slate-950/80 px-2 py-1"
                    >
                      <div className="flex items-center gap-2">
                        {p.icon && (
                          <div className="relative h-3.5 w-3.5 overflow-hidden rounded-full bg-slate-900">
                            <Image src={p.icon} alt={p.name} fill className="object-contain" />
                          </div>
                        )}
                        <span>{p.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatUsd(usd)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Borrow APY · {formatPercent(apy || 0)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Source Protocol List                                                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Borrow list (aggregated)                                                  */
/* -------------------------------------------------------------------------- */

const BorrowList: FC<{
  items: AggregatedBorrow[];
  onSelect: (fromProtocol: string, position: ProtocolPosition) => void;
  aaveBorrowPositions: ProtocolPosition[];
}> = ({ items, onSelect, aaveBorrowPositions }) => {
  const findAaveBorrowRate = (symbol: string | undefined) => {
    if (!symbol) return null;
    const match = aaveBorrowPositions.find(
      p => p.tokenSymbol === symbol || p.name === symbol,
    );
    return match?.currentRate ?? null;
  };

  return (
    <div className="divide-y divide-slate-800/70 rounded-xl border border-slate-800/80 bg-slate-950/80">
      {items.map((p, idx) => {
        const usdDebt = -(p.balance as number);
        const apr = p.currentRate ?? 0;
        const aaveBorrowApy = findAaveBorrowRate(p.tokenSymbol);

        return (
          <button
            key={`${p.protocol}-${p.tokenAddress}-${idx}`}
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-900/80"
            onClick={() => onSelect(p.protocol, p)}
          >
            <div className="flex flex-1 items-center gap-3">
              <div className="relative h-7 w-7 rounded-full bg-slate-900/80">
                {p.icon ? (
                  <Image src={p.icon} alt={p.name} fill className="object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-400">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-100">
                    {p.name}
                  </span>
                  <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    {p.protocol}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Debt size is shown in USD. Click to refinance into Aave.
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 text-xs">
              <span className="font-semibold text-slate-50">
                {formatUsd(usdDebt)}
              </span>

              <span className="text-[11px] text-slate-400">
                Borrow APY · {formatPercent(apr || 0)}
              </span>

              {aaveBorrowApy != null && (
                <span className="text-[11px] text-slate-400">
                  Aave borrow APY · {formatPercent(aaveBorrowApy)}
                </span>
              )}
            </div>

            <div className="ml-2 rounded-full bg-sky-500/15 px-3 py-1 text-[11px] font-semibold text-sky-300">
              Refinance
            </div>
          </button>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Aave summary card                                                         */
/* -------------------------------------------------------------------------- */

const AaveSummaryCard: FC<{
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
}> = ({ suppliedPositions, borrowedPositions }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    totalSuppliedUsd,
    totalBorrowedUsd,
    utilization,
    suppliedNonZero,
    borrowedNonZero,
  } = useMemo(() => {
    const toNumber = (v: unknown) =>
      typeof v === "number" ? (v as number) : 0;

    const suppliedNonZero = (suppliedPositions || []).filter(p => {
      const v = toNumber(p.balance);
      return v > 0.000001;
    });

    const borrowedNonZero = (borrowedPositions || []).filter(p => {
      const v = toNumber(p.balance);
      return v < -0.000001;
    });

    const totalSuppliedUsd = suppliedNonZero.reduce(
      (acc, p) => acc + toNumber(p.balance),
      0,
    );

    const totalBorrowedUsd = borrowedNonZero.reduce(
      (acc, p) => acc + Math.abs(toNumber(p.balance)),
      0,
    );

    const utilization =
      totalSuppliedUsd > 0
        ? Math.min(100, Math.max(0, (totalBorrowedUsd / totalSuppliedUsd) * 100))
        : 0;

    return {
      totalSuppliedUsd,
      totalBorrowedUsd,
      utilization,
      suppliedNonZero,
      borrowedNonZero,
    };
  }, [suppliedPositions, borrowedPositions]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            Current on Aave
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-500">Supplied</div>
              <div className="font-semibold text-slate-50">
                {formatUsd(totalSuppliedUsd)}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-500">Borrowed</div>
              <div className="font-semibold text-slate-50">
                {formatUsd(totalBorrowedUsd)}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-500">Utilization</div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-200">
                  {utilization.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="
            absolute right-3 top-3 
            flex items-center gap-1 
            rounded-md border border-slate-700/50 
            bg-slate-900/60 
            px-2 py-0.5 
            text-[10px] font-medium text-slate-200
            hover:bg-slate-800 hover:border-slate-500
            transition
          "
        >
          {isExpanded ? "Hide" : "Show"}
          <span
            className={`transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
          >
            ▾
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="mt-1 border-t border-slate-800/70 pt-3 text-xs text-slate-200">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Supplied list */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Supplied positions
              </div>
              {suppliedNonZero.length === 0 ? (
                <div className="rounded-md bg-slate-900/60 px-3 py-2 text-[11px] text-slate-500">
                  No supplied positions on Aave.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {suppliedNonZero.map((p, idx) => {
                    const usd = typeof p.balance === "number" ? (p.balance as number) : 0;
                    const apy = p.currentRate ?? 0;

                    return (
                      <li
                        key={`${p.tokenAddress || p.name}-supplied-${idx}`}
                        className="flex items-center justify-between rounded-md bg-slate-950/70 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          {p.icon && (
                            <div className="relative h-4 w-4 overflow-hidden rounded-full bg-slate-900">
                              <Image
                                src={p.icon}
                                alt={p.name}
                                fill
                                className="object-contain"
                              />
                            </div>
                          )}
                          <span className="text-[11px] font-medium">
                            {p.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-semibold">
                            {formatUsd(usd)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Supply APY · {formatPercent(apy || 0)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Borrowed list */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Borrowed positions
              </div>
              {borrowedNonZero.length === 0 ? (
                <div className="rounded-md bg-slate-900/60 px-3 py-2 text-[11px] text-slate-500">
                  No borrow positions on Aave yet.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {borrowedNonZero.map((p, idx) => {
                    const raw = typeof p.balance === "number" ? (p.balance as number) : 0;
                    const usd = Math.abs(raw);
                    const apy = p.currentRate ?? 0;

                    return (
                      <li
                        key={`${p.tokenAddress || p.name}-borrowed-${idx}`}
                        className="flex items-center justify-between rounded-md bg-slate-950/70 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          {p.icon && (
                            <div className="relative h-4 w-4 overflow-hidden rounded-full bg-slate-900">
                              <Image
                                src={p.icon}
                                alt={p.name}
                                fill
                                className="object-contain"
                              />
                            </div>
                          )}
                          <span className="text-[11px] font-medium">
                            {p.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-semibold">
                            {formatUsd(usd)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Borrow APY · {formatPercent(apy || 0)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


/* -------------------------------------------------------------------------- */
/*  Hooks: Aave-like, Compound, Venus                                         */
/* -------------------------------------------------------------------------- */

/** Shared hook for Aave-style gateways: Aave V3, ZeroLend, etc. */
function useAaveLikePositions(
  contractName: "AaveGatewayView" | "ZeroLendGatewayView",
  chainId?: number,
) {
  const { address: connectedAddress } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({
    contractName: contractName as any,
    chainId: chainId as any,
  });

  const queryAddress = connectedAddress || contractInfo?.address;
  const isWalletConnected = !!connectedAddress;

  const { data: allTokensInfo, isLoading } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: contractName as any,
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    chainId,
  });

  const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    if (!allTokensInfo) return { suppliedPositions: supplied, borrowedPositions: borrowed };

    (allTokensInfo as any[]).forEach(token => {
      let decimals = typeof token.decimals !== "undefined" ? Number(token.decimals) : 18;
      if (typeof token.decimals === "undefined") {
        if (token.symbol === "USDC" || token.symbol === "USD₮0" || token.symbol === "USDC.e") {
          decimals = 6;
        }
      }

      const supplyAPY = convertRateToAPY(token.supplyRate);
      const borrowAPY = convertRateToAPY(token.borrowRate);
      const tokenPrice = Number(formatUnits(token.price, 8));

      const supplyBalance = token.balance ? Number(formatUnits(token.balance, decimals)) : 0;
      const supplyUsdBalance = supplyBalance * tokenPrice;

      supplied.push({
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        balance: supplyUsdBalance,
        tokenBalance: token.balance,
        currentRate: supplyAPY,
        tokenAddress: token.token,
        tokenPrice: token.price,
        tokenDecimals: decimals,
        tokenSymbol: token.symbol,
      });

      const borrowBalance = token.borrowBalance ? Number(formatUnits(token.borrowBalance, decimals)) : 0;
      const borrowUsdBalance = borrowBalance * tokenPrice;

      borrowed.push({
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        balance: -borrowUsdBalance,
        tokenBalance: token.borrowBalance,
        currentRate: borrowAPY,
        tokenAddress: token.token,
        tokenPrice: token.price,
        tokenDecimals: decimals,
        tokenSymbol: token.symbol,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [allTokensInfo]);

  // simple token-filter when wallet not connected (same idea as AaveLike)
  const tokenFilter = ["BTC", "ETH", "USDC", "USDT"];
  const sanitize = (name: string) => name.replace("₮", "T").replace(/[^a-zA-Z]/g, "").toUpperCase();

  const filteredSuppliedPositions = isWalletConnected
    ? suppliedPositions
    : suppliedPositions.filter(p => tokenFilter.includes(sanitize(p.name)));
  const filteredBorrowedPositions = isWalletConnected
    ? borrowedPositions
    : borrowedPositions.filter(p => tokenFilter.includes(sanitize(p.name)));

  return { suppliedPositions: filteredSuppliedPositions, borrowedPositions: filteredBorrowedPositions, isLoading };
}

/* ----------------------- Compound V3 borrow positions ---------------------- */

const ERC20_META_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const decimalsFromScale = (scale: bigint) => {
  if (scale <= 1n) return 0;
  let s = scale;
  let d = 0;
  while (s % 10n === 0n) {
    s /= 10n;
    d++;
  }
  return d;
};

function useCompoundBorrowPositions(chainId?: number) {
  const { address: connectedAddress } = useAccount();
  const queryAddress = (connectedAddress || "0x0000000000000000000000000000000000000000") as Address;

  const { data: gateway } = useScaffoldContract({
    contractName: "CompoundGatewayView",
    chainId: chainId as any,
  });
  const gatewayAddress = gateway?.address as Address | undefined;

  const { data: activeBaseTokens, isLoading: loadingBaseTokens } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "allActiveBaseTokens",
    chainId: chainId as any,
  });

  const baseTokens: Address[] = useMemo(
    () => ((activeBaseTokens as Address[] | undefined) || []) as Address[],
    [activeBaseTokens],
  );

  const noMarkets = !gatewayAddress || baseTokens.length === 0;

  const symbolCalls = useMemo(
    () => baseTokens.map(t => ({ address: t, abi: ERC20_META_ABI, functionName: "symbol" as const, args: [] })),
    [baseTokens],
  );
  const { data: symbolResults, isLoading: loadingSymbols } = useReadContracts({
    allowFailure: true,
    contracts: symbolCalls,
    query: { enabled: symbolCalls.length > 0 },
  });
  const symbols: string[] = useMemo(
    () => (symbolResults || []).map(r => (r?.result as string) || ""),
    [symbolResults],
  );

  const { data: baseTokenDecimalsRaw, isLoading: loadingDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [baseTokens],
    chainId: chainId as any,
    query: { enabled: baseTokens.length > 0 },
  });
  const baseTokenDecimals: number[] = useMemo(
    () => (baseTokenDecimalsRaw || []).map((d: any) => Number(d)),
    [baseTokenDecimalsRaw],
  );

  const compoundCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(t => ({
      address: gatewayAddress,
      abi: gateway.abi as Abi,
      functionName: "getCompoundData" as const,
      args: [t, queryAddress],
    }));
  }, [gatewayAddress, gateway, baseTokens, queryAddress]);

  const { data: compoundResults, isLoading: loadingCompound } = useReadContracts({
    allowFailure: true,
    contracts: compoundCalls,
    query: { enabled: compoundCalls.length > 0 },
  });

  const convertRateToAPR = (ratePerSecond: bigint): number => {
    const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
    return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / 1e18;
  };

  const borrowedPositions: ProtocolPosition[] = useMemo(() => {
    const borrowed: ProtocolPosition[] = [];
    if (noMarkets) return borrowed;

    baseTokens.forEach((base, idx) => {
      const compound = compoundResults?.[idx]?.result as
        | [bigint, bigint, bigint, bigint, bigint, bigint]
        | undefined;
      const symbol = symbols[idx] || "";
      const decimals = Number((baseTokenDecimals?.[idx] as unknown as bigint) ?? 18n);
      if (!compound) return;

      const [supplyRate, borrowRate, , borrowBalanceRaw, priceRaw, priceScale] = compound;
      const priceDecimals = decimalsFromScale(priceScale ?? 1n);
      const price = Number(formatUnits(priceRaw, priceDecimals));
      const borrowAPR = convertRateToAPR(borrowRate ?? 0n);

      const tokenBorrow = Number(formatUnits(borrowBalanceRaw ?? 0n, decimals));
      const usdBorrow = tokenBorrow * price;

      const safeName = (symbol || "").replace("₮", "T");
      const icon = tokenNameToLogo(safeName) || "/logos/token.svg";

      borrowed.push({
        icon,
        name: safeName || "Token",
        balance: borrowBalanceRaw && borrowBalanceRaw > 0n ? -usdBorrow : 0,
        tokenBalance: borrowBalanceRaw ?? 0n,
        currentRate: borrowAPR,
        tokenAddress: base,
        tokenPrice: priceRaw,
        tokenDecimals: decimals,
        tokenSymbol: safeName,
      });
    });

    return borrowed;
  }, [noMarkets, baseTokens, compoundResults, symbols, baseTokenDecimals]);

  const isLoading =
    loadingBaseTokens || loadingSymbols || loadingDecimals || loadingCompound;

  return { borrowedPositions, isLoading };
}

/* --------------------------- Venus borrow positions ------------------------ */


function useVenusBorrowPositions(chainId?: number) {
  const { address: connectedAddress } = useAccount();

  const { data: marketDetails, isLoading: loadingMarkets } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getAllVenusMarkets",
    chainId: chainId as any,
  });

  const [vTokens, tokens, symbols, , decimals, prices] = (marketDetails ||
    []) as [string[], string[], string[], any, number[], bigint[]];

  const { data: ratesData, isLoading: loadingRates } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getMarketRates",
    args: [vTokens],
    chainId: chainId as any,
    query: { enabled: !!vTokens && vTokens.length > 0 },
  });

  const ZERO = "0x0000000000000000000000000000000000000000";
  const { data: userBalances, isLoading: loadingBalances } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getUserBalances",
    args: [vTokens, connectedAddress || ZERO],
    chainId: chainId as any,
    query: { enabled: !!vTokens && vTokens.length > 0 },
  });

  const convertRateToAPY = (ratePerBlock: bigint): number => {
    const ethMantissa = 1e18;
    const blocksPerDay = 60 * 60 * 24;
    const daysPerYear = 365;
    const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
    return (Math.pow(ratePerBlockNum * blocksPerDay + 1, daysPerYear - 1) - 1) * 100;
  };

  const tokenOverrides: Record<string, { name: string; logo: string }> = {
    "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": { name: "gmWETH/USDC", logo: "/logos/gmweth.svg" },
    "0x47c031236e19d024b42f8AE6780E44A573170703": { name: "gmWBTC/USDC", logo: "/logos/gmbtc.svg" },
  };

  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];
    if (!marketDetails || !ratesData || !userBalances) {
      return { suppliedPositions: supplied, borrowedPositions: borrowed };
    }

    const [, supplyRates, borrowRates] = ratesData as unknown as [bigint[], bigint[], bigint[]];
    const [balances, borrowBalances] = userBalances as unknown as [bigint[], bigint[]];

    for (let i = 0; i < vTokens.length; i++) {
      const underlying = tokens[i];
      if (underlying === ZERO) continue;

      const symbol = symbols[i];
      const dec = decimals[i];
      const price = prices[i];

      const override = tokenOverrides[underlying];
      const displayName = override ? override.name : symbol;
      const logo = override ? override.logo : tokenNameToLogo(symbol);

      const supplyRate = supplyRates[i];
      const borrowRate = borrowRates[i];
      const supplyAPY = convertRateToAPY(supplyRate);
      const borrowAPY = convertRateToAPY(borrowRate);

      const tokenPrice = Number(formatUnits(price, 18 + (18 - dec)));
      const priceWith8Decimals = BigInt(Math.round(tokenPrice * 1e8));

      const supplyBalance = balances[i];
      const supplyFormatted = Number(formatUnits(supplyBalance, dec));
      const supplyUsdBalance = supplyFormatted * tokenPrice;

      const borrowBalance = borrowBalances[i];
      const borrowFormatted = Number(formatUnits(borrowBalance, dec));
      const borrowUsdBalance = borrowFormatted * tokenPrice;

      supplied.push({
        icon: logo,
        name: displayName,
        balance: supplyUsdBalance,
        tokenBalance: supplyBalance,
        currentRate: supplyAPY,
        tokenAddress: underlying,
        tokenPrice: priceWith8Decimals,
        tokenDecimals: Number(dec),
        tokenSymbol: symbol,
      });

      borrowed.push({
        icon: logo,
        name: displayName,
        balance: -borrowUsdBalance,
        tokenBalance: borrowBalance,
        currentRate: borrowAPY,
        tokenAddress: underlying,
        tokenPrice: priceWith8Decimals,
        tokenDecimals: Number(dec),
        tokenSymbol: symbol,
      });
    }

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [marketDetails, ratesData, userBalances, vTokens, tokens, symbols, decimals, prices]);

  const isLoading = loadingMarkets || loadingRates || loadingBalances;

  return { suppliedPositions, borrowedPositions, isLoading };
}