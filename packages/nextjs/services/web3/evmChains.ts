import { type Transport, type Client, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const targetNetworks = scaffoldConfig.targetEVMNetworks;

export const evmChains = targetNetworks.some(network => network.id === mainnet.id)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

type EvmChain = (typeof evmChains)[number];
const clients = new Map<number, Client<Transport, EvmChain>>();

export function getEvmClient({ chain }: { chain: EvmChain }) {
  const cached = clients.get(chain.id);
  if (cached) {
    return cached;
  }

  const alchemyUrl = getAlchemyHttpUrl(chain.id);
  const transports = alchemyUrl ? [http(alchemyUrl), http()] : [http()];
  const client = createClient({
    chain,
    transport: fallback(transports),
    pollingInterval: chain.id === hardhat.id ? undefined : scaffoldConfig.pollingInterval,
  });

  clients.set(chain.id, client);
  return client;
}
