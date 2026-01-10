import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  UseAccountResult,
  useAccount as useStarknetReactAccount,
} from "@starknet-react/core";
import { AccountInterface, constants } from "starknet";
import { useSearchParams } from "next/navigation";
import { normalizeUserAddress } from "~~/utils/address";
import { createSafeContext } from "./createSafeContext";

export type EnhancedUseAccountResult = UseAccountResult & {
  viewingAddress?: `0x${string}`;
  isViewingOtherAddress: boolean;
};

const { Context: AccountContext, useContextValue } =
  createSafeContext<EnhancedUseAccountResult>("Account");

type AccountProviderProps = {
  children: ReactNode;
};

export const AccountProvider = ({ children }: AccountProviderProps) => {
  const starknetAccount = useStarknetReactAccount();
  const { account, address, status } = starknetAccount;
  const searchParams = useSearchParams();

  const correctedStatus = useMemo(() => {
    if (status === "connected" && !account) {
      return "connecting";
    }

    return status;
  }, [status, account]);

  const [accountChainId, setAccountChainId] = useState<bigint>(0n);
  const [overrideAddress, setOverrideAddress] = useState<`0x${string}` | undefined>();

  const addressParam = searchParams?.get("address");

  useEffect(() => {
    setOverrideAddress(normalizeUserAddress(addressParam));
  }, [addressParam]);

  useEffect(() => {
    let ignore = false;

    const updateChainId = async () => {
      if (!account) {
        setAccountChainId(0n);
        return;
      }

      try {
        let chainId: string | bigint | undefined;

        if (typeof account.getChainId === "function") {
          chainId = await account.getChainId();
        } else if ((account as any).channel?.getChainId) {
          chainId = await (account as any).channel.getChainId();
        } else {
          chainId = constants.StarknetChainId.SN_MAIN;
        }

        if (!ignore && chainId) {
          setAccountChainId(BigInt(chainId.toString()));
        }
      } catch {
        // Silently fall back to mainnet chain ID
        if (!ignore) {
          setAccountChainId(BigInt(constants.StarknetChainId.SN_MAIN));
        }
      }
    };

    updateChainId();

    return () => {
      ignore = true;
    };
  }, [account]);

  const patchedAccount = useMemo(() => {
    if (status === "connected" && address && !account) {
      const provisionalAccount: Partial<AccountInterface> = {
        address,
        execute: async () => {
          throw new Error(
            "Wallet connection issue. Please refresh and reconnect.",
          );
        },
        estimateInvokeFee: async () => {
          throw new Error(
            "Wallet connection issue. Please refresh and reconnect.",
          );
        },
        getChainId: async () => {
          return constants.StarknetChainId.SN_MAIN;
        },
        cairoVersion: "1",
      };

      return provisionalAccount as AccountInterface;
    }

    return account;
  }, [status, address, account]);

  const viewingAddress = overrideAddress ?? (address as `0x${string}` | undefined);
  const isViewingOtherAddress = useMemo(() => {
    if (!overrideAddress) {
      return false;
    }

    if (!address) {
      return true;
    }

    return overrideAddress.toLowerCase() !== address.toLowerCase();
  }, [overrideAddress, address]);

  const derivedIsConnected = useMemo(() => {
    return Boolean(starknetAccount.isConnected && !isViewingOtherAddress);
  }, [starknetAccount.isConnected, isViewingOtherAddress]);

  const contextValue = useMemo<EnhancedUseAccountResult>(() => {
    return {
      ...starknetAccount,
      account: patchedAccount,
      status: correctedStatus,
      chainId: accountChainId,
      isConnected: derivedIsConnected,
      viewingAddress,
      isViewingOtherAddress,
    } as EnhancedUseAccountResult;
  }, [
    starknetAccount,
    patchedAccount,
    correctedStatus,
    accountChainId,
    derivedIsConnected,
    viewingAddress,
    isViewingOtherAddress,
  ]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccountContext = useContextValue;
