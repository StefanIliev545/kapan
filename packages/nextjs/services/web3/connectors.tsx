import { KeplrConnector } from "./keplr";
import { BurnerConnector } from "@scaffold-stark/stark-burner";
import { InjectedConnector, argent, braavos } from "@starknet-react/core";
import scaffoldConfig from "~~/scaffold.config";
import { supportedChains } from "~~/supportedChains";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";
import { getTargetNetworks } from "~~/utils/scaffold-stark";

const targetNetworks = getTargetNetworks();

export const connectors = getConnectors();

// workaround helper function to properly disconnect with removing local storage (prevent autoconnect infinite loop)
function withDisconnectWrapper(connector: InjectedConnector) {
  const connectorDisconnect = connector.disconnect;
  const _disconnect = (): Promise<void> => {
    localStorage.removeItem("lastUsedConnector");
    localStorage.removeItem(LAST_CONNECTED_TIME_LOCALSTORAGE_KEY);
    return connectorDisconnect();
  };
  connector.disconnect = _disconnect.bind(connector);
  return connector;
}

function getConnectors() {
  const { targetSNNetworks } = scaffoldConfig;

  const connectors: InjectedConnector[] = [argent(), braavos()];
  const isDevnet = targetSNNetworks.some(network => (network.network as string) === "devnet");

  if (!isDevnet) {
    connectors.push(new KeplrConnector());
  } else {
    const burnerConnector = new BurnerConnector();
    burnerConnector.chain = supportedChains.devnet;
    connectors.push(burnerConnector as unknown as InjectedConnector);
  }

  return connectors.sort(() => Math.random() - 0.5).map(withDisconnectWrapper);
}

export const appChains = targetNetworks;
