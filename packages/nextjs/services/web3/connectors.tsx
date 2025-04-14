import { Connector } from "@starknet-react/core";
import { ArgentMobileConnector } from "starknetkit/argentMobile";
import { InjectedConnector } from "starknetkit/injected";
import { WebWalletConnector } from "starknetkit/webwallet";
import { getTargetNetworks } from "~~/utils/scaffold-stark";

const targetNetworks = getTargetNetworks();

export const getConnectors = (): Connector[] => {
  console.log("Creating connectors");
  const connectorsInstance = [
    new InjectedConnector({ options: { id: "braavos", name: "Braavos" } }) as unknown as Connector,
    new InjectedConnector({ options: { id: "argentX", name: "Argent X" } }) as unknown as Connector,
    new InjectedConnector({ options: { id: "keplr", name: "Keplr" } }) as unknown as Connector,
    new InjectedConnector({ options: { id: "metamask", name: "MetaMask" } }) as unknown as Connector,
    new InjectedConnector({ options: { id: "okxwallet", name: "OKX" } }) as unknown as Connector,
    new InjectedConnector({ options: { id: "fordefi", name: "Fordefi" } }) as unknown as Connector,
    new ArgentMobileConnector() as unknown as Connector,
    new WebWalletConnector({ url: "https://web.argent.xyz" }) as unknown as Connector,
  ];
  console.log("Connectors created");
  return connectorsInstance;
};

export const connectors = getConnectors();
export const appChains = targetNetworks;
