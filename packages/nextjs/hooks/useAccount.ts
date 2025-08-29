import {
  UseAccountResult,
  useAccount as useStarknetReactAccount,
} from "@starknet-react/core";
import { useEffect, useState, useMemo, useRef } from "react";
import { AccountInterface, constants } from "starknet";

/**
 * Wrapper around starknet-react's useAccount hook to fix inconsistencies and provide workarounds.
 * This hook addresses issues with the original starknet-react useAccount hook, including
 * status inconsistencies and connection problems. It provides a more reliable account interface
 * with fallback mechanisms for various wallet connection scenarios.
 *
 * @returns {UseAccountResult} An object containing:
 *   - account: AccountInterface | undefined - The account interface with workarounds for connection issues
 *   - address: `0x${string}` | undefined - The user's wallet address
 *   - status: "disconnected" | "connecting" | "connected" - The corrected connection status (fixed inconsistencies)
 *   - chainId: bigint - The chain ID of the connected network
 *   - isConnected: boolean - Boolean indicating if the user is connected
 *   - error: Error | null - Any error encountered during account operations
 *   - All other properties from starknet-react's useAccount
 */

export function useAccount(): UseAccountResult {
  const starknetAccount = useStarknetReactAccount();
  const { account, address, status } = starknetAccount;

  // Cache the account instance so re-renders don't trigger a fresh enable
  const accountRef = useRef<AccountInterface | undefined>();
  useEffect(() => {
    if (account) {
      accountRef.current = account;
    }
  }, [account]);
  const stableAccount = account ?? accountRef.current;

  // Log status and address changes to help trace unexpected reconnects
  useEffect(() => {
    console.debug("useAccount", { status, address, hasAccount: !!account });
  }, [status, address, account]);

  const correctedStatus = useMemo(() => {
    if (status === "connected" && !stableAccount) {
      return "connecting";
    }
    return status;
  }, [status, stableAccount]);

  const [accountChainId, setAccountChainId] = useState<bigint>(0n);

  useEffect(() => {
    if (stableAccount) {
      const getChainId = async () => {
        try {
          let chainId: string | bigint;

          if (typeof stableAccount.getChainId === "function") {
            chainId = await stableAccount.getChainId();
          } else if ((stableAccount as any).channel?.getChainId) {
            chainId = await (stableAccount as any).channel.getChainId();
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
  }, [stableAccount]);

  const patchedAccount = useMemo(() => {
    if (status === "connected" && address && !stableAccount) {
      const provisionalAccount = {
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
        signer: {},
      };

      return provisionalAccount as unknown as AccountInterface;
    }

    return stableAccount;
  }, [status, address, stableAccount]);

  return {
    ...starknetAccount,
    account: patchedAccount,
    status: correctedStatus,
    chainId: accountChainId,
  } as UseAccountResult;
}