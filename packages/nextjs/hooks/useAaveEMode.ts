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

/**
 * Hook for Aave V3 E-Mode functionality
 * - Fetches available E-Mode categories
 * - Fetches user's current E-Mode category
 * - Provides function to switch E-Mode
 */
export function useAaveEMode(chainId?: number) {
  const { address: userAddress } = useAccount();

  // Fetch user's current E-Mode category
  // Note: Type cast needed until AaveGatewayView is redeployed to all chains with getUserEMode
  const { data: userEModeRaw, isLoading: isLoadingUserEMode, refetch: refetchUserEMode } = useScaffoldReadContract({
    contractName: "AaveGatewayView",
    functionName: "getUserEMode",
    args: [userAddress as Address],
    chainId,
    query: {
      enabled: !!userAddress,
    },
  } as any);

  // Fetch all available E-Mode categories
  const { data: eModesRaw, isLoading: isLoadingEModes } = useScaffoldReadContract({
    contractName: "AaveGatewayView",
    functionName: "getEModes",
    args: [],
    chainId,
    query: {
      enabled: true,
    },
  } as any);

  // Get the Aave Pool address for direct setUserEMode calls
  const { data: poolAddress } = useScaffoldReadContract({
    contractName: "AaveGatewayWrite",
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
  const canSwitchToEMode = (targetCategoryId: number): boolean => {
    // Can always switch to category 0 (disable E-Mode)
    if (targetCategoryId === 0) return true;
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
