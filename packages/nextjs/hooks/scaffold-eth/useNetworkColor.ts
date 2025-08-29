import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import { AllowedChainIds } from "~~/utils/scaffold-eth";
import { useNetworkColor as useSharedNetworkColor } from "../common/useNetworkColor";

/**
 * Gets the color of the selected EVM network
 */
export const useNetworkColor = (chainId?: AllowedChainIds) => {
  const chain = useSelectedNetwork(chainId);
  return useSharedNetworkColor(chain);
};
