"use client";

import { useCallback, useState } from "react";
import { useEvmWalletSession } from "./EvmWalletSession";
import { toast } from "sonner";
import { useDisconnect } from "wagmi";

export function useEvmDisconnect() {
  const session = useEvmWalletSession();
  const { disconnectAsync } = useDisconnect();
  const [pending, setPending] = useState(false);

  const disconnect = useCallback(async () => {
    setPending(true);
    try {
      if (session.kind === "email") {
        await session.logout?.();
      } else {
        await disconnectAsync();
      }
    } catch {
      toast.error("Could not disconnect. Please try again.");
    } finally {
      setPending(false);
    }
  }, [session, disconnectAsync]);

  return { disconnect, pending };
}
