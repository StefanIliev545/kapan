import { useMemo } from "react";
import { UseAccountResult, useAccount as useStarknetReactAccount, useNetwork } from "@starknet-react/core";
import { constants } from "starknet";

/**
 * Wrapper around starknet react's useAccount hook to fix inconsistencies
 */
export function useAccount(): UseAccountResult {
  const starknetAccount = useStarknetReactAccount();
  const { chain } = useNetwork();
  const { account, status } = starknetAccount;

  const correctedStatus = useMemo(() => {
    if (status === "connected" && !account) {
      return "connecting";
    }
    return status;
  }, [status, account]);

  const accountChainId = useMemo(() => {
    if (correctedStatus !== "connected" || !chain?.id) return 0n;
    try {
      return BigInt(chain.id.toString());
    } catch {
      return BigInt(constants.StarknetChainId.SN_MAIN);
    }
  }, [correctedStatus, chain?.id]);

  return {
    ...starknetAccount,
    account: account,
    status: correctedStatus,
    chainId: accountChainId,
  } as UseAccountResult;
}
