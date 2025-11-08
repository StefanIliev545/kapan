"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import starknetContractsData, {
  type SNContract,
  type SNContractsType,
} from "~~/contracts/snfoundry/deployedContracts";
import { useAllContracts } from "~~/utils/scaffold-eth/contractsData";
import { useTargetNetwork as useEvmTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useTargetNetwork as useStarknetTargetNetwork } from "~~/hooks/scaffold-stark/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-stark";
import { GenericContract } from "~~/utils/scaffold-eth/contract";
import { getTargetNetworks } from "~~/utils/scaffold-eth";
import { useGlobalState } from "~~/services/store/store";

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
    id: "base",
    name: "Base",
    logo: "/logos/base.svg",
  },
  {
    id: "optimism",
    name: "Optimism",
    logo: "/logos/optimism.svg",
  },
  {
    id: "linea",
    name: "Linea",
    logo: "/logos/linea.svg",
  },
  {
    id: "starknet",
    name: "Starknet",
    logo: "/logos/starknet.svg",
  },
];

const defaultEvmNetworkId = networkOptions[0]?.id ?? "arbitrum";

const starknetContracts: SNContractsType = starknetContractsData;

export const DeployedContractsList = () => {
  const contractsData = useAllContracts();
  const { targetNetwork: targetEvmNetwork } = useEvmTargetNetwork();
  const { targetNetwork: targetStarknetNetwork } = useStarknetTargetNetwork();
  const setTargetEvmNetwork = useGlobalState(state => state.setTargetEVMNetwork);
  const evmNetworks = useMemo(() => getTargetNetworks(), []);
  const [selectedNetwork, setSelectedNetwork] = useState<string>(() => {
    const activeNetworkId = targetEvmNetwork.network;
    return activeNetworkId && networkOptions.some(option => option.id === activeNetworkId)
      ? activeNetworkId
      : defaultEvmNetworkId;
  });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (selectedNetwork === "starknet") {
      return;
    }

    const matchingNetwork = evmNetworks.find(network => network.network === selectedNetwork);
    if (matchingNetwork && matchingNetwork.id !== targetEvmNetwork.id) {
      setTargetEvmNetwork(matchingNetwork);
    }
  }, [evmNetworks, selectedNetwork, setTargetEvmNetwork, targetEvmNetwork.id]);

  const starknetContractsForTarget = useMemo<Record<string, SNContract>>(() => {
    const networkKey = targetStarknetNetwork?.network;
    if (!networkKey) {
      return {};
    }

    const networkContracts = starknetContracts[networkKey];
    if (!networkContracts) {
      return {};
    }

    return networkContracts;
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

    if (selectedNetwork !== "starknet" && contractsToDisplay.length === 0) {
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