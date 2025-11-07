"use client";

import { useEffect, useMemo, useState, startTransition } from "react";
import Image from "next/image";
import type { NextPage } from "next";
import dynamic from "next/dynamic";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import CallToAction, { CallToActionSectionProps } from "~~/components/common/CallToAction";
import StableArea from "~~/components/common/StableArea";
import { ProtocolSkeleton } from "~~/components/common/ProtocolSkeleton";
import { arbitrum, base, optimism } from "wagmi/chains";

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

// Network options (memo for referential stability)
const networkOptions: NetworkOption[] = [
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
];

const App: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("starknet");

  // Keep a cache of networks the user has visited so we keep their trees mounted
  const [mounted, setMounted] = useState<Set<string>>(new Set(["starknet"]));
  useEffect(() => {
    setMounted(prev => {
      if (prev.has(selectedNetwork)) return prev;
      const next = new Set(prev);
      next.add(selectedNetwork);
      return next;
    });
  }, [selectedNetwork]);

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
          defaultNetwork="starknet"
          onNetworkChange={handleNetworkChange}
        />

        {/* Small, non-blocking warning */}
        {warnings[selectedNetwork as keyof typeof warnings] && (
          <div className="my-4 text-sm text-warning text-center">
            {warnings[selectedNetwork as keyof typeof warnings]}
          </div>
        )}

        {/* ---- Cached panes: once mounted, never unmount; just hide/show ---- */}
        {/* ARBITRUM */}
        {mounted.has("arbitrum") && (
          <div className={selectedNetwork === "arbitrum" ? "space-y-6" : "space-y-6 hidden"} aria-hidden={selectedNetwork !== "arbitrum"}>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={arbitrum.id} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={arbitrum.id} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VenusProtocolView chainId={arbitrum.id} />
            </StableArea>
          </div>
        )}

        {/* BASE */}
        {mounted.has("base") && (
          <div className={selectedNetwork === "base" ? "space-y-6" : "space-y-6 hidden"} aria-hidden={selectedNetwork !== "base"}>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={base.id} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={base.id} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VenusProtocolView chainId={base.id} />
            </StableArea>
          </div>
        )}

        {/* STARKNET */}
        {mounted.has("starknet") && (
          <div className={selectedNetwork === "starknet" ? "space-y-6" : "space-y-6 hidden"} aria-hidden={selectedNetwork !== "starknet"}>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VesuProtocolView />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <NostraProtocolView />
            </StableArea>
          </div>
        )}

        {/* OPTIMISM */}
        {mounted.has("optimism") && (
          <div className={selectedNetwork === "optimism" ? "space-y-6" : "space-y-6 hidden"} aria-hidden={selectedNetwork !== "optimism"}>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <AaveProtocolView chainId={optimism.id} />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <CompoundProtocolView chainId={optimism.id} />
            </StableArea>
          </div>
        )}

        <CallToAction sections={sections} />
      </div>
    </div>
  );
};

export default App;
