"use client";

// @refresh reset
import { useReducer } from "react";
import { ContractReadMethods } from "./ContractReadMethods";
import { ContractVariables } from "./ContractVariables";
import { ContractWriteMethods } from "./ContractWriteMethods";
import { Address, Balance } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { ContractName } from "~~/utils/scaffold-eth/contract";

type ContractUIProps = {
  contractName: ContractName;
  className?: string;
};

/**
 * UI component to interface with deployed contracts.
 **/
export const ContractUI = ({ contractName, className = "" }: ContractUIProps) => {
  const [refreshDisplayVariables, triggerRefreshDisplayVariables] = useReducer(value => !value, false);
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({ contractName });
  const networkColor = useNetworkColor();

  if (deployedContractLoading) {
    return (
      <div className="mt-14">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!deployedContractData) {
    return (
      <p className="mt-14 text-3xl">
        {`No contract found by the name of "${contractName}" on chain "${targetNetwork.name}"!`}
      </p>
    );
  }

  return (
    <div className={`my-0 grid w-full max-w-7xl grid-cols-1 px-6 lg:grid-cols-6 lg:gap-12 lg:px-10 ${className}`}>
      <div className="col-span-5 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-10">
        <div className="col-span-1 flex flex-col">
          <div className="bg-base-100 border-base-300 shadow-secondary mb-6 space-y-1 rounded-3xl border px-6 py-4 shadow-md lg:px-8">
            <div className="flex">
              <div className="flex flex-col gap-1">
                <span className="font-bold">{contractName}</span>
                <Address address={deployedContractData.address} onlyEnsOrAddress />
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold">Balance:</span>
                  <Balance address={deployedContractData.address} className="h-1.5 min-h-[0.375rem] px-0" />
                </div>
              </div>
            </div>
            {targetNetwork && (
              <p className="my-0 text-sm">
                <span className="font-bold">Network</span>:{" "}
                <span style={{ color: networkColor }}>{targetNetwork.name}</span>
              </p>
            )}
          </div>
          <div className="bg-base-300 shadow-base-300 rounded-3xl px-6 py-4 shadow-lg lg:px-8">
            <ContractVariables
              refreshDisplayVariables={refreshDisplayVariables}
              deployedContractData={deployedContractData}
            />
          </div>
        </div>
        <div className="col-span-1 flex flex-col gap-6 lg:col-span-2">
          <div className="z-10">
            <div className="bg-base-100 shadow-secondary border-base-300 relative mt-10 flex flex-col rounded-3xl border shadow-md">
              <div className="bg-base-300 shadow-base-300 absolute -left-[1px] -top-[38px] -z-10 h-[5rem] w-[5.5rem] self-start rounded-[22px] py-[0.65rem] shadow-lg">
                <div className="flex items-center justify-center space-x-2">
                  <p className="my-0 text-sm">Read</p>
                </div>
              </div>
              <div className="divide-base-300 divide-y p-5">
                <ContractReadMethods deployedContractData={deployedContractData} />
              </div>
            </div>
          </div>
          <div className="z-10">
            <div className="bg-base-100 shadow-secondary border-base-300 relative mt-10 flex flex-col rounded-3xl border shadow-md">
              <div className="bg-base-300 shadow-base-300 absolute -left-[1px] -top-[38px] -z-10 h-[5rem] w-[5.5rem] self-start rounded-[22px] py-[0.65rem] shadow-lg">
                <div className="flex items-center justify-center space-x-2">
                  <p className="my-0 text-sm">Write</p>
                </div>
              </div>
              <div className="divide-base-300 divide-y p-5">
                <ContractWriteMethods
                  deployedContractData={deployedContractData}
                  onChange={triggerRefreshDisplayVariables}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
