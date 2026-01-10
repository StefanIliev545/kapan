import { getWagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetEVMNetworks: targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

const clientCache = new Map<number, any>();

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: getWagmiConnectors(),
  multiInjectedProviderDiscovery: false,
  ssr: true,
  client({ chain }) {
    const cached = clientCache.get(chain.id);
    if (cached) return cached;

    let rpcFallbacks = [http()];

    const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
    if (alchemyHttpUrl) {
      // Prefer Alchemy first to avoid public RPC rate limits
      rpcFallbacks = [http(alchemyHttpUrl), http()];
    }

    const client = createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id
        ? {
            pollingInterval: scaffoldConfig.pollingInterval,
          }
        : {}),
    });
    clientCache.set(chain.id, client);
    return client;
  },
});
