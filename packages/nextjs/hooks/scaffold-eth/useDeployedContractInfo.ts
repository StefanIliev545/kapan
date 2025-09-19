import { useEffect, useState } from "react";
import { useIsMounted } from "usehooks-ts";
import { usePublicClient } from "wagmi";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import {
  Contract,
  ContractCodeStatus,
  ContractName,
  UseDeployedContractConfig,
  contracts,
} from "~~/utils/scaffold-eth/contract";
import { getStorybookMock, invokeStorybookMock } from "~~/utils/storybook";

// Cache deployment checks per chain + address to avoid spamming RPC nodes
const deploymentStatusCache = new Map<string, ContractCodeStatus>();

type DeployedContractData<TContractName extends ContractName> = {
  data: Contract<TContractName> | undefined;
  isLoading: boolean;
};

/**
 * Gets the matching contract info for the provided contract name from the contracts present in deployedContracts.ts
 * and externalContracts.ts corresponding to targetNetworks configured in scaffold.config.ts
 */
export function useDeployedContractInfo<TContractName extends ContractName>(
  config: UseDeployedContractConfig<TContractName>,
): DeployedContractData<TContractName>;
/**
 * @deprecated Use object parameter version instead: useDeployedContractInfo({ contractName: "YourContract" })
 */
export function useDeployedContractInfo<TContractName extends ContractName>(
  contractName: TContractName,
): DeployedContractData<TContractName>;

export function useDeployedContractInfo<TContractName extends ContractName>(
  configOrName: UseDeployedContractConfig<TContractName> | TContractName,
): DeployedContractData<TContractName> {
  const isMounted = useIsMounted();

  const finalConfig: UseDeployedContractConfig<TContractName> =
    typeof configOrName === "string" ? { contractName: configOrName } : (configOrName as any);

  const storybookHandler = getStorybookMock<
    {
      config: UseDeployedContractConfig<TContractName>;
      originalResult: DeployedContractData<TContractName>;
    },
    DeployedContractData<TContractName>
  >("useDeployedContractInfo");

  const shouldMock = Boolean(storybookHandler);

  useEffect(() => {
    if (typeof configOrName === "string") {
      console.warn(
        "Using `useDeployedContractInfo` with a string parameter is deprecated. Please use the object parameter version instead.",
      );
    }
  }, [configOrName]);
  const { contractName, chainId } = finalConfig;
  const selectedNetwork = useSelectedNetwork(chainId);
  const deployedContract = contracts?.[selectedNetwork.id]?.[contractName as ContractName] as Contract<TContractName>;
  const cacheKey = deployedContract ? `${selectedNetwork.id}-${deployedContract.address}` : undefined;
  const cachedStatus = cacheKey ? deploymentStatusCache.get(cacheKey) : undefined;
  const [status, setStatus] = useState<ContractCodeStatus>(
    cachedStatus ?? ContractCodeStatus.LOADING,
  );
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });

  useEffect(() => {
    if (shouldMock) {
      return;
    }
    const checkContractDeployment = async () => {
      if (!deployedContract || !cacheKey) {
        setStatus(ContractCodeStatus.NOT_FOUND);
        return;
      }
      if (!isMounted() || !publicClient) return;

      const cached = deploymentStatusCache.get(cacheKey);
      if (cached) {
        setStatus(cached);
        return;
      }

      try {
        const code = await publicClient.getBytecode({
          address: deployedContract.address,
        });

        const newStatus = code === "0x" ? ContractCodeStatus.NOT_FOUND : ContractCodeStatus.DEPLOYED;
        deploymentStatusCache.set(cacheKey, newStatus);
        setStatus(newStatus);
      } catch (e) {
        console.error(e);
        deploymentStatusCache.set(cacheKey, ContractCodeStatus.NOT_FOUND);
        setStatus(ContractCodeStatus.NOT_FOUND);
      }
    };

    checkContractDeployment();
  }, [isMounted, cacheKey, deployedContract, publicClient, shouldMock]);

  const result: DeployedContractData<TContractName> = {
    data: status === ContractCodeStatus.DEPLOYED ? deployedContract : undefined,
    isLoading: shouldMock ? false : status === ContractCodeStatus.LOADING,
  };

  if (storybookHandler) {
    const override = invokeStorybookMock(
      "useDeployedContractInfo",
      storybookHandler,
      {
        config: finalConfig,
        originalResult: result,
      },
    );

    if (override) {
      return override;
    }
  }

  return result;
}
