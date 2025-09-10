"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { DeployedContractsList } from "~~/app/components/DeployedContractsList";
import { NetworkFilter, NetworkOption } from "~~/components/NetworkFilter";
import { StarknetDeployedContractsList } from "~~/app/components/StarknetDeployedContractsList";

const networkOptions: NetworkOption[] = [
  {
    id: "starknet",
    name: "Starknet",
    logo: "/logos/starknet.svg",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    logo: "/logos/arb.svg",
  },
];

const ContractsSection = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("starknet");

  return (
    <section className="py-16 relative">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 -z-10 rounded-full"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/5 -z-10 rounded-full"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <CodeBracketIcon className="w-5 h-5 text-accent" />
          <h2 className="text-3xl font-bold">Deployed Smart Contracts</h2>
        </div>

        <div className="w-24 h-1 bg-accent mx-auto rounded-full mb-4"></div>

        <p className="text-base-content/80 max-w-2xl mx-auto">
          Kapan Finance&apos;s atomic debt migration functionality is powered by the following smart contracts,
          enabling secure cross-protocol interactions for Web3 lending refinancing.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto"
      >
        <div className="card bg-base-100 shadow-sm overflow-hidden border border-base-300/50">
          <div className="card-body">
            <div className="bg-base-200/50 -mx-6 -mt-6 px-6 py-3 mb-4 border-b border-base-300/50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h3 className="font-medium text-base-content flex items-center gap-2">
                <CodeBracketIcon className="w-4 h-4 text-accent" />
                <span>Smart Contract Deployments</span>
              </h3>
              <NetworkFilter
                networks={networkOptions}
                defaultNetwork="starknet"
                onNetworkChange={setSelectedNetwork}
              />
            </div>
            {selectedNetwork === "arbitrum" ? (
              <DeployedContractsList />
            ) : (
              <StarknetDeployedContractsList />
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8 text-center"
      >
        <p className="text-sm text-base-content/70 max-w-2xl mx-auto">
          All contracts are verified on their respective explorers. View contract source code and
          interactions by clicking on the contract addresses above.
        </p>
      </motion.div>
    </section>
  );
};

export default ContractsSection;

