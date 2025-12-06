import {
  avnuPaymasterProvider,
  alchemyProvider,
  publicProvider,
  type ChainProviderFactory,
} from "@starknet-react/core";
import { ProviderInterface } from "starknet";
import scaffoldConfig from "~~/scaffold.config";

// Get the current target network (first one in the array)
const currentNetwork = scaffoldConfig.targetSNNetworks[0];
const currentNetworkName = currentNetwork.network;

// Get RPC URL for the current network
const rpcUrl = currentNetwork.rpcUrls.public.http[0] || "";

// Important: if the rpcUrl is empty (not configed in .env), we use the publicProvider
// which randomly choose a provider from the chain list of public providers.
// Some public provider might have strict rate limits.
if (!rpcUrl) {
  console.warn(`No RPC Provider URL configured for ${currentNetworkName}. Using public provider.`);
}

const alchemy = alchemyProvider({
  apiKey: scaffoldConfig.alchemyApiKey,
});

const communityFallback = publicProvider();

const createFailoverProvider = (
  primary: ProviderInterface,
  secondary: ProviderInterface,
): ProviderInterface => {
  return new Proxy(primary, {
    get(target, prop, receiver) {
      const primaryValue = Reflect.get(target, prop, receiver);
      if (typeof primaryValue !== "function") {
        return primaryValue;
      }

      const secondaryValue = Reflect.get(secondary, prop) as
        | ((...args: unknown[]) => unknown)
        | undefined;

      return async (...args: unknown[]) => {
        try {
          return await primaryValue.apply(target, args);
        } catch (primaryError) {
          if (typeof secondaryValue === "function") {
            console.warn(
              `[starknet] falling back to secondary RPC for ${String(prop)}`,
              primaryError,
            );
            return secondaryValue.apply(secondary, args);
          }
          throw primaryError;
        }
      };
    },
  }) as ProviderInterface;
};

const provider: ChainProviderFactory = (chain) => {
  const primary = alchemy(chain);
  const fallback = communityFallback(chain);

  if (primary && fallback) {
    return createFailoverProvider(primary, fallback);
  }

  return primary ?? fallback;
};


const paymasterProvider = avnuPaymasterProvider({});

export { paymasterProvider };

export default provider;
