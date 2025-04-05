import { useReadLocalStorage } from "usehooks-ts";
import { useEffect } from "react";
import { useConnect } from "@starknet-react/core";
import scaffoldConfig from "~~/scaffold.config";
import { BurnerConnector, burnerAccounts } from "@scaffold-stark/stark-burner";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

/**
 * Automatically connect to a wallet/connector based on config and prior wallet
 */
export const useAutoConnect = (): void => {
  const savedConnector = useReadLocalStorage<{ id: string; ix?: number } | string>(
    "lastUsedConnector",
  );

  const lastConnectionTime = useReadLocalStorage<number>(
    LAST_CONNECTED_TIME_LOCALSTORAGE_KEY,
  );

  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (scaffoldConfig.walletAutoConnect) {
      const currentTime = Date.now();
      const ttlExpired =
        currentTime - (lastConnectionTime || 0) > scaffoldConfig.autoConnectTTL;
      if (!ttlExpired) {
        const connectorId = typeof savedConnector === 'string' ? savedConnector : savedConnector?.id;
        const connector = connectors.find(
          (conn) => conn.id === connectorId,
        );

        if (connector) {
          if (
            connector.id === "burner-wallet" &&
            typeof savedConnector === 'object' &&
            savedConnector?.ix !== undefined &&
            connector instanceof BurnerConnector
          ) {
            connector.burnerAccount = burnerAccounts[savedConnector.ix];
          }
          connect({ connector });
        }
      }
    }
  }, [connect, connectors, lastConnectionTime, savedConnector]);
};
