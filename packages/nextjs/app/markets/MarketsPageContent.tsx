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
import { createTextChangeHandler } from "~~/utils/handlers";

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
    <div className="container mx-auto min-h-[calc(100vh-6rem)] px-5 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4">
          {/* Title & Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
              <p className="text-base-content/50 mt-0.5 text-sm">Compare rates across protocols</p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle (Protocol view only) */}
              {groupMode === "protocol" && (
                <div className="bg-base-200/50 flex rounded-lg p-0.5">
                  <button
                    className={`rounded-md p-1.5 transition-all duration-200 ${
                      viewMode === "list"
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/50 hover:text-base-content/80"
                    }`}
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                  >
                    <ListBulletIcon className="size-4" />
                  </button>
                  <button
                    className={`rounded-md p-1.5 transition-all duration-200 ${
                      viewMode === "grid"
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/50 hover:text-base-content/80"
                    }`}
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                  >
                    <Squares2X2Icon className="size-4" />
                  </button>
                </div>
              )}

              {/* Group Mode Toggle */}
              <div className="bg-base-200/50 flex rounded-lg p-0.5">
                <button
                  className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                    groupMode === "token"
                      ? "bg-base-100 text-base-content shadow-sm"
                      : "text-base-content/50 hover:text-base-content/80"
                  }`}
                  onClick={() => setGroupMode("token")}
                >
                  By Token
                </button>
                <button
                  className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                    groupMode === "protocol"
                      ? "bg-base-100 text-base-content shadow-sm"
                      : "text-base-content/50 hover:text-base-content/80"
                  }`}
                  onClick={() => setGroupMode("protocol")}
                >
                  By Protocol
                </button>
              </div>
            </div>
          </div>

          {/* Search & Network Filter Row */}
          <div className="flex items-center gap-4">
            {groupMode === "protocol" && (
              <NetworkFilter
                networks={networkOptions}
                defaultNetwork={selectedNetwork}
                onNetworkChange={handleNetworkChange}
              />
            )}
            <div className="max-w-md flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="text-base-content/40 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search tokens..."
                  className="bg-base-200/50 border-base-300/50 focus:ring-primary/30 focus:border-primary/50 placeholder:text-base-content/30 w-full rounded-xl border py-2 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2"
                  value={search}
                  onChange={createTextChangeHandler(setSearch)}
                />
              </div>
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
                  className={isActive ? "space-y-6" : "hidden space-y-6"}
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

export default MarketsPageContent;
