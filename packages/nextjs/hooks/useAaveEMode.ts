import { useMemo } from "react";
import { Address, encodeFunctionData } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

// Minimal ABI for Aave Pool setUserEMode
const POOL_SET_EMODE_ABI = [
  {
    name: "setUserEMode",
    type: "function",
    inputs: [{ name: "categoryId", type: "uint8" }],
    outputs: [],
  },
] as const;

export interface EModeCategory {
  id: number;
  ltv: number; // in basis points
  liquidationThreshold: number; // in basis points
  liquidationBonus: number; // in basis points
  label: string;
  collateralBitmap: bigint;
  borrowableBitmap: bigint;
}

export type AaveLikeViewContractName = "AaveGatewayView" | "ZeroLendGatewayView" | "SparkGatewayView";
export type AaveLikeWriteContractName = "AaveGatewayWrite" | "ZeroLendGatewayWrite" | "SparkGatewayWrite";

/**
 * Generic hook for Aave-like protocol E-Mode functionality
 * - Fetches available E-Mode categories
 * - Fetches user's current E-Mode category
 * - Provides function to switch E-Mode
 * - Works with any Aave-fork protocol (Aave, ZeroLend, etc.)
 */
export function useAaveLikeEMode(
  chainId?: number,
  viewContractName: AaveLikeViewContractName = "AaveGatewayView",
  writeContractName: AaveLikeWriteContractName = "AaveGatewayWrite"
) {
  const { address: userAddress } = useAccount();

  // Fetch user's current E-Mode category
  // Note: Type cast needed until GatewayView is redeployed to all chains with getUserEMode
  const { data: userEModeRaw, isLoading: isLoadingUserEMode, refetch: refetchUserEMode } = useScaffoldReadContract({
    contractName: viewContractName,
    functionName: "getUserEMode",
    args: [userAddress as Address],
    chainId,
    query: {
      enabled: !!userAddress,
    },
  } as any);

  // Fetch all available E-Mode categories
  const { data: eModesRaw, isLoading: isLoadingEModes } = useScaffoldReadContract({
    contractName: viewContractName,
    functionName: "getEModes",
    args: [],
    chainId,
    query: {
      enabled: true,
    },
  } as any);

  // Get the Pool address for direct setUserEMode calls
  const { data: poolAddress } = useScaffoldReadContract({
    contractName: writeContractName,
    functionName: "getPool",
    args: [],
    chainId,
    query: {
      enabled: true,
    },
  } as any);

  // Parse E-Mode categories
  const emodes = useMemo((): EModeCategory[] => {
    if (!eModesRaw) return [];
    return (eModesRaw as unknown as any[]).map((e: any) => ({
      id: Number(e.id),
      ltv: Number(e.ltv),
      liquidationThreshold: Number(e.liquidationThreshold),
      liquidationBonus: Number(e.liquidationBonus),
      label: e.label || `Category ${e.id}`,
      collateralBitmap: e.collateralBitmap,
      borrowableBitmap: e.borrowableBitmap,
    }));
  }, [eModesRaw]);

  // User's current E-Mode
  const userEModeId = userEModeRaw !== undefined ? Number(userEModeRaw) : 0;
  const userEMode = useMemo(() => {
    if (userEModeId === 0) return null;
    return emodes.find(e => e.id === userEModeId) || null;
  }, [emodes, userEModeId]);

  // Check if user has incompatible borrows for a target E-Mode
  // Note: This is a simplified check - full implementation would need to check
  // the borrowableBitmap against user's actual borrowed assets
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canSwitchToEMode = (_targetCategoryId: number): boolean => {
    // Can always switch to category 0 (disable E-Mode)
    // For other categories, we need to verify no incompatible borrows
    // This would require checking the user's borrow positions against the category's borrowableBitmap
    // For now, return true and let the transaction fail if incompatible
    return true;
  };

  // Helper to encode setUserEMode call for use in multicall or sendTransaction
  const encodeSetEModeCall = (categoryId: number): { to: Address; data: `0x${string}` } | null => {
    if (!poolAddress) return null;
    const data = encodeFunctionData({
      abi: POOL_SET_EMODE_ABI,
      functionName: "setUserEMode",
      args: [categoryId],
    });
    return {
      to: poolAddress as unknown as Address,
      data,
    };
  };

  return {
    // Data
    userEModeId,
    userEMode,
    emodes,
    poolAddress: poolAddress as unknown as Address | undefined,

    // Loading states
    isLoading: isLoadingUserEMode || isLoadingEModes,
    isLoadingUserEMode,
    isLoadingEModes,

    // Actions
    refetchUserEMode,
    canSwitchToEMode,
    encodeSetEModeCall,
  };
}

/**
 * Hook for Aave V3 E-Mode functionality (convenience wrapper)
 * Uses the generic useAaveLikeEMode with Aave contract names
 */
export function useAaveEMode(chainId?: number) {
  return useAaveLikeEMode(chainId, "AaveGatewayView", "AaveGatewayWrite");
}

/**
 * Hook for ZeroLend E-Mode functionality (convenience wrapper)
 * Uses the generic useAaveLikeEMode with ZeroLend contract names
 */
export function useZeroLendEMode(chainId?: number) {
  return useAaveLikeEMode(chainId, "ZeroLendGatewayView", "ZeroLendGatewayWrite");
}

/**
 * Hook for Spark E-Mode functionality (convenience wrapper)
 * Uses the generic useAaveLikeEMode with Spark contract names
 * Spark is an Aave V3 fork so E-Mode works the same way
 */
export function useSparkEMode(chainId?: number) {
  return useAaveLikeEMode(chainId, "SparkGatewayView", "SparkGatewayWrite");
}

/**
 * Hook for setting E-Mode via direct Pool contract call
 */
export function useSetEMode() {
  const { writeContractAsync, isPending } = useWriteContract();

  const setEMode = async (poolAddress: Address, categoryId: number) => {
    return writeContractAsync({
      address: poolAddress,
      abi: POOL_SET_EMODE_ABI,
      functionName: "setUserEMode",
      args: [categoryId],
    });
  };

  return {
    setEMode,
    isPending,
  };
}
