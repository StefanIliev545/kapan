import { useAccount as useAccountEVM } from "wagmi";
import { useAccount as useAccountStark } from "./useAccount";
import { useNetworkType, NetworkType } from "./useNetworkType";

/**
 * Hook that abstracts wallet connection logic across EVM and Starknet networks.
 * Optionally accepts a network type override; otherwise uses the current network type.
 */
export const useWalletConnection = (networkTypeOverride?: NetworkType) => {
  const detectedNetwork = useNetworkType();
  const networkType = networkTypeOverride ?? detectedNetwork;

  const evmAccount = useAccountEVM();
  const starkAccount = useAccountStark();

  const address = networkType === "evm" ? evmAccount.address : starkAccount.address;
  const isConnected =
    networkType === "evm" ? Boolean(evmAccount.address) : starkAccount.status === "connected";
  const status = networkType === "evm" ? evmAccount.status : starkAccount.status;

  return { address, isConnected, status, networkType };
};

