import { useEffect, useRef, useState } from "react";
import { useConnect } from "@starknet-react/core";
import { track } from "@vercel/analytics";
import toast from "react-hot-toast";
import { type StarknetkitConnector, useStarknetkitConnectModal } from "starknetkit";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

const ConnectModal = () => {
  const { connectAsync, connectors } = useConnect();
  const availableConnectors = (connectors ?? []).filter((connector) => {
    const availableFn = (connector as { available?: () => boolean }).available;
    if (typeof availableFn === "function") {
      try {
        return availableFn();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[Starknet connect] connector availability error:", error);
        return false;
      }
    }

    return true;
  });
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: availableConnectors as StarknetkitConnector[],
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardRef = useRef(false);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  useEffect(() => {
    if (availableConnectors.length > 0 && showInstallHint) {
      setShowInstallHint(false);
    }
  }, [availableConnectors.length, showInstallHint]);

  const resetState = () => {
    clearTimer();
    guardRef.current = false;
    setIsConnecting(false);
  };

  const startTimeout = (connectorName: string, ms = 25_000) => {
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      track("wallet_connect_timeout", { network: "starknet", connector: connectorName });
      toast.error("Wallet did not respond. Please try again.");
      resetState();
    }, ms);
  };

  async function connectWallet() {
    if (guardRef.current) return;
    guardRef.current = true;
    track("wallet_connect_button_click", { network: "starknet" });

    if (availableConnectors.length === 0) {
      toast.error("No Starknet wallet detected. Install a wallet and try again.");
      setShowInstallHint(true);
      guardRef.current = false;
      return;
    }

    setIsConnecting(true);
    let attemptedConnectorName = "unknown";
    try {
      const { connector } = await starknetkitConnectModal();
      if (!connector) {
        track("wallet_connect_rejected", { network: "starknet", connector: "unknown" });
        toast("Connection request was canceled.");
        return;
      }

      attemptedConnectorName = connector?.name ?? connector?.id ?? "unknown";

      track("wallet_connect_click", { network: "starknet", connector: attemptedConnectorName });

      startTimeout(attemptedConnectorName);

      await connectAsync({ connector });

      clearTimer();

      track("wallet_connect_success", { network: "starknet", connector: attemptedConnectorName });

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("lastUsedConnector", JSON.stringify({ id: connector.id }));
          window.localStorage.setItem(LAST_CONNECTED_TIME_LOCALSTORAGE_KEY, Date.now().toString());
        }
      } catch {}
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
        track("wallet_connect_rejected", { network: "starknet", connector: attemptedConnectorName });
        toast("Connection request was canceled.");
      } else {
        track("wallet_connect_error", {
          network: "starknet",
          connector: attemptedConnectorName,
          reason: error?.shortMessage ? "shortMessage" : "message",
        });
        toast.error("Failed to connect. Please try again.");
        // eslint-disable-next-line no-console
        console.error("[Starknet connect] error:", error);
      }
    } finally {
      resetState();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={connectWallet}
        disabled={isConnecting}
        className="flex items-center gap-2 text-sm font-semibold text-primary dark:text-accent hover:opacity-80 transition-opacity duration-200 cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isConnecting && <span className="loading loading-spinner loading-xs"></span>}
        <span>Connect Starknet</span>
      </button>
      {showInstallHint && (
        <p className="text-xs opacity-70">
          No Starknet wallet detected. Install Ready (Argent) or Braavos, then try again.
        </p>
      )}
    </div>
  );
};

export default ConnectModal;
