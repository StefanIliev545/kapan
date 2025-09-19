import { useReadLocalStorage } from "usehooks-ts";
import { useEffect, useRef, useState } from "react";
import { useConnect } from "@starknet-react/core";
import scaffoldConfig from "~~/scaffold.config";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";
import { useAccount } from "~~/hooks/useAccount";

/**
 * Automatically connect to a wallet/connector based on config and prior wallet
 */
export const useAutoConnect = (): void => {
  /**
   * The `useReadLocalStorage` hook from `usehooks-ts` attempts `JSON.parse` on the stored
   * value which throws when the value is a plain string like `braavos`.
   * To avoid crashing the entire React tree we read the value manually and parse it in a
   * try/catch, falling back to the raw string when it is not valid JSON.
   */
  const [savedConnector, setSavedConnector] = useState<{ id: string; ix?: number } | string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem("lastUsedConnector");
    if (!raw) return;

    try {
      setSavedConnector(JSON.parse(raw));
    } catch (_) {
      // Value is not JSON encoded, use it as-is.
      setSavedConnector(raw);
    }
  }, []);

  const lastConnectionTime = useReadLocalStorage<number>(
    LAST_CONNECTED_TIME_LOCALSTORAGE_KEY,
  );

  const { connect, connectors } = useConnect();
  const { status } = useAccount();
  const attemptedConnectorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scaffoldConfig.walletAutoConnect) {
      return;
    }

    if (status !== "disconnected") {
      attemptedConnectorRef.current = null;
      return;
    }

    const connectorId = typeof savedConnector === "string" ? savedConnector : savedConnector?.id;
    if (!connectorId) {
      return;
    }

    if (attemptedConnectorRef.current === connectorId) {
      return;
    }

    const currentTime = Date.now();
    const ttlExpired =
      currentTime - (lastConnectionTime || 0) > scaffoldConfig.autoConnectTTL;
    if (ttlExpired) {
      attemptedConnectorRef.current = null;
      return;
    }

    const connector = connectors.find((conn) => conn.id === connectorId);

    if (!connector) {
      return;
    }

    const ready = async (): Promise<boolean> => {
      if (typeof connector.ready !== "function") {
        return true;
      }

      try {
        return await connector.ready();
      } catch (err) {
        console.warn("Failed to check connector readiness", err);
        return false;
      }
    };

    void (async () => {
      const isReady = await ready();
      if (!isReady) {
        return;
      }

      attemptedConnectorRef.current = connectorId;

      try {
        await connect({ connector });
      } catch (err) {
        console.warn("Failed to auto connect", err);
      } finally {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            LAST_CONNECTED_TIME_LOCALSTORAGE_KEY,
            currentTime.toString(),
          );
        }
      }
    })();
  }, [connect, connectors, lastConnectionTime, savedConnector, status]);
};
