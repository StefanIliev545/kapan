import { useMemo } from "react";
import { Address } from "viem";
import { Abi } from "abitype";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { useRiskParams } from "./useRiskParams";

/**
 * Supported View Gateway contract names.
 * These gateways provide read-only access to protocol data like positions, rates, and risk parameters.
 */
export type ViewGatewayContractName =
  | "AaveGatewayView"
  | "SparkGatewayView"
  | "CompoundGatewayView"
  | "VenusGatewayView";

/**
 * Supported Write Gateway contract names.
 * These gateways handle write operations like supply, borrow, repay, and withdraw.
 */
export type WriteGatewayContractName =
  | "AaveGatewayWrite"
  | "SparkGatewayWrite"
  | "CompoundGatewayWrite"
  | "VenusGatewayWrite";

export interface GatewayContractResult {
  /** The gateway contract address */
  address: Address | undefined;
  /** The gateway contract ABI */
  abi: Abi | undefined;
  /** Whether the contract info is loading */
  isLoading: boolean;
}

export interface GatewayWithRiskParamsResult extends GatewayContractResult {
  /** Loan-to-Value ratio in basis points (100 = 1%) */
  ltvBps: bigint;
  /** Liquidation LTV in basis points (100 = 1%) */
  lltvBps: bigint;
  /** Effective LLTV value (uses lltvBps if > 0, otherwise falls back to ltvBps) */
  effectiveLltvBps: bigint;
  /** Whether risk params are loading */
  isLoadingRiskParams: boolean;
}

/**
 * Hook for accessing a gateway view contract.
 *
 * @param contractName - The name of the View Gateway contract
 * @param chainId - Optional chain ID to specify which chain's contract to use
 * @returns Gateway contract address, ABI, and loading state
 *
 * @example
 * ```tsx
 * const { address, abi, isLoading } = useGatewayContract("AaveGatewayView", 1);
 * ```
 */
export function useGatewayContract(
  contractName: ViewGatewayContractName,
  chainId?: number
): GatewayContractResult {
  // Type assertion needed because some contracts may not be in ContractName type yet
  const { data: gateway, isLoading } = useScaffoldContract({
    contractName: contractName as any,
    chainId: chainId as any
  });

  return {
    address: gateway?.address as Address | undefined,
    abi: gateway?.abi as Abi | undefined,
    isLoading,
  };
}

/**
 * Hook for accessing a gateway contract with risk parameters.
 * Combines gateway contract info with LTV and LLTV data for the connected user.
 *
 * @param contractName - The name of the View Gateway contract
 * @param chainId - Optional chain ID to specify which chain's contract to use
 * @param marketOrToken - Optional market or token address for risk params (defaults to gateway address)
 * @returns Gateway contract info plus risk parameters (ltvBps, lltvBps)
 *
 * @example
 * ```tsx
 * const { address, ltvBps, lltvBps, effectiveLltvBps } = useGatewayWithRiskParams("AaveGatewayView", 1);
 * ```
 */
export function useGatewayWithRiskParams(
  contractName: ViewGatewayContractName,
  chainId?: number,
  marketOrToken?: Address
): GatewayWithRiskParamsResult {
  const { address: userAddress } = useAccount();
  const { address, abi, isLoading } = useGatewayContract(contractName, chainId);

  // Use the provided marketOrToken or default to the gateway address
  const marketAddress = marketOrToken ?? address;

  const { ltvBps, lltvBps, isLoading: isLoadingRiskParams } = useRiskParams({
    gateway: address,
    gatewayAbi: abi,
    marketOrToken: marketAddress,
    user: userAddress as Address | undefined,
    chainId,
  });

  // Compute effective LLTV: use lltvBps if available (> 0), otherwise fall back to ltvBps
  const effectiveLltvBps = useMemo(
    () => (lltvBps > 0n ? lltvBps : ltvBps),
    [lltvBps, ltvBps]
  );

  return {
    address,
    abi,
    isLoading,
    ltvBps,
    lltvBps,
    effectiveLltvBps,
    isLoadingRiskParams,
  };
}

/**
 * Type helper for mapping View Gateway to Write Gateway contract names.
 */
export const VIEW_TO_WRITE_GATEWAY: Record<ViewGatewayContractName, WriteGatewayContractName> = {
  AaveGatewayView: "AaveGatewayWrite",
  SparkGatewayView: "SparkGatewayWrite",
  CompoundGatewayView: "CompoundGatewayWrite",
  VenusGatewayView: "VenusGatewayWrite",
};

/**
 * Get the corresponding Write Gateway contract name for a View Gateway.
 */
export function getWriteGatewayName(viewGateway: ViewGatewayContractName): WriteGatewayContractName {
  return VIEW_TO_WRITE_GATEWAY[viewGateway];
}
