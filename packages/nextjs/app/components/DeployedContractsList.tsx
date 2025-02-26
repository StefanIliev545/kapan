"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { useAllContracts } from "~~/utils/scaffold-eth/contractsData";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { GenericContract } from "~~/utils/scaffold-eth/contract";

export const DeployedContractsList = () => {
  const contractsData = useAllContracts();
  const { targetNetwork } = useTargetNetwork();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Don't render anything on the server
  if (!isMounted) {
    return <div className="py-8 text-center">Loading deployed contracts...</div>;
  }

  if (Object.keys(contractsData).length === 0) {
    return (
      <div className="text-center py-5">
        <p>No contracts deployed on the current network ({targetNetwork.name}).</p>
      </div>
    );
  }

  return (
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
          {Object.entries(contractsData).map(([contractName, contractData]) => (
            <tr key={contractName}>
              <td className="font-medium">{contractName}</td>
              <td>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs truncate max-w-[150px] md:max-w-[200px] lg:max-w-[300px]">
                    {(contractData as GenericContract).address}
                  </span>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      navigator.clipboard.writeText((contractData as GenericContract).address);
                    }}
                  >
                    📋
                  </button>
                </div>
              </td>
              <td>{targetNetwork.name}</td>
              <td>
                <Link
                  href={`${targetNetwork.blockExplorers?.default.url}/address/${(contractData as GenericContract).address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-xs btn-primary"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-1" />
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 