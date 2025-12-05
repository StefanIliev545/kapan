"use client";

import { useEffect, useMemo, useState, startTransition } from "react";

import type { NextPage } from "next";
import dynamic from "next/dynamic";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { SupportBanner } from "~~/components/common/SupportBanner";
import StableArea from "~~/components/common/StableArea";
import { ProtocolSkeleton } from "~~/components/common/ProtocolSkeleton";
import { DashboardLayout } from "~~/components/layouts/DashboardLayout";
import { DashboardMetrics } from "~~/components/dashboard/DashboardMetrics";
import { arbitrum, base, optimism, linea } from "wagmi/chains";
import { hardhat } from "viem/chains";
import { useGlobalState } from "~~/services/store/store";

// ---- Lazy-load heavy protocol views (client-only) ----
const AaveProtocolView = dynamic(
  () => import("~~/components/specific/aave/AaveProtocolView").then(m => m.AaveProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Aave" /> }
);

const CompoundProtocolView = dynamic(
  () => import("~~/components/specific/compound/CompoundProtocolView").then(m => m.CompoundProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Compound" /> }
);

const VenusProtocolView = dynamic(
  () => import("~~/components/specific/venus/VenusProtocolView").then(m => m.VenusProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Venus" /> }
);

const VesuProtocolView = dynamic(
  () => import("~~/components/specific/vesu/VesuProtocolView").then(m => m.VesuProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Vesu" /> }
);

const NostraProtocolView = dynamic(
  () => import("~~/components/specific/nostra/NostraProtocolView").then(m => m.NostraProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Nostra" /> }
);

const ZeroLendProtocolView = dynamic(
  () => import("~~/components/specific/zerolend/ZeroLendProtocolView").then(m => m.ZeroLendProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading ZeroLend" /> }
);

// Network options (memo for referential stability)
const networkOptions: NetworkOption[] = [
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
  { id: "linea", name: "Linea", logo: "/logos/linea.svg" },
  ...(process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true"
    ? [{ id: "hardhat", name: "Hardhat", logo: "/logos/ethereum.svg" } as NetworkOption]
    : []),
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
];

const App: NextPage = () => {
  const initialNetwork = process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true" ? "hardhat" : "base";
  const [selectedNetwork, setSelectedNetwork] = useState<string>(initialNetwork);
  const totalSupplied = useGlobalState(state => state.totalSupplied);
  const totalBorrowed = useGlobalState(state => state.totalBorrowed);
  const totalNet = useGlobalState(state => state.totalNet);
  const resetTotals = useGlobalState(state => state.resetTotals);
  const allLoaded = useGlobalState(
    state => state.expectedProtocolCount > 0 && state.loadedProtocolCount === state.expectedProtocolCount,
  );

  // Tiny helper so the button click never feels blocked
  const handleNetworkChange = (id: string) => {
    startTransition(() => setSelectedNetwork(id));
  };

  // Optional: prefetch likely-next bundles when idle (micro-UX win)
  useEffect(() => {
    const idle = (cb: () => void) =>
      ("requestIdleCallback" in window ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 200));

    idle(async () => {
      if (selectedNetwork === "starknet") {
        import("~~/components/specific/aave/AaveProtocolView");
        import("~~/components/specific/compound/CompoundProtocolView");
        import("~~/components/specific/venus/VenusProtocolView");
      } else {
        import("~~/components/specific/vesu/VesuProtocolView");
        import("~~/components/specific/nostra/NostraProtocolView");
      }
    });
  }, [selectedNetwork]);

  const warnings = useMemo(() => ({
    arbitrum: "Arbitrum support is experimental and pre-audit.",
    base: "Base support is experimental and pre-audit.",
    optimism: "Optimism support is experimental and pre-audit.",
    linea: "Linea support is experimental and pre-audit.",
  }), []);



  useEffect(() => {
    const protocolCountByNetwork: Record<string, number> = {
      base: 4,
      arbitrum: 3,
      optimism: 2,
      linea: 3,
      starknet: 2,
      hardhat: 3,
    };

    resetTotals(protocolCountByNetwork[selectedNetwork] ?? 0);
  }, [resetTotals, selectedNetwork]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        {/* Header with metrics */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-base-content tracking-tight">Positions</h1>
            </div>

            {/* Network Switcher */}
            <NetworkFilter
              networks={networkOptions}
              defaultNetwork={initialNetwork}
              onNetworkChange={handleNetworkChange}
            />
          </div>

          {/* Compact metrics row */}
          <DashboardMetrics
            netWorth={totalNet}
            totalSupply={totalSupplied}
            totalDebt={totalBorrowed}
            isLoading={!allLoaded}
          />
        </div>

        {/* Subtle warning */}
        {warnings[selectedNetwork as keyof typeof warnings] && (
          <p className="text-xs text-base-content/40 border-l-2 border-base-300 pl-3">
            {warnings[selectedNetwork as keyof typeof warnings]}
          </p>
        )}

        {/* Protocols */}
        <div className="space-y-3">
          {/* ---- Network panes: only render the active selection ---- */}
          {/* ARBITRUM */}
          {selectedNetwork === "arbitrum" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <VenusProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* BASE */}
          {selectedNetwork === "base" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <ZeroLendProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <VenusProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* HARDHAT (conditionally enabled via NEXT_PUBLIC_ENABLE_HARDHAT_UI) */}
          {process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true" && selectedNetwork === "hardhat" && (
            <div className="space-y-3">
              <div className="alert alert-warning text-sm">
                Local Hardhat network is for development only. Ensure your node is running on 127.0.0.1:8545.
              </div>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <VenusProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* STARKNET */}
          {selectedNetwork === "starknet" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <VesuProtocolView />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <NostraProtocolView />
              </StableArea>
            </div>
          )}

          {/* OPTIMISM */}
          {selectedNetwork === "optimism" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={optimism.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="16rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={optimism.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* LINEA */}
          {selectedNetwork === "linea" && (
            <div className="space-y-6">
              <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={linea.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
                <ZeroLendProtocolView chainId={linea.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={linea.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}
        </div>

        <div className="mt-12">
          <SupportBanner />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default App;
