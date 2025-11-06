"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConnect, useDisconnect } from "@starknet-react/core";
import { track } from "@vercel/analytics";
import toast from "react-hot-toast";
import { useAccount } from "~~/hooks/useAccount";

/**
 * A resilient Starknet Connect button:
 * - Tracks the actual click (before connection).
 * - Times out if the wallet window is closed or never responds.
 * - Handles user-cancel vs. hard errors distinctly.
 * - Avoids concurrent connects.
 * - Shows an Install hint if no connectors exist.
 */
export function CustomConnectButton() {
  const { address, status } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const {
    connectors,
    connectAsync,
    status: connectStatus,
    pendingConnector,
  } = useConnect();

  const availableConnectors = useMemo(() => {
    return (connectors ?? []).filter((connector: any) => {
      if (typeof connector.available === "function") {
        try {
          return connector.available();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[Starknet connect] connector availability error:", error);
          return false;
        }
      }

      return true;
    });
  }, [connectors]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardRef = useRef(false);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const resetState = () => {
    clearTimer();
    guardRef.current = false;
    setInFlight(false);
  };

  useEffect(() => {
    if (status === "connected") {
      setMenuOpen(false);
      resetState();
    }
  }, [status]);

  const startTimeout = (ms = 25_000) => {
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      track("wallet_connect_timeout", { network: "starknet" });
      toast.error("Wallet did not respond. Please try again.");
      resetState();
    }, ms);
  };

  const handleConnect = async (connector: any) => {
    if (guardRef.current) return;
    guardRef.current = true;
    setErrorText(null);
    setInFlight(true);
    setMenuOpen(false);

    const connectorName = connector?.name ?? connector?.id ?? "unknown";

    track("wallet_connect_click", {
      network: "starknet",
      connector: connectorName,
    });

    try {
      startTimeout();
      await connectAsync({ connector });
      track("wallet_connect_success", {
        network: "starknet",
        connector: connectorName,
      });
    } catch (error: any) {
      clearTimer();

      const message = (error?.shortMessage || error?.message || "").toLowerCase();
      const isUserRejected =
        error?.code === 4001 ||
        message.includes("user rejected") ||
        message.includes("user cancelled") ||
        message.includes("user canceled") ||
        message.includes("user abort");

      if (isUserRejected) {
        track("wallet_connect_rejected", {
          network: "starknet",
          connector: connectorName,
        });
        toast("Connection request was canceled.");
      } else {
        track("wallet_connect_error", {
          network: "starknet",
          connector: connectorName,
          reason: error?.shortMessage ? "shortMessage" : "message",
        });
        setErrorText("Failed to connect. Please try again.");
        toast.error("Failed to connect. Please try again.");
        // eslint-disable-next-line no-console
        console.error("[Starknet connect] error:", error);
      }
    } finally {
      resetState();
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAsync();
      track("wallet_disconnect_click", { network: "starknet" });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Starknet disconnect] error:", error);
    }
  };

  const isConnecting = inFlight || connectStatus === "pending";
  const showInstallHint = availableConnectors.length === 0 && status !== "connected";

  if (status === "connected") {
    return (
      <div className="flex items-center gap-2">
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleDisconnect}
          aria-label="Disconnect Starknet wallet"
        >
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className={`btn btn-primary btn-sm ${isConnecting ? "loading" : ""}`}
        aria-busy={isConnecting}
        aria-disabled={isConnecting}
        onClick={() => {
          if (isConnecting) return;

          track("wallet_connect_button_click", { network: "starknet" });

          if (availableConnectors.length === 1) {
            handleConnect(availableConnectors[0]);
          } else {
            setMenuOpen((value) => !value);
          }
        }}
      >
        {isConnecting ? "Connecting…" : "Connect Starknet"}
      </button>

      {menuOpen && availableConnectors.length > 1 && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border bg-base-100 shadow-lg z-50">
          <ul className="menu menu-sm p-2">
            {availableConnectors.map((connector) => (
              <li key={connector.id}>
                <button
                  className="justify-between"
                  onClick={() => handleConnect(connector)}
                  disabled={isConnecting}
                >
                  <span>{connector.name ?? connector.id}</span>
                  {pendingConnector?.id === connector.id && (
                    <span className="loading loading-xs" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showInstallHint && (
        <p className="mt-2 text-xs opacity-70">
          No Starknet wallet detected. Install Ready (Argent) or Braavos, then try again.
        </p>
      )}

      {errorText && (
        <p role="alert" className="mt-2 text-xs text-error">
          {errorText}
        </p>
      )}
    </div>
  );
}
