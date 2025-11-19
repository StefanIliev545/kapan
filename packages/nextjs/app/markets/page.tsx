"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { ListBulletIcon, MagnifyingGlassIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Spinner from "~~/components/common/Spinner";
import { LendingSidebar } from "~~/components/LendingSidebar";
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

const MarketsPage: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("base");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<"token" | "protocol">("token");

  const [mountedNetworks, setMountedNetworks] = useState<Set<string>>(() => new Set(["base"]));

  const handleNetworkChange = useCallback((networkId: string) => {
    startTransition(() => setSelectedNetwork(networkId));
  }, []);

  useEffect(() => {
    setMountedNetworks(prev => {
      if (prev.has(selectedNetwork)) return prev;
      const next = new Set(prev);
      next.add(selectedNetwork);
      return next;
    });
  }, [selectedNetwork]);

  const poolId = VESU_V1_POOLS["Genesis"];

  const { data: supportedAssets } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });

  return (
    <div className="container mx-auto flex flex-col gap-6 px-5 lg:flex-row lg:gap-10 min-h-[calc(100vh-6rem)] py-6">
      <div className="hidden lg:block lg:flex-shrink-0">
        <StableArea minHeight="32rem" className="sticky top-[4.5rem]">
          <LendingSidebar />
        </StableArea>
      </div>
      <div className="flex-1 space-y-6">
        <div className="flex items-center mb-4">
          {groupMode === "protocol" && (
            <NetworkFilter
              networks={networkOptions}
              defaultNetwork={selectedNetwork}
              onNetworkChange={handleNetworkChange}
            />
          )}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-base-content/50" />
              <input
                type="text"
                placeholder="Search"
                className="input input-bordered w-full rounded-full pl-10"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {groupMode === "protocol" && (
              <div className="join">
                <button
                  className={`btn btn-xs join-item ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                >
                  <ListBulletIcon className="h-4 w-4" />
                </button>
                <button
                  className={`btn btn-xs join-item ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                >
                  <Squares2X2Icon className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="join">
              <button
                className={`btn btn-xs join-item ${groupMode === "token" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setGroupMode("token")}
              >
                Token
              </button>
              <button
                className={`btn btn-xs join-item ${groupMode === "protocol" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setGroupMode("protocol")}
              >
                Protocol
              </button>
            </div>
          </div>
        </div>
        {groupMode === "token" ? (
          <StableArea as="section" minHeight="32rem" innerClassName="h-full">
            <MarketsGrouped search={search} />
          </StableArea>
        ) : (
          <div className="space-y-6">
            {networkOptions.map(option => {
              if (!mountedNetworks.has(option.id)) return null;

              const isActive = selectedNetwork === option.id;
              const protocols = networkProtocolMap[option.id] ?? [];

              if (protocols.length === 0) return null;

              return (
                <div
                  key={option.id}
                  className={isActive ? "space-y-6" : "space-y-6 hidden"}
                  aria-hidden={isActive ? undefined : true}
                >
                  {protocols.map(protocol => {
                    const key: ProtocolKey = protocol.key;

                    if (key === "aave" && "chainId" in protocol) {
                      return (
                        <StableArea
                          key={`${option.id}-aave`}
                          as="section"
                          minHeight="30rem"
                          className="block"
                          innerClassName="h-full"
                        >
                          <AaveMarkets viewMode={viewMode} search={search} chainId={protocol.chainId} />
                        </StableArea>
                      );
                    }

                    if (key === "compound" && "chainId" in protocol) {
                      return (
                        <StableArea
                          key={`${option.id}-compound`}
                          as="section"
                          minHeight="30rem"
                          className="block"
                          innerClassName="h-full"
                        >
                          <CompoundMarkets viewMode={viewMode} search={search} chainId={protocol.chainId} />
                        </StableArea>
                      );
                    }

                    if (key === "venus" && "chainId" in protocol) {
                      return (
                        <StableArea
                          key={`${option.id}-venus`}
                          as="section"
                          minHeight="30rem"
                          className="block"
                          innerClassName="h-full"
                        >
                          <VenusMarkets viewMode={viewMode} search={search} chainId={protocol.chainId} />
                        </StableArea>
                      );
                    }

                    if (key === "vesu") {
                      return (
                        <StableArea
                          key={`${option.id}-vesu`}
                          as="section"
                          minHeight="30rem"
                          className="block"
                          innerClassName="h-full"
                        >
                          <VesuMarkets
                            supportedAssets={supportedAssets as ContractResponse | undefined}
                            viewMode={viewMode}
                            search={search}
                          />
                        </StableArea>
                      );
                    }

                    if (key === "nostra") {
                      return (
                        <StableArea
                          key={`${option.id}-nostra`}
                          as="section"
                          minHeight="30rem"
                          className="block"
                          innerClassName="h-full"
                        >
                          <NostraMarkets viewMode={viewMode} search={search} />
                        </StableArea>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketsPage;
