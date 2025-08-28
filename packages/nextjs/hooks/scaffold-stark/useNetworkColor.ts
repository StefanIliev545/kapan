import { useTargetNetwork } from "./useTargetNetwork";
import { useNetworkColor as useSharedNetworkColor } from "../common/useNetworkColor";

/**
 * Gets the color of the target Starknet network
 */
export const useNetworkColor = () => {
  const { targetNetwork } = useTargetNetwork();
  return useSharedNetworkColor(targetNetwork);
};
