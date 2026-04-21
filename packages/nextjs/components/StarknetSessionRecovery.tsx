"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { clearStarknetSession, purgeCorruptStarknetSession } from "~~/utils/starknetSession";

// Runs once at module import (client-only) — guarantees the corrupted
// `lastUsedConnector` JSON blob from the old ConnectModal is wiped BEFORE
// StarknetConfig's autoConnect effect reads the key on mount. Has to live
// at module scope rather than inside the component so it fires before the
// first render, not after.
if (typeof window !== "undefined") {
  purgeCorruptStarknetSession();
}

/**
 * Self-healing for broken Starknet autoConnect state.
 *
 * starknet-react persists the last-used connector id in `lastUsedConnector`
 * and rehydrates from it on mount. If the saved wallet is in a bad state
 * (Braavos session revoked, extension uninstalled, origin permission
 * dropped, etc.) autoConnect fails silently — and because the key is still
 * there, every refresh targets the same broken wallet forever. Users have
 * to open DevTools and clear localStorage by hand, which they won't.
 *
 * This component watches the account status transition. If autoConnect ran
 * (`reconnecting`) and didn't land us in `connected`, we wipe the key so
 * the next mount starts fresh and the wallet picker works again.
 *
 * Mount inside StarknetConfig, after autoConnect is wired.
 */
export function StarknetSessionRecovery() {
  const { status } = useAccount();
  const sawReconnecting = useRef(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    if (status === "reconnecting") {
      sawReconnecting.current = true;
      return;
    }

    if (status === "connected") {
      // Normal path — clear our guard so subsequent disconnects can be
      // observed and healed independently.
      handled.current = true;
      return;
    }

    if (status === "disconnected" && sawReconnecting.current) {
      // autoConnect attempted and didn't land us connected → the stored
      // connector id is stale, wipe it.
      clearStarknetSession();
      handled.current = true;
    }
  }, [status]);

  return null;
}
