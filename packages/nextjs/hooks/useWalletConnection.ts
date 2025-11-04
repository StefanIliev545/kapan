import { useAccount as useAccountEVM } from "wagmi";
import { useAccount as useAccountStark } from "./useAccount";

/**
 * Hook that exposes wallet connection information for both EVM and Starknet
 * accounts simultaneously. This allows the application to interact with
 * wallets on both networks at the same time.
 */
export const useWalletConnection = () => {
  const evmAccount = useAccountEVM();
  const starkAccount = useAccountStark();

  return {
    evm: {
      address: evmAccount.address,
      isConnected: Boolean(evmAccount.address),
      status: evmAccount.status,
    },
    starknet: {
      address: starkAccount.address,
      isConnected: starkAccount.isConnected,
      status: starkAccount.status,
    },
  };
};

