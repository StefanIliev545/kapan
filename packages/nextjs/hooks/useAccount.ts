import { UseAccountResult } from "@starknet-react/core";
import { useAccountContext } from "~~/contexts/AccountContext";

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
  return useAccountContext();
}
