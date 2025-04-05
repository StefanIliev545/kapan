import * as chains from "@starknet-react/chains";
import { jsonRpcProvider, publicProvider, starknetChainId } from "@starknet-react/core";
import scaffoldConfig from "~~/scaffold.config";

const containsDevnet = (networks: readonly chains.Chain[]) => {
  return networks.filter(it => it.network == chains.devnet.network).length > 0;
};

// Get the current target network (first one in the array)
const currentNetwork = scaffoldConfig.targetSNNetworks[0];
const currentNetworkName = currentNetwork.network;

// Get RPC URL for the current network
const rpcUrl = currentNetwork.rpcUrls.public.http[0] || "";
const provider =
  rpcUrl === "/rpc" || containsDevnet(scaffoldConfig.targetSNNetworks)
    ? publicProvider()
    : jsonRpcProvider({
        rpc: () => ({
          nodeUrl: rpcUrl,
          chainId: starknetChainId(currentNetwork.id),
        }),
      });

export default provider;
