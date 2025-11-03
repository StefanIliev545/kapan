"use client";

import { track } from "@vercel/analytics";
import { useAccountEffect } from "wagmi";

export function WalletAnalytics() {
  useAccountEffect({
    onConnect({ chainId, connector, isReconnected }) {
      track("wallet_connected", {
        chainId,
        connector: connector?.name ?? "unknown",
        isReconnected,
      });
    },
    onDisconnect() {
      track("wallet_disconnected");
    },
  });

  return null;
}
