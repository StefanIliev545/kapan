"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";

import type { NextPage } from "next";
import dynamic from "next/dynamic";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { SupportBanner } from "~~/components/common/SupportBanner";
import StableArea from "~~/components/common/StableArea";
import { ProtocolSkeleton } from "~~/components/common/ProtocolSkeleton";
import { DashboardLayout } from "~~/components/layouts/DashboardLayout";
import { DashboardMetrics } from "~~/components/dashboard/DashboardMetrics";
import { arbitrum, base, optimism, linea, plasma, mainnet } from "wagmi/chains";
import { hardhat } from "viem/chains";
import { useAccount as useEvmAccount } from "wagmi";
import { useAccount as useStarknetAccount } from "~~/hooks/useAccount";
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

const MorphoProtocolView = dynamic(
  () => import("~~/components/specific/morpho/MorphoProtocolView").then(m => m.MorphoProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Morpho" /> }
);

const SparkProtocolView = dynamic(
  () => import("~~/components/specific/spark/SparkProtocolView").then(m => m.SparkProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Spark" /> }
);

// Network options (memo for referential stability)
const networkOptions: NetworkOption[] = [
  { id: "ethereum", name: "Ethereum", logo: "/logos/ethereum.svg" },
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "plasma", name: "Plasma", logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
  { id: "linea", name: "Linea", logo: "/logos/linea.svg" },
  ...(process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true"
    ? [{ id: "hardhat", name: "Hardhat", logo: "/logos/ethereum.svg" } as NetworkOption]
    : []),
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
];

const protocolCountByNetwork: Record<string, number> = {
  ethereum: 5, // Aave, Morpho, Spark, ZeroLend, Compound
  base: 5, // Aave, ZeroLend, Compound, Venus, Morpho
  arbitrum: 4, // Aave, Compound, Venus, Morpho
  optimism: 3, // Aave, Morpho, Compound
  linea: 3,
  starknet: 2,
  plasma: 1,
  hardhat: 3, // Aave, Morpho, Compound
};

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
  const { address: evmAddress } = useEvmAccount();
  const { viewingAddress: starknetAddress } = useStarknetAccount();
  const lastSeenAddresses = useRef<{ evm?: string; starknet?: string }>({});

  const expectedProtocolCount = protocolCountByNetwork[selectedNetwork] ?? 0;

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
        import("~~/components/specific/morpho/MorphoProtocolView");
        import("~~/components/specific/spark/SparkProtocolView");
      } else {
        import("~~/components/specific/vesu/VesuProtocolView");
        import("~~/components/specific/nostra/NostraProtocolView");
      }
    });
  }, [selectedNetwork]);

  const warnings = useMemo(() => ({
    ethereum: "Ethereum mainnet support is experimental and pre-audit.",
    arbitrum: "Arbitrum support is experimental and pre-audit.",
    base: "Base support is experimental and pre-audit.",
    optimism: "Optimism support is experimental and pre-audit.",
    linea: "Linea support is experimental and pre-audit.",
  }), []);



  useEffect(() => {
    resetTotals(expectedProtocolCount);
  }, [resetTotals, expectedProtocolCount]);

  useEffect(() => {
    const nextEvm = evmAddress ?? "";
    const nextStarknet = starknetAddress ?? "";
    const { evm: prevEvm, starknet: prevStarknet } = lastSeenAddresses.current;

    if (prevEvm === nextEvm && prevStarknet === nextStarknet) return;

    lastSeenAddresses.current = { evm: nextEvm, starknet: nextStarknet };

    if (!nextEvm && !nextStarknet) return;

    resetTotals(expectedProtocolCount);
  }, [evmAddress, starknetAddress, expectedProtocolCount, resetTotals]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        {/* Compact header: title + metrics + network filter on one line (desktop) */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Title + Metrics */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <h1 className="text-lg font-bold text-base-content tracking-tight uppercase">Positions</h1>
            <div className="hidden sm:block w-px h-6 bg-base-content/10" />
            <DashboardMetrics
              netWorth={totalNet}
              totalSupply={totalSupplied}
              totalDebt={totalBorrowed}
              isLoading={!allLoaded}
            />
          </div>

          {/* Right: Network Switcher */}
          <NetworkFilter
            networks={networkOptions}
            defaultNetwork={initialNetwork}
            onNetworkChange={handleNetworkChange}
          />
          
          {/* Mobile metrics (below network filter) */}
          <div className="sm:hidden">
            <DashboardMetrics
              netWorth={totalNet}
              totalSupply={totalSupplied}
              totalDebt={totalBorrowed}
              isLoading={!allLoaded}
            />
          </div>
        </div>

        {/* Subtle warning */}
        {warnings[selectedNetwork as keyof typeof warnings] && (
          <p className="text-[10px] uppercase tracking-wider text-base-content/30 border-l border-base-content/10 pl-3">
            {warnings[selectedNetwork as keyof typeof warnings]}
          </p>
        )}

        {/* Protocols */}
        <div className="space-y-3">
          {/* ---- Network panes: only render the active selection ---- */}
          {/* ETHEREUM MAINNET */}
          {selectedNetwork === "ethereum" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={mainnet.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <MorphoProtocolView chainId={mainnet.id} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <SparkProtocolView chainId={mainnet.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <ZeroLendProtocolView chainId={mainnet.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={mainnet.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* ARBITRUM */}
          {selectedNetwork === "arbitrum" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <MorphoProtocolView chainId={arbitrum.id} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <VenusProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* BASE */}
          {selectedNetwork === "base" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <MorphoProtocolView chainId={base.id} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <ZeroLendProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
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
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <MorphoProtocolView chainId={hardhat.id} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* STARKNET */}
          {selectedNetwork === "starknet" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <VesuProtocolView />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <NostraProtocolView />
              </StableArea>
            </div>
          )}

          {/* OPTIMISM */}
          {selectedNetwork === "optimism" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={optimism.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <MorphoProtocolView chainId={optimism.id} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={optimism.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* LINEA */}
          {selectedNetwork === "linea" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={linea.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <ZeroLendProtocolView chainId={linea.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <CompoundProtocolView chainId={linea.id} enabledFeatures={{ swap: true, move: true }} />
              </StableArea>
            </div>
          )}

          {/* PLASMA */}
          {selectedNetwork === "plasma" && (
            <div className="space-y-3">
              <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
                <AaveProtocolView chainId={plasma.id} enabledFeatures={{ swap: true, move: false }} />
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
