"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { ListBulletIcon, MagnifyingGlassIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import Spinner from "~~/components/common/Spinner";
import { LendingSidebar } from "~~/components/LendingSidebar";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { MarketsGrouped } from "~~/components/markets/MarketsGrouped";
import { ContractResponse, POOL_IDS } from "~~/components/specific/vesu/VesuMarkets";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";

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
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
];

const MarketsPage: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("starknet");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<"token" | "protocol">("token");

  const poolId = POOL_IDS["Genesis"];

  const { data: supportedAssets } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [poolId],
    refetchInterval: 0,
  });

  return (
    <div className="container mx-auto px-5 flex">
      <div className="hidden lg:block">
        <LendingSidebar />
      </div>
      <div className="flex-1">
        <div className="flex items-center mb-4">
          {groupMode === "protocol" && (
            <NetworkFilter networks={networkOptions} defaultNetwork="starknet" onNetworkChange={setSelectedNetwork} />
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
          <MarketsGrouped search={search} />
        ) : (
          <>
            {selectedNetwork === "arbitrum" && (
              <>
                <AaveMarkets viewMode={viewMode} search={search} />
                <CompoundMarkets viewMode={viewMode} search={search} />
                <VenusMarkets viewMode={viewMode} search={search} />
              </>
            )}
            {selectedNetwork === "starknet" && (
              <>
                <VesuMarkets
                  supportedAssets={supportedAssets as ContractResponse | undefined}
                  viewMode={viewMode}
                  search={search}
                />
                <NostraMarkets viewMode={viewMode} search={search} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MarketsPage;
