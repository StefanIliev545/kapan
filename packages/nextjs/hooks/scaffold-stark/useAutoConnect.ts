import { useReadLocalStorage } from "usehooks-ts";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "@starknet-react/core";
import scaffoldConfig from "~~/scaffold.config";
import { BurnerConnector, burnerAccounts } from "@scaffold-stark/stark-burner";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

/**
 * Automatically connect to a wallet/connector based on config and prior wallet
 */
let hasTriedAutoConnect = false;

/**
 * Reset helper for tests to allow re-running auto-connect logic.
 * @internal
 */
export const __resetAutoConnect = () => {
  hasTriedAutoConnect = false;
};

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

  useEffect(() => {
    if (hasTriedAutoConnect || status !== "disconnected") return;

    hasTriedAutoConnect = true;

    if (scaffoldConfig.walletAutoConnect) {
      const currentTime = Date.now();
      const ttlExpired =
        currentTime - (lastConnectionTime || 0) > scaffoldConfig.autoConnectTTL;
      if (!ttlExpired) {
        const connectorId =
          typeof savedConnector === "string"
            ? savedConnector
            : savedConnector?.id;
        const connector = connectors.find(
          conn => conn.id === connectorId,
        );

        if (connector) {
          if (
            connector.id === "burner-wallet" &&
            typeof savedConnector === "object" &&
            savedConnector?.ix !== undefined &&
            connector instanceof BurnerConnector
          ) {
            connector.burnerAccount = burnerAccounts[savedConnector.ix];
          }
          connect({ connector });
        }
      }
    }
  }, [connect, connectors, lastConnectionTime, savedConnector, status]);
};
