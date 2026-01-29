/**
 * useNetworkAccount Hook
 *
 * A simplified hook for getting account information for a specific network type.
 * This is the adapter-based replacement for the common pattern:
 *
 * ```tsx
 * const evmAccount = useAccount();
 * const starkAccount = useStarkAccount();
 * const address = networkType === "evm" ? evmAccount.address : starkAccount.address;
 * ```
 *
 * With this hook:
 * ```tsx
 * const { address, isConnected } = useNetworkAccount(networkType);
 * ```
 */

import { useMemo } from "react";
import { useAccount as useEvmAccount } from "wagmi";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import type { NetworkType, NetworkAccount, ConnectionStatus } from "./types";

/**
 * Map starknet-react status to our ConnectionStatus type
 */
function mapStarknetStatus(status: string): ConnectionStatus {
  switch (status) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    default:
      return "disconnected";
  }
}

/**
 * Get unified account information for a specific network type.
 *
 * @param networkType - The network type ("evm" or "starknet")
 * @returns Unified account information
 */
export function useNetworkAccount(networkType: NetworkType): NetworkAccount {
  const evmAccount = useEvmAccount();
  const starkAccount = useStarkAccount();

  return useMemo(() => {
    if (networkType === "evm") {
      return {
        address: evmAccount.address,
        isConnected: evmAccount.isConnected,
        status: evmAccount.status as ConnectionStatus,
        chainId: evmAccount.chain?.id,
      };
    }

    return {
      address: starkAccount.address,
      isConnected: starkAccount.isConnected ?? false,
      status: mapStarknetStatus(starkAccount.status),
      chainId: starkAccount.chainId,
    };
  }, [
    networkType,
    evmAccount.address,
    evmAccount.isConnected,
    evmAccount.status,
    evmAccount.chain?.id,
    starkAccount.address,
    starkAccount.isConnected,
    starkAccount.status,
    starkAccount.chainId,
  ]);
}

/**
 * Get both EVM and Starknet account information simultaneously.
 * Useful for components that need to display connection status for both networks.
 *
 * @returns Account information for both networks
 */
export function useDualNetworkAccounts(): {
  evm: NetworkAccount;
  starknet: NetworkAccount;
  activeNetwork: NetworkType | null;
} {
  const evmAccount = useEvmAccount();
  const starkAccount = useStarkAccount();

  return useMemo(() => {
    const evm: NetworkAccount = {
      address: evmAccount.address,
      isConnected: evmAccount.isConnected,
      status: evmAccount.status as ConnectionStatus,
      chainId: evmAccount.chain?.id,
    };

    const starknet: NetworkAccount = {
      address: starkAccount.address,
      isConnected: starkAccount.isConnected ?? false,
      status: mapStarknetStatus(starkAccount.status),
      chainId: starkAccount.chainId,
    };

    // Determine which network is active (prefer EVM if both connected)
    let activeNetwork: NetworkType | null = null;
    if (evm.isConnected) {
      activeNetwork = "evm";
    } else if (starknet.isConnected) {
      activeNetwork = "starknet";
    }

    return { evm, starknet, activeNetwork };
  }, [
    evmAccount.address,
    evmAccount.isConnected,
    evmAccount.status,
    evmAccount.chain?.id,
    starkAccount.address,
    starkAccount.isConnected,
    starkAccount.status,
    starkAccount.chainId,
  ]);
}

export default useNetworkAccount;
