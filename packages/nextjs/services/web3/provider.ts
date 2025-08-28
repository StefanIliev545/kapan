import * as chains from "@starknet-react/chains";
import { jsonRpcProvider, starknetChainId } from "@starknet-react/core";
import scaffoldConfig from "~~/scaffold.config";

const containsDevnet = (networks: readonly chains.Chain[]) => {
  return networks.filter(it => it.network == chains.devnet.network).length > 0;
};

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

const provider = jsonRpcProvider({
  rpc: () => ({
    nodeUrl: rpcUrl,
    specVersion: "0.8.1",
    chainId: starknetChainId(currentNetwork.id),
  }),
});

export default provider;
