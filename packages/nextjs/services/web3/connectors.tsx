import { Connector } from "@starknet-react/core";
import { ArgentMobileConnector } from "starknetkit/argentMobile";
import { InjectedConnector } from "starknetkit/injected";
import { WebWalletConnector } from "starknetkit/webwallet";
import { getTargetNetworks } from "~~/utils/scaffold-stark";

const targetNetworks = getTargetNetworks();

export const connectors = [
  new InjectedConnector({ options: { id: "braavos", name: "Braavos" } }) as Connector,
  new InjectedConnector({ options: { id: "argentX", name: "Argent X" } }) as Connector,
  new InjectedConnector({ options: { id: "keplr", name: "Keplr" } }) as Connector,
  new InjectedConnector({ options: { id: "metamask", name: "MetaMask" } }) as Connector,
  new InjectedConnector({ options: { id: "okxwallet", name: "OKX" } }) as Connector,
  new InjectedConnector({ options: { id: "fordefi", name: "Fordefi" } }) as Connector,
  new ArgentMobileConnector() as Connector,
  new WebWalletConnector({ url: "https://web.argent.xyz" }) as Connector,
];

export const appChains = targetNetworks;
