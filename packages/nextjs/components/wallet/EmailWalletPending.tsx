"use client";

import { useState } from "react";
import { useEvmWalletSession } from "./EvmWalletSession";
import { useEvmDisconnect } from "./useEvmDisconnect";
import { toast } from "sonner";

export function EmailWalletPending() {
  const { createWallet } = useEvmWalletSession();
  const { disconnect, pending } = useEvmDisconnect();
  const [creating, setCreating] = useState(false);

  const retry = async () => {
    setCreating(true);
    try {
      await createWallet?.();
    } catch {
      toast.error("Your email wallet is not ready yet. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <span role="status">Preparing wallet…</span>
      <button type="button" className="text-primary hover:underline" onClick={retry} disabled={creating}>
        Retry
      </button>
      <button type="button" className="text-base-content/60 hover:underline" onClick={disconnect} disabled={pending}>
        Sign out
      </button>
    </div>
  );
}
