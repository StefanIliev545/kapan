"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { ListBulletIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { AaveMarkets } from "~~/components/specific/aave/AaveMarkets";
import { NostraMarkets } from "~~/components/specific/nostra/NostraMarkets";
import { VenusMarkets } from "~~/components/specific/venus/VenusMarkets";
import { VesuMarkets, POOL_IDS, ContractResponse } from "~~/components/specific/vesu/VesuMarkets";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";

const networkOptions: NetworkOption[] = [
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
];

const MarketsPage: NextPage = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("starknet");
  const [selectedPoolId, setSelectedPoolId] = useState<bigint>(POOL_IDS["Genesis"]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [search, setSearch] = useState("");

  const { data: supportedAssets } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [selectedPoolId],
    refetchInterval: 0,
  });

  return (
    <div className="container mx-auto px-5">
      <div className="flex items-center justify-between mb-4">
        <NetworkFilter networks={networkOptions} defaultNetwork="starknet" onNetworkChange={setSelectedNetwork} />
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search"
            className="input input-bordered input-xs w-28"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
        </div>
      </div>
      {selectedNetwork === "arbitrum" && (
        <>
          <AaveMarkets viewMode={viewMode} search={search} />
          <VenusMarkets viewMode={viewMode} search={search} />
        </>
      )}
      {selectedNetwork === "starknet" && (
        <>
          <VesuMarkets
            selectedPoolId={selectedPoolId}
            onPoolChange={setSelectedPoolId}
            supportedAssets={supportedAssets as ContractResponse | undefined}
            viewMode={viewMode}
            search={search}
          />
          <NostraMarkets viewMode={viewMode} search={search} />
        </>
      )}
    </div>
  );
};

export default MarketsPage;
