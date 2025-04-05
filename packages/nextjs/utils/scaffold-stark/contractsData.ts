import scaffoldConfig from "~~/scaffold.config";
import { contracts } from "~~/utils/scaffold-stark/contract";

export function getAllContracts() {
  const contractsData = contracts?.[scaffoldConfig.targetSNNetworks[0].network];
  return contractsData ? contractsData : {};
}
