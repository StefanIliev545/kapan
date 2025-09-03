import { useMemo } from "react";
import { useTargetNetwork } from "./scaffold-eth/useTargetNetwork";
import { useTargetNetwork as useTargetNetworkStark } from "./scaffold-stark/useTargetNetwork";
import scaffoldConfig from "~~/scaffold.config";

export type NetworkType = "evm" | "starknet";

export const useNetworkType = (): NetworkType => {
  const { targetNetwork: evmNetwork } = useTargetNetwork();
  const { targetNetwork: starkNetwork } = useTargetNetworkStark();

  return useMemo(() => {
    // Check if the current network is in the EVM networks list
    const isEVM = scaffoldConfig.targetEVMNetworks.some(network => network.id === evmNetwork.id);
    
    // Check if the current network is in the Starknet networks list
    const isStarknet = scaffoldConfig.targetSNNetworks.some(network => network.id === starkNetwork.id);

    // Default to EVM if both are true (shouldn't happen in practice)
    if (isEVM && isStarknet) {
      console.warn("Network appears to be both EVM and Starknet, defaulting to EVM");
      return "evm";
    }

    // Return the network type
    if (isEVM) return "evm";
    if (isStarknet) return "starknet";

    // Default to EVM if we can't determine (shouldn't happen in practice)
    console.warn("Could not determine network type, defaulting to EVM");
    return "evm";
  }, [evmNetwork.id, starkNetwork.id]);
}; 