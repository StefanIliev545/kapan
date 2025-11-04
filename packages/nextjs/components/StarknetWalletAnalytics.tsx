"use client";

import { useEffect, useRef } from "react";
import { track } from "@vercel/analytics";
import { useAccount } from "@starknet-react/core";

/**
 * Tracks Starknet wallet connect / disconnect.
 * - Uses starknet-react's useAccount to observe status transitions.
 * - Converts chainId (bigint) to hex string to avoid JSON bigint serialization issues.
 * - Does NOT send addresses.
 */
export function StarknetWalletAnalytics() {
  const { status, isReconnecting, connector, chainId } = useAccount();

  // Simple FSM: only fire when status changes
  const prevStatus = useRef<typeof status | null>(null);

  useEffect(() => {
    if (prevStatus.current === status) return;

    if (status === "connected") {
      const payload: Record<string, string | number | boolean | null> = {
        network: "starknet",
        connector: (connector as any)?.name ?? (connector as any)?.id ?? "unknown",
        isReconnected: Boolean(isReconnecting),
      };

      if (chainId) {
        payload.chainId = `0x${chainId.toString(16)}`;
      }

      track("wallet_connected", payload);
    } else if (status === "disconnected") {
      track("wallet_disconnected", {
        network: "starknet",
      });
    }

    prevStatus.current = status;
  }, [status, chainId, connector, isReconnecting]);

  return null;
}
