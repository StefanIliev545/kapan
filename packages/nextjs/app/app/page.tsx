"use client";

import { useEffect, useMemo, useState, startTransition } from "react";
import Image from "next/image";
import type { NextPage } from "next";
import dynamic from "next/dynamic";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import CallToAction, { CallToActionSectionProps } from "~~/components/common/CallToAction";
import StableArea from "~~/components/common/StableArea";
import { ProtocolSkeleton } from "~~/components/common/ProtocolSkeleton";
import { arbitrum, base, optimism, linea } from "wagmi/chains";
import { hardhat } from "viem/chains";

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
  const [selectedNetwork, setSelectedNetwork] = useState<string>(process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true" ? "hardhat" : "base");

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

  const sections: CallToActionSectionProps[] = [
    {
      title: "⭐ Support on X",
      description: "We're building with real purpose — your follow helps us reach more builders!",
      buttonText: "Follow @KapanFinance",
      buttonLink: "https://x.com/KapanFinance",
    },
    {
      title: "🌱 Fund via Giveth",
      description: "We strive to provide everything for free, but we need your help to keep going!",
      buttonText: "Support on Giveth",
      buttonLink: "https://giveth.io/project/kapan-finance-defi-lending-management-protocol",
    },
    {
      title: "Join Our Community",
      description: "Connect with developers and users in our Discord server",
      buttonText: "Join Discord",
      buttonLink: "https://discord.gg/Vjk6NhkxGv",
      emoji: "💬 ",
      icon: (
        <div className="w-5 h-5 relative">
          <Image src="/logos/discord.svg" alt="Discord" fill className="object-contain" />
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto flex flex-col gap-6 p-0 min-h-[calc(100vh-6rem)] py-6">
      <div className="flex-1 space-y-6">
        <NetworkFilter
          networks={networkOptions}
          defaultNetwork="base"
          onNetworkChange={handleNetworkChange}
        />

        {/* Small, non-blocking warning */}
        {warnings[selectedNetwork as keyof typeof warnings] && (
          <div className="my-4 text-sm text-warning text-center">
            {warnings[selectedNetwork as keyof typeof warnings]}
          </div>
        )}

        {/* ---- Network panes: only render the active selection ---- */}
        {/* ARBITRUM */}
        {selectedNetwork === "arbitrum" && (
          <div className="space-y-4">
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VenusProtocolView chainId={arbitrum.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
          </div>
        )}

        {/* BASE */}
        {selectedNetwork === "base" && (
          <div className="space-y-4">
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <ZeroLendProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VenusProtocolView chainId={base.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
          </div>
        )}

        {/* HARDHAT (conditionally enabled via NEXT_PUBLIC_ENABLE_HARDHAT_UI) */}
        {process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true" && selectedNetwork === "hardhat" && (
          <div className="space-y-4">
            <div className="my-2 text-warning text-sm text-center">
              Local Hardhat network is for development only. Ensure your node is running on 127.0.0.1:8545.
            </div>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VenusProtocolView chainId={hardhat.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
          </div>
        )}

        {/* STARKNET */}
        {selectedNetwork === "starknet" && (
          <div className="space-y-4">
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VesuProtocolView />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <NostraProtocolView />
            </StableArea>
          </div>
        )}

        {/* OPTIMISM */}
        {selectedNetwork === "optimism" && (
          <div className="space-y-4">
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={optimism.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={optimism.id} enabledFeatures={{ swap: true, move: true }} />
            </StableArea>
          </div>
        )}

        {/* LINEA */}
        {selectedNetwork === "linea" && (
          <div className="space-y-4">
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



        <CallToAction sections={sections} />
      </div>
    </div>
  );
};

export default App;
