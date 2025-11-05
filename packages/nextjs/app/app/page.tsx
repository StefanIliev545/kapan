"use client";

import { useState } from "react";
import Image from "next/image";
import type { NextPage } from "next";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import CallToAction, { CallToActionSectionProps } from "~~/components/common/CallToAction";
import StableArea from "~~/components/common/StableArea";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";
import { VenusProtocolView } from "~~/components/specific/venus/VenusProtocolView";
import { arbitrum, base } from "wagmi/chains";
import { VesuProtocolView } from "~~/components/specific/vesu/VesuProtocolView";
import { NostraProtocolView } from "~~/components/specific/nostra/NostraProtocolView";
// Define network options
const networkOptions: NetworkOption[] = [
  {
    id: "starknet",
    name: "Starknet",
    logo: "/logos/starknet.svg",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    logo: "/logos/arb.svg",
  },
  {
    id: "base",
    name: "Base",
    logo: "/logos/base.svg",
  },
];

// Custom icon for demonstration purposes
const DiscordIcon = () => (
  <div className="w-5 h-5 relative">
    <Image
      src="/logos/discord.svg"
      alt="Discord"
      fill
      className="object-contain"
    />
  </div>
);

const App: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("starknet");

  // Example of customizing the CallToAction component
  const customSections: CallToActionSectionProps[] = [
    {
      title: "⭐ Support on X",
      description: "We're building with real purpose — your follow helps us reach more builders!",
      buttonText: "Follow @KapanFinance",
      buttonLink: "https://x.com/KapanFinance",
      // Using the default TwitterIcon from the component
    },
    {
      title: "🌱 Fund via Giveth",
      description: "We strive to provide everything for free, but we need your help to keep going!",
      buttonText: "Support on Giveth",
      buttonLink: "https://giveth.io/project/kapan-finance-defi-lending-management-protocol",
      // Using the default GitcoinIcon from the component
    },
    {
      title: "Join Our Community",
      description: "Connect with developers and users in our Discord server",
      buttonText: "Join Discord",
      buttonLink: "https://discord.gg/Vjk6NhkxGv",
      emoji: "💬 ",
      icon: <DiscordIcon />,
    },
  ];

  return (
    <div className="container mx-auto flex flex-col gap-6 p-0 min-h-[calc(100vh-6rem)] py-6">
      <div className="flex-1 space-y-6">
        <NetworkFilter networks={networkOptions} defaultNetwork="starknet" onNetworkChange={setSelectedNetwork} />

        {selectedNetwork === "arbitrum" && (
          <div className="my-4 text-sm text-warning text-center">
            Arbitrum support is experimental and pre-audit.
          </div>
        )}
        {selectedNetwork === "base" && (
          <div className="my-4 text-sm text-warning text-center">
            Base support is experimental and pre-audit.
          </div>
        )}

        {/* Protocol Views */}
        {selectedNetwork === "arbitrum" && (
          <div className="space-y-6">
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
        {selectedNetwork === "base" && (
          <div className="space-y-6">
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
        {selectedNetwork === "starknet" && (
          <div className="space-y-6">
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <VesuProtocolView />
            </StableArea>
            <StableArea as="section" minHeight="28rem" className="block" innerClassName="h-full">
              <NostraProtocolView />
            </StableArea>
          </div>
        )}
        {/* Custom Call to Action with additional section */}
        <CallToAction sections={customSections} />
      </div>
    </div>
  );
};

export default App;
