import { getWagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY } from "~~/scaffold.config";
import { getRpcFallbackUrls, withAlchemyRpcPreference } from "~~/utils/scaffold-eth";

const { targetEVMNetworks: targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
const baseEnabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

export const enabledChains = baseEnabledChains.map(chain => withAlchemyRpcPreference(chain));

const clientCache = new Map<number, any>();

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: getWagmiConnectors(),
  multiInjectedProviderDiscovery: false,
  ssr: true,
  client({ chain }) {
    const cached = clientCache.get(chain.id);
    if (cached) return cached;

    let rpcFallbacks = getRpcFallbackUrls(chain).map(url => http(url));
    if (rpcFallbacks.length === 0) {
      rpcFallbacks = [http()];
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
