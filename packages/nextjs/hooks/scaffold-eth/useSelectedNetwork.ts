import scaffoldConfig from "~~/scaffold.config";
import { useGlobalState } from "~~/services/store/store";
import { AllowedChainIds } from "~~/utils/scaffold-eth";

export function useSelectedNetwork(chainId?: AllowedChainIds) {
  const targetNetwork = useGlobalState(({ targetEVMNetwork }) => targetEVMNetwork);
  return scaffoldConfig.targetEVMNetworks.find(targetNetwork => targetNetwork.id === chainId) ?? targetNetwork;
}
