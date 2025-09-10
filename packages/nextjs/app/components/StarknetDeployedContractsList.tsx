"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import contracts, { SNContract } from "~~/contracts/snfoundry/deployedContracts";

export const StarknetDeployedContractsList = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="py-8 text-center">Loading deployed contracts...</div>;
  }

  const networkKey = Object.keys(contracts)[0] as keyof typeof contracts;
  const contractsData = contracts[networkKey];

  if (!contractsData || Object.keys(contractsData).length === 0) {
    return (
      <div className="text-center py-5">
        <p>No contracts deployed on the current network (Starknet).</p>
      </div>
    );
  }

  const explorerBaseUrl = "https://voyager.online/contract";

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
          {(Object.entries(contractsData) as [string, SNContract][]).map(([contractName, contractData]) => (
            <tr key={contractName}>
              <td className="font-medium">{contractName}</td>
              <td>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs truncate max-w-[150px] md:max-w-[200px] lg:max-w-[300px]">
                    {contractData.address}
                  </span>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(contractData.address);
                    }}
                  >
                    📋
                  </button>
                </div>
              </td>
              <td>Starknet</td>
              <td>
                <Link
                  href={`${explorerBaseUrl}/${contractData.address}`}
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

export default StarknetDeployedContractsList;

