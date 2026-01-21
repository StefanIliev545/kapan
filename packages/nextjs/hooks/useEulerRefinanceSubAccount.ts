import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EulerPositionGroup } from "~~/app/api/euler/[chainId]/positions/route";
import { qk } from "~~/lib/queryKeys";
import {
  findEulerRefinanceSubAccount,
  type EulerRefinanceSubAccount,
} from "~~/utils/euler/subAccountUtils";
import { getEffectiveChainId } from "~~/utils/forkChain";

/**
 * Hook to find the appropriate Euler sub-account for a refinance operation.
 *
 * When refinancing TO Euler:
 * - If user has an existing position with the same borrow vault, add to that position
 * - Otherwise, create a new position on the next available sub-account
 *
 * This ensures we don't create unnecessary sub-accounts and keep related
 * positions together when possible.
 */

interface UseEulerRefinanceSubAccountParams {
  chainId: number;
  userAddress: string | undefined;
  targetBorrowVault: string | undefined; // The Euler borrow vault for the debt token
  enabled?: boolean;
}

interface UseEulerRefinanceSubAccountResult {
  /** The sub-account info for refinance */
  refinanceSubAccount: EulerRefinanceSubAccount | undefined;
  /** User's existing Euler position groups */
  existingPositionGroups: EulerPositionGroup[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Fetch user's Euler positions from the API
 */
async function fetchEulerPositions(
  chainId: number,
  userAddress: string
): Promise<{ positionGroups: EulerPositionGroup[] }> {
  try {
    // For hardhat, pass the forked chain ID so the API uses the correct subgraph
    const params = new URLSearchParams({ user: userAddress.toLowerCase() });
    if (chainId === 31337) {
      const forkChainId = getEffectiveChainId(chainId);
      params.set("forkChainId", String(forkChainId));
    }

    const response = await fetch(
      `/api/euler/${chainId}/positions?${params.toString()}`
    );
    if (!response.ok) {
      console.error(`[useEulerRefinanceSubAccount] Positions API error: ${response.status}`);
      return { positionGroups: [] };
    }
    const data = await response.json();
    return {
      positionGroups: data?.positionGroups || [],
    };
  } catch (error) {
    console.error("[useEulerRefinanceSubAccount] Failed to fetch positions:", error);
    return { positionGroups: [] };
  }
}

export function useEulerRefinanceSubAccount({
  chainId,
  userAddress,
  targetBorrowVault,
  enabled = true,
}: UseEulerRefinanceSubAccountParams): UseEulerRefinanceSubAccountResult {
  // Fetch user's existing Euler positions
  // Use the same query key as useEulerLendingPositions to share cache
  const {
    data: positionsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: qk.euler.positions(chainId, userAddress as string),
    queryFn: () => fetchEulerPositions(chainId, userAddress as string),
    staleTime: 30_000, // 30 seconds
    enabled: enabled && !!chainId && !!userAddress,
  });

  const existingPositionGroups = positionsData?.positionGroups ?? [];

  // Debug: Log positions data when it changes
  console.log("[useEulerRefinanceSubAccount] Query state:", {
    isLoading,
    enabled: enabled && !!chainId && !!userAddress,
    positionGroupCount: existingPositionGroups.length,
    usedSubAccounts: existingPositionGroups.map(g => {
      const idx = parseInt(g.subAccount.slice(-2), 16);
      return { subAccount: g.subAccount, index: idx, debtVault: g.debt?.vault.address };
    }),
  });

  // Find the appropriate sub-account for refinance
  const refinanceSubAccount = useMemo<EulerRefinanceSubAccount | undefined>(() => {
    if (!userAddress || !targetBorrowVault) {
      return undefined;
    }

    console.log("[useEulerRefinanceSubAccount] Finding sub-account:", {
      userAddress,
      targetBorrowVault,
      existingPositionGroups: existingPositionGroups.map(g => ({
        subAccount: g.subAccount,
        debtVault: g.debt?.vault.address,
        collateralCount: g.collaterals.length,
      })),
    });

    const result = findEulerRefinanceSubAccount(
      existingPositionGroups,
      targetBorrowVault,
      userAddress
    );

    console.log("[useEulerRefinanceSubAccount] Result:", result);

    return result;
  }, [existingPositionGroups, targetBorrowVault, userAddress]);

  return {
    refinanceSubAccount,
    existingPositionGroups,
    isLoading,
    error: error as Error | null,
  };
}
