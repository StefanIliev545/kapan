import { evmChains, getEvmClient } from "./evmChains";
import { getWagmiConnectors } from "./wagmiConnectors";
import { createConfig } from "wagmi";

export const wagmiConfig = createConfig({
  chains: evmChains,
  connectors: getWagmiConnectors(),
  multiInjectedProviderDiscovery: true,
  ssr: true,
  client: getEvmClient,
});
