"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { ListBulletIcon, MagnifyingGlassIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Spinner from "~~/components/common/Spinner";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { MarketsGrouped } from "~~/components/markets/MarketsGrouped";
import { ContractResponse } from "~~/components/specific/vesu/VesuMarkets";
import { VESU_V1_POOLS } from "~~/components/specific/vesu/pools";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import StableArea from "~~/components/common/StableArea";
import { arbitrum, base, linea, optimism } from "wagmi/chains";

const MarketLoader = () => (
  <div className="flex justify-center py-10">
    <Spinner size="loading-lg" />
  </div>
);

// Lazily load large protocol specific market components to reduce the initial bundle size
const AaveMarkets = dynamic(() => import("~~/components/specific/aave/AaveMarkets"), {
  ssr: false,
  loading: () => <MarketLoader />,
});
const CompoundMarkets = dynamic(() => import("~~/components/specific/compound/CompoundMarkets"), {
  ssr: false,
  loading: () => <MarketLoader />,
});
const VenusMarkets = dynamic(() => import("~~/components/specific/venus/VenusMarkets"), {
  ssr: false,
  loading: () => <MarketLoader />,
});
const VesuMarkets = dynamic(() => import("~~/components/specific/vesu/VesuMarkets"), {
  ssr: false,
  loading: () => <MarketLoader />,
});
const NostraMarkets = dynamic(() => import("~~/components/specific/nostra/NostraMarkets"), {
  ssr: false,
  loading: () => <MarketLoader />,
});

const networkOptions: NetworkOption[] = [
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
  { id: "linea", name: "Linea", logo: "/logos/linea.svg" },
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
];

type ProtocolKey = "aave" | "compound" | "venus" | "vesu" | "nostra";

type ProtocolConfig =
  | { key: "aave" | "compound" | "venus"; chainId: number }
  | { key: "vesu" | "nostra" };

const networkProtocolMap: Record<string, ProtocolConfig[]> = {
  starknet: [
    { key: "vesu" },
    { key: "nostra" },
  ],
  arbitrum: [
    { key: "aave", chainId: arbitrum.id },
    { key: "compound", chainId: arbitrum.id },
    { key: "venus", chainId: arbitrum.id },
  ],
  base: [
    { key: "aave", chainId: base.id },
    { key: "compound", chainId: base.id },
    { key: "venus", chainId: base.id },
  ],
  optimism: [
    { key: "aave", chainId: optimism.id },
    { key: "compound", chainId: optimism.id },
  ],
  linea: [
    { key: "aave", chainId: linea.id },
    { key: "compound", chainId: linea.id },
  ],
};

const MarketsPageContent: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkOption>(networkOptions[0]);
  const [isGridView, setIsGridView] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: vesuPools } = useScaffoldReadContract<ContractResponse>({
    contractName: "VesuAggregator",
    functionName: "getAllPools",
  });

  const vesuPoolsData = vesuPools || VESU_V1_POOLS;

  const protocolConfigs = networkProtocolMap[selectedNetwork.id] || [];

  const selectedProtocols = protocolConfigs.map(config => config.key);

  const handleNetworkSelect = useCallback((network: NetworkOption) => {
    startTransition(() => setSelectedNetwork(network));
  }, []);

  const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => {
      setSearchTerm(event.target.value);
    });
  }, []);

  useEffect(() => {
    const savedNetwork = localStorage.getItem("markets_network");
    const savedView = localStorage.getItem("markets_view");

    if (savedNetwork) {
      const network = networkOptions.find(n => n.id === savedNetwork);
      if (network) setSelectedNetwork(network);
    }

    if (savedView) {
      setIsGridView(savedView === "grid");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("markets_network", selectedNetwork.id);
  }, [selectedNetwork]);

  useEffect(() => {
    localStorage.setItem("markets_view", isGridView ? "grid" : "list");
  }, [isGridView]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-base-content">Markets Overview</h1>
              <p className="text-base-content/70">
                Compare DeFi lending and borrowing markets across protocols to find the best yields and rates.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-base-content/70">Networks</p>
              <NetworkFilter options={networkOptions} selected={selectedNetwork} onSelect={handleNetworkSelect} />
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/60" />
                <input
                  type="text"
                  placeholder="Search by asset or protocol"
                  className="input input-bordered pl-10 w-full md:w-64"
                  value={searchTerm}
                  onChange={handleSearch}
                />
              </div>

              <div className="btn-group">
                <button className={`btn ${isGridView ? "btn-active" : ""}`} onClick={() => setIsGridView(true)}>
                  <Squares2X2Icon className="w-5 h-5" />
                </button>
                <button className={`btn ${!isGridView ? "btn-active" : ""}`} onClick={() => setIsGridView(false)}>
                  <ListBulletIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stable Area */}
        <StableArea isGridView={isGridView} />

        {/* Markets */}
        <div className="grid grid-cols-1 gap-6">
          {protocolConfigs.map(config => {
            if (config.key === "vesu") {
              return <VesuMarkets key={config.key} isGridView={isGridView} pools={vesuPoolsData} />;
            }

            if (config.key === "nostra") {
              return <NostraMarkets key={config.key} isGridView={isGridView} />;
            }

            const sharedProps = { isGridView, chainId: "chainId" in config ? config.chainId : undefined } as const;

            switch (config.key as ProtocolKey) {
              case "aave":
                return <AaveMarkets key={`${config.key}-${config.chainId}`} {...sharedProps} />;
              case "compound":
                return <CompoundMarkets key={`${config.key}-${config.chainId}`} {...sharedProps} />;
              case "venus":
                return <VenusMarkets key={`${config.key}-${config.chainId}`} {...sharedProps} />;
              default:
                return null;
            }
          })}

          <MarketsGrouped selectedProtocols={selectedProtocols} searchTerm={searchTerm} isGridView={isGridView} />
        </div>
      </div>
    </div>
  );
};

export default MarketsPageContent;
