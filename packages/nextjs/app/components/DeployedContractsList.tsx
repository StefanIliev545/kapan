"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import starknetContracts from "~~/contracts/snfoundry/deployedContracts";
import { useAllContracts } from "~~/utils/scaffold-eth/contractsData";
import { useTargetNetwork as useEvmTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useTargetNetwork as useStarknetTargetNetwork } from "~~/hooks/scaffold-stark/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-stark";
import { GenericContract } from "~~/utils/scaffold-eth/contract";

type DisplayContract = {
  name: string;
  address: string;
  networkName: string;
  explorerUrl?: string;
};

const networkOptions: NetworkOption[] = [
  {
    id: "arbitrum",
    name: "Arbitrum",
    logo: "/logos/arb.svg",
  },
  {
    id: "starknet",
    name: "Starknet",
    logo: "/logos/starknet.svg",
  },
];

export const DeployedContractsList = () => {
  const contractsData = useAllContracts();
  const { targetNetwork: targetEvmNetwork } = useEvmTargetNetwork();
  const { targetNetwork: targetStarknetNetwork } = useStarknetTargetNetwork();
  const [selectedNetwork, setSelectedNetwork] = useState<string>(networkOptions[0]!.id);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const starknetContractsForTarget = useMemo(() => {
    if (!targetStarknetNetwork?.network) {
      return {};
    }

    return starknetContracts[targetStarknetNetwork.network] ?? {};
  }, [targetStarknetNetwork?.network]);

  const contractsToDisplay = useMemo<DisplayContract[]>(() => {
    if (selectedNetwork === "starknet") {
      return Object.entries(starknetContractsForTarget).map(([name, contract]) => ({
        name,
        address: contract.address,
        networkName: targetStarknetNetwork.name,
        explorerUrl: getBlockExplorerAddressLink(targetStarknetNetwork, contract.address),
      }));
    }

    return Object.entries(contractsData).map(([name, contract]) => {
      const address = (contract as GenericContract).address;
      const explorerBaseUrl = targetEvmNetwork.blockExplorers?.default.url;

      return {
        name,
        address,
        networkName: targetEvmNetwork.name,
        explorerUrl: explorerBaseUrl ? `${explorerBaseUrl}/address/${address}` : undefined,
      } satisfies DisplayContract;
    });
  }, [contractsData, selectedNetwork, starknetContractsForTarget, targetEvmNetwork, targetStarknetNetwork]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    if (selectedNetwork === "arbitrum" && contractsToDisplay.length === 0) {
      if (Object.keys(starknetContractsForTarget).length > 0) {
        setSelectedNetwork("starknet");
      }
    }
  }, [contractsToDisplay.length, isMounted, selectedNetwork, starknetContractsForTarget]);

  // Don't render anything on the server
  if (!isMounted) {
    return <div className="py-8 text-center">Loading deployed contracts...</div>;
  }

  const activeNetworkName = contractsToDisplay[0]?.networkName ??
    (selectedNetwork === "starknet" ? targetStarknetNetwork.name : targetEvmNetwork.name);

  if (contractsToDisplay.length === 0) {
    return (
      <div className="text-center py-5 space-y-4">
        <NetworkFilter networks={networkOptions} defaultNetwork={selectedNetwork} onNetworkChange={setSelectedNetwork} />
        <p>No contracts deployed on the current network ({activeNetworkName}).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NetworkFilter networks={networkOptions} defaultNetwork={selectedNetwork} onNetworkChange={setSelectedNetwork} />
      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Contract Name</th>
              <th>Address</th>
              <th>Network</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contractsToDisplay.map(contract => (
              <tr key={contract.name}>
                <td className="font-medium">{contract.name}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs truncate max-w-[150px] md:max-w-[200px] lg:max-w-[300px]">
                      {contract.address}
                    </span>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(contract.address);
                      }}
                    >
                      📋
                    </button>
                  </div>
                </td>
                <td>{contract.networkName}</td>
                <td>
                  {contract.explorerUrl ? (
                    <Link
                      href={contract.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs btn-primary"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-1" />
                      View
                    </Link>
                  ) : (
                    <span className="text-xs text-base-content/60">Explorer unavailable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};