import { useEffect, useMemo, useState } from "react";
import { UseAccountResult, useAccount as useStarknetReactAccount } from "@starknet-react/core";
import { AccountInterface, constants } from "starknet";

/**
 * Wrapper around starknet react's useAccount hook to fix inconsistencies
 */
export function useAccount(): UseAccountResult {
  const starknetAccount = useStarknetReactAccount();
  const { account, status } = starknetAccount;

  const correctedStatus = useMemo(() => {
    if (status === "connected" && !account) {
      return "connecting";
    }
    return status;
  }, [status, account]);

  const [accountChainId, setAccountChainId] = useState<bigint>(0n);

  useEffect(() => {
    if (account) {
      const getChainId = async () => {
        try {
          let chainId: string | bigint;

          if (typeof account.getChainId === "function") {
            chainId = await account.getChainId();
          } else if ((account as any).channel?.getChainId) {
            chainId = await (account as any).channel.getChainId();
          } else {
            chainId = constants.StarknetChainId.SN_MAIN;
          }

          if (chainId) {
            setAccountChainId(BigInt(chainId.toString()));
          }
        } catch (error) {
          setAccountChainId(BigInt(constants.StarknetChainId.SN_MAIN));
        }
      };

      getChainId();
    }
  }, [account]);

  return {
    ...starknetAccount,
    account: account,
    status: correctedStatus,
    chainId: accountChainId,
  } as UseAccountResult;
}
