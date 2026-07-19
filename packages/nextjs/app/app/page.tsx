"use client";

import { type ReactNode, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { NextPage } from "next";
import { hardhat } from "viem/chains";
import { useAccount as useEvmAccount } from "wagmi";
import { arbitrum, base, linea, mainnet, optimism, plasma, unichain } from "wagmi/chains";
import { NetworkFilter, type NetworkOption } from "~~/components/NetworkFilter";
import { ProtocolSkeleton } from "~~/components/common/ProtocolSkeleton";
import StableArea from "~~/components/common/StableArea";
import { SupportBanner } from "~~/components/common/SupportBanner";
import { DashboardMetrics } from "~~/components/dashboard/DashboardMetrics";
import { DashboardLayout } from "~~/components/layouts/DashboardLayout";
import { useAccount as useStarknetAccount } from "~~/hooks/useAccount";
import { useGlobalState } from "~~/services/store/store";

const AaveProtocolView = dynamic(
  () => import("~~/components/specific/aave/AaveProtocolView").then(module => module.AaveProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Aave" /> },
);
const CompoundProtocolView = dynamic(
  () => import("~~/components/specific/compound/CompoundProtocolView").then(module => module.CompoundProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Compound" /> },
);
const VenusProtocolView = dynamic(
  () => import("~~/components/specific/venus/VenusProtocolView").then(module => module.VenusProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Venus" /> },
);
const VesuProtocolView = dynamic(
  () => import("~~/components/specific/vesu/VesuProtocolView").then(module => module.VesuProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Vesu" /> },
);
const NostraProtocolView = dynamic(
  () => import("~~/components/specific/nostra/NostraProtocolView").then(module => module.NostraProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Nostra" /> },
);
const MorphoProtocolView = dynamic(
  () => import("~~/components/specific/morpho/MorphoProtocolView").then(module => module.MorphoProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Morpho" /> },
);
const SparkProtocolView = dynamic(
  () => import("~~/components/specific/spark/SparkProtocolView").then(module => module.SparkProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Spark" /> },
);
const EulerProtocolView = dynamic(
  () => import("~~/components/specific/euler/EulerProtocolView").then(module => module.EulerProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Euler" /> },
);
const AlchemixProtocolView = dynamic(
  () => import("~~/components/specific/alchemix/AlchemixProtocolView").then(module => module.AlchemixProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Alchemix" /> },
);
const UniswapProtocolView = dynamic(
  () => import("~~/components/specific/uniswap/UniswapProtocolView").then(module => module.UniswapProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Uniswap" /> },
);
const AerodromeProtocolView = dynamic(
  () => import("~~/components/specific/aerodrome/AerodromeProtocolView").then(module => module.AerodromeProtocolView),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading Aerodrome" /> },
);
const WalletSection = dynamic(
  () => import("~~/components/specific/wallet/WalletSection").then(module => module.WalletSection),
  { ssr: false, loading: () => <ProtocolSkeleton ariaLabel="Loading wallet" /> },
);

const ENABLED_FEATURES_SWAP_AND_MOVE = { swap: true, move: true } as const;
const ENABLED_FEATURES_SWAP_ONLY = { swap: true, move: false } as const;

type ProtocolDefinition = { id: string; render: (chainId: number) => ReactNode };
type EvmNetworkDefinition = { chainId: number; protocols: ProtocolDefinition[]; warning?: string };

const protocolViews = {
  aave: (chainId: number) => <AaveProtocolView chainId={chainId} enabledFeatures={ENABLED_FEATURES_SWAP_AND_MOVE} />,
  aaveSwapOnly: (chainId: number) => (
    <AaveProtocolView chainId={chainId} enabledFeatures={ENABLED_FEATURES_SWAP_ONLY} />
  ),
  alchemix: (chainId: number) => <AlchemixProtocolView chainId={chainId} />,
  aerodrome: (chainId: number) => <AerodromeProtocolView chainId={chainId} />,
  compound: (chainId: number) => (
    <CompoundProtocolView chainId={chainId} enabledFeatures={ENABLED_FEATURES_SWAP_AND_MOVE} />
  ),
  euler: (chainId: number) => <EulerProtocolView chainId={chainId} />,
  morpho: (chainId: number) => <MorphoProtocolView chainId={chainId} />,
  spark: (chainId: number) => <SparkProtocolView chainId={chainId} enabledFeatures={ENABLED_FEATURES_SWAP_AND_MOVE} />,
  uniswap: (chainId: number) => <UniswapProtocolView chainId={chainId} />,
  venus: (chainId: number) => <VenusProtocolView chainId={chainId} enabledFeatures={ENABLED_FEATURES_SWAP_AND_MOVE} />,
};

const protocols = (...ids: (keyof typeof protocolViews)[]): ProtocolDefinition[] =>
  ids.map(id => ({ id, render: protocolViews[id] }));

const evmNetworks: Record<string, EvmNetworkDefinition> = {
  ethereum: {
    chainId: mainnet.id,
    warning: "Ethereum mainnet support is experimental and pre-audit.",
    protocols: protocols("aave", "morpho", "spark", "euler", "compound", "uniswap"),
  },
  arbitrum: {
    chainId: arbitrum.id,
    warning: "Arbitrum support is experimental and pre-audit.",
    protocols: protocols("aave", "morpho", "euler", "alchemix", "compound", "venus", "uniswap"),
  },
  base: {
    chainId: base.id,
    warning: "Base support is experimental and pre-audit.",
    protocols: protocols("morpho", "aave", "euler", "compound", "venus", "uniswap", "aerodrome"),
  },
  hardhat: { chainId: hardhat.id, protocols: protocols("aave", "morpho", "euler", "compound") },
  optimism: {
    chainId: optimism.id,
    warning: "Optimism support is experimental and pre-audit.",
    protocols: protocols("aave", "morpho", "euler", "compound", "uniswap", "aerodrome"),
  },
  linea: {
    chainId: linea.id,
    warning: "Linea support is experimental and pre-audit.",
    protocols: protocols("aave", "euler", "compound"),
  },
  plasma: { chainId: plasma.id, protocols: protocols("aaveSwapOnly", "euler") },
  unichain: {
    chainId: unichain.id,
    warning: "Unichain support is experimental and pre-audit.",
    protocols: protocols("morpho", "euler", "compound", "venus", "uniswap"),
  },
};

const networkOptions: NetworkOption[] = [
  { id: "ethereum", name: "Ethereum", logo: "/logos/ethereum.svg" },
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "unichain", name: "Unichain", logo: "/logos/unichain.svg" },
  { id: "plasma", name: "Plasma", logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
  { id: "linea", name: "Linea", logo: "/logos/linea.svg" },
  ...(process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true"
    ? [{ id: "hardhat", name: "Hardhat", logo: "/logos/ethereum.svg" }]
    : []),
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
];

const ProtocolSlot = ({ children }: { children: ReactNode }) => (
  <StableArea as="section" minHeight="4rem" className="block" innerClassName="h-full">
    {children}
  </StableArea>
);

const EvmNetworkPane = ({ network }: { network: EvmNetworkDefinition }) => (
  <div className="space-y-2 sm:space-y-3">
    <ProtocolSlot>
      <WalletSection chainId={network.chainId} />
    </ProtocolSlot>
    {network.protocols.map(protocol => (
      <ProtocolSlot key={protocol.id}>{protocol.render(network.chainId)}</ProtocolSlot>
    ))}
  </div>
);

const StarknetNetworkPane = () => (
  <div className="space-y-2 sm:space-y-3">
    <ProtocolSlot>
      <VesuProtocolView />
    </ProtocolSlot>
    <ProtocolSlot>
      <NostraProtocolView />
    </ProtocolSlot>
  </div>
);

const App: NextPage = () => {
  const initialNetwork = process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true" ? "hardhat" : "base";
  const [selectedNetwork, setSelectedNetwork] = useState(initialNetwork);
  const totalSupplied = useGlobalState(state => state.totalSupplied);
  const totalBorrowed = useGlobalState(state => state.totalBorrowed);
  const totalNet = useGlobalState(state => state.totalNet);
  const resetTotals = useGlobalState(state => state.resetTotals);
  const loadedProtocolCount = useGlobalState(state => state.loadedProtocolCount);
  const { address: evmAddress } = useEvmAccount();
  const { viewingAddress: starknetAddress } = useStarknetAccount();
  const lastSeenAddresses = useRef<{ evm?: string; starknet?: string }>({});
  const selectedEvmNetwork = evmNetworks[selectedNetwork];
  const expectedProtocolCount = useMemo(
    () => (selectedNetwork === "starknet" ? 2 : selectedEvmNetwork ? selectedEvmNetwork.protocols.length + 1 : 0),
    [selectedEvmNetwork, selectedNetwork],
  );

  const handleNetworkChange = useCallback((id: string) => {
    startTransition(() => setSelectedNetwork(id));
  }, []);

  useEffect(() => {
    resetTotals(expectedProtocolCount);
  }, [expectedProtocolCount, resetTotals, selectedNetwork]);

  useEffect(() => {
    const nextEvm = evmAddress ?? "";
    const nextStarknet = starknetAddress ?? "";
    const previous = lastSeenAddresses.current;
    if (previous.evm === nextEvm && previous.starknet === nextStarknet) return;

    lastSeenAddresses.current = { evm: nextEvm, starknet: nextStarknet };
    if (nextEvm || nextStarknet) resetTotals(expectedProtocolCount);
  }, [evmAddress, expectedProtocolCount, resetTotals, starknetAddress]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-3 px-4 sm:px-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <h1 className="text-base-content text-lg font-bold uppercase tracking-tight">Positions</h1>
            <div className="bg-base-content/10 hidden h-6 w-px sm:block" />
            <div className="hidden sm:block">
              <DashboardMetrics
                netWorth={totalNet}
                totalSupply={totalSupplied}
                totalDebt={totalBorrowed}
                isLoading={loadedProtocolCount === 0}
                loadedSources={loadedProtocolCount}
                expectedSources={expectedProtocolCount}
              />
            </div>
          </div>
          <NetworkFilter
            networks={networkOptions}
            value={selectedNetwork}
            defaultNetwork={initialNetwork}
            onNetworkChange={handleNetworkChange}
          />
          <div className="sm:hidden">
            <DashboardMetrics
              netWorth={totalNet}
              totalSupply={totalSupplied}
              totalDebt={totalBorrowed}
              isLoading={loadedProtocolCount === 0}
              loadedSources={loadedProtocolCount}
              expectedSources={expectedProtocolCount}
            />
          </div>
        </header>

        {selectedEvmNetwork?.warning && (
          <p className="text-base-content/30 border-base-content/10 border-l px-4 pl-3 text-[10px] uppercase tracking-wider sm:px-0">
            {selectedEvmNetwork.warning}
          </p>
        )}

        {selectedNetwork === "hardhat" && (
          <div className="alert alert-warning text-sm">
            Local Hardhat network is for development only. Ensure your node is running on 127.0.0.1:8545.
          </div>
        )}

        {selectedNetwork === "starknet" ? (
          <StarknetNetworkPane />
        ) : selectedEvmNetwork ? (
          <EvmNetworkPane network={selectedEvmNetwork} />
        ) : null}
        <div className="mt-12">
          <SupportBanner />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default App;
