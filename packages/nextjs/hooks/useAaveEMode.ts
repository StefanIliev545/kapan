import { useMemo } from "react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

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
  const { data: userEModeRaw, isLoading: isLoadingUserEMode, refetch: refetchUserEMode } = useScaffoldReadContract({
    contractName: "AaveGatewayView" as any,
    functionName: "getUserEMode",
    args: [userAddress as Address],
    query: {
      enabled: !!userAddress,
    },
  });

  // Fetch all available E-Mode categories
  const { data: eModesRaw, isLoading: isLoadingEModes } = useScaffoldReadContract({
    contractName: "AaveGatewayView" as any,
    functionName: "getEModes",
    args: [],
    query: {
      enabled: true,
    },
  });

  // Get the Aave Pool address for direct setUserEMode calls
  const { data: poolAddress } = useScaffoldReadContract({
    contractName: "AaveGatewayWrite" as any,
    functionName: "getPool",
    args: [],
    query: {
      enabled: true,
    },
  });

  // Parse E-Mode categories
  const emodes = useMemo((): EModeCategory[] => {
    if (!eModesRaw) return [];
    return (eModesRaw as any[]).map((e: any) => ({
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

  return {
    // Data
    userEModeId,
    userEMode,
    emodes,
    poolAddress: poolAddress as Address | undefined,

    // Loading states
    isLoading: isLoadingUserEMode || isLoadingEModes,
    isLoadingUserEMode,
    isLoadingEModes,

    // Actions
    refetchUserEMode,
    canSwitchToEMode,

    // Helper to encode setUserEMode call
    encodeSetEModeCall: (categoryId: number): { to: Address; data: `0x${string}` } | null => {
      if (!poolAddress) return null;
      // Encode setUserEMode(uint8 categoryId)
      const data = `0x28530a47${categoryId.toString(16).padStart(64, "0")}` as `0x${string}`;
      return {
        to: poolAddress as Address,
        data,
      };
    },
  };
}

/**
 * Hook for setting E-Mode (direct Pool call)
 */
export function useSetEMode() {
  const { writeContractAsync, isPending } = useScaffoldWriteContract("AaveGatewayWrite" as any);

  const setEMode = async (poolAddress: Address, categoryId: number) => {
    // We need to call the Pool contract directly, not through the gateway
    // This requires using wagmi's useWriteContract directly
    // For now, this is a placeholder - the actual implementation would use:
    // writeContract({ address: poolAddress, abi: poolAbi, functionName: 'setUserEMode', args: [categoryId] })
    console.log("setEMode called with categoryId:", categoryId, "poolAddress:", poolAddress);
    throw new Error("Direct pool call not yet implemented - use wagmi useWriteContract");
  };

  return {
    setEMode,
    isPending,
  };
}

