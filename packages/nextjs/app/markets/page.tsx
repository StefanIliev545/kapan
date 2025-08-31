"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { ListBulletIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { LendingSidebar } from "~~/components/LendingSidebar";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { MarketsGrouped } from "~~/components/markets/MarketsGrouped";
import { AaveMarkets } from "~~/components/specific/aave/AaveMarkets";
import { CompoundMarkets } from "~~/components/specific/compound/CompoundMarkets";
import { NostraMarkets } from "~~/components/specific/nostra/NostraMarkets";
import { VenusMarkets } from "~~/components/specific/venus/VenusMarkets";
import { ContractResponse, POOL_IDS, VesuMarkets } from "~~/components/specific/vesu/VesuMarkets";
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
  const [groupMode, setGroupMode] = useState<"token" | "protocol">("token");

  const { data: supportedAssets } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [selectedPoolId],
    refetchInterval: 0,
  });

  return (
    <div className="container mx-auto px-5 flex">
      <LendingSidebar />
      <div className="flex-1">
        {(() => {
          const groupButtons = (
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
          );

          return (
            <div
              className={`mb-4 ${
                groupMode === "protocol" ? "flex items-center justify-between" : "flex flex-col items-center gap-4"
              }`}
            >
              {groupMode === "protocol" && (
                <NetworkFilter
                  networks={networkOptions}
                  defaultNetwork="starknet"
                  onNetworkChange={setSelectedNetwork}
                />
              )}
              <div
                className={`flex items-center gap-2 ${
                  groupMode === "token" ? "w-full justify-center" : ""
                }`}
              >
                <input
                  type="text"
                  placeholder="Search"
                  className={`input input-bordered ${
                    groupMode === "protocol" ? "input-xs w-28" : "input-md w-full max-w-md text-center"
                  }`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
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
                {groupMode === "protocol" && groupButtons}
              </div>
              {groupMode === "token" && groupButtons}
            </div>
          );
        })()}
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
                  selectedPoolId={selectedPoolId}
                  onPoolChange={setSelectedPoolId}
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
