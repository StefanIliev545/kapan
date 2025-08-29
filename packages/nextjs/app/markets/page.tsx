"use client";

import { useState } from "react";
import type { NextPage } from "next";
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

  const { data: supportedAssets } = useScaffoldReadContract({
    contractName: "VesuGateway",
    functionName: "get_supported_assets_ui",
    args: [selectedPoolId],
    refetchInterval: 0,
  });

  return (
    <div className="container mx-auto px-5">
      <NetworkFilter networks={networkOptions} defaultNetwork="starknet" onNetworkChange={setSelectedNetwork} />
      {selectedNetwork === "arbitrum" && (
        <>
          <AaveMarkets />
          <VenusMarkets />
        </>
      )}
      {selectedNetwork === "starknet" && (
        <>
          <VesuMarkets
            selectedPoolId={selectedPoolId}
            onPoolChange={setSelectedPoolId}
            supportedAssets={supportedAssets as ContractResponse | undefined}
          />
          <NostraMarkets />
        </>
      )}
    </div>
  );
};

export default MarketsPage;
