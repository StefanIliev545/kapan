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

  // Persist the last known address to avoid reconnect prompts when wallets lock
  const [persistedAddress, setPersistedAddress] = useState<`0x${string}` | undefined>(
    undefined,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("lastStarknetAddress");
    if (stored) {
      setPersistedAddress(stored as `0x${string}`);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (address) {
      window.localStorage.setItem("lastStarknetAddress", address);
      setPersistedAddress(address);
    }
  }, [address]);

  // Cache the account instance so re-renders don't trigger a fresh enable
  const accountRef = useRef<AccountInterface | undefined>();
  useEffect(() => {
    if (account && typeof (account as any).execute === "function") {
      accountRef.current = account;
    }
  }, [account]);

  const stableAccount = useMemo(() => account ?? accountRef.current, [account]);

  // Log status and address changes to help trace unexpected reconnects
  useEffect(() => {
    console.debug("useAccount", { status, address, hasAccount: !!account });
  }, [status, address, account]);

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

          if (chainId !== undefined && chainId !== null) {
            try {
              const parsedChainId =
                typeof chainId === "bigint" ? chainId : BigInt(chainId.toString());
              setAccountChainId(parsedChainId);
            } catch (err) {
              console.warn("useAccount: failed to parse chainId", chainId, err);
              setAccountChainId(BigInt(constants.StarknetChainId.SN_MAIN));
            }
          }
        } catch (error) {
          console.warn("useAccount: getChainId threw", error);
          setAccountChainId(BigInt(constants.StarknetChainId.SN_MAIN));
        }
      };

      getChainId();
    }
  }, [stableAccount]);

  return {
    ...starknetAccount,
    account: stableAccount,
    chainId: accountChainId,
    address: address ?? persistedAddress,
  } as UseAccountResult;
}