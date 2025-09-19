import {
  createContext,
  useContext,
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

const AccountContext = createContext<UseAccountResult | null>(null);

type AccountProviderProps = {
  children: ReactNode;
};

export const AccountProvider = ({ children }: AccountProviderProps) => {
  const starknetAccount = useStarknetReactAccount();
  const { account, address, status } = starknetAccount;

  const correctedStatus = useMemo(() => {
    if (status === "connected" && !account) {
      return "connecting";
    }

    return status;
  }, [status, account]);

  const [accountChainId, setAccountChainId] = useState<bigint>(0n);

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
      } catch (error) {
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

  const contextValue = useMemo<UseAccountResult>(() => {
    return {
      ...starknetAccount,
      account: patchedAccount,
      status: correctedStatus,
      chainId: accountChainId,
    } as UseAccountResult;
  }, [starknetAccount, patchedAccount, correctedStatus, accountChainId]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccountContext = (): UseAccountResult => {
  const context = useContext(AccountContext);

  if (!context) {
    throw new Error("useAccount must be used within an AccountProvider");
  }

  return context;
};
