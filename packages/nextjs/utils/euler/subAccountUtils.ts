/**
 * Euler V2 Sub-Account Utilities
 *
 * Euler V2 uses the EVC (Ethereum Vault Connector) which supports 256 sub-accounts per address.
 * Each sub-account can have at most 1 controller (borrow vault) and N collaterals.
 *
 * Sub-account derivation:
 *   subAccountAddress = (userAddress & ~0xFF) | subAccountIndex
 *
 * IMPORTANT: The "main account" index is NOT always 0!
 * The main account index = last byte of the user's wallet address.
 * For example:
 * - User wallet: 0x...a3 → main account is index 163 (0xa3)
 * - User wallet: 0x...00 → main account is index 0
 *
 * All 256 indices (0-255) are valid sub-accounts, just with different addresses.
 */

import type { EulerPositionGroup, EulerPositionGroupWithBalances } from "~~/hooks/useEulerLendingPositions";

/**
 * Extract the sub-account index from a sub-account address.
 * The index is the last byte of the address.
 *
 * @param subAccountAddress - The full sub-account address (0x...)
 * @returns The sub-account index (0-255)
 */
export function getSubAccountIndex(subAccountAddress: string): number {
  if (!subAccountAddress || subAccountAddress.length < 4) return 0;
  // Last 2 hex chars = last byte = index
  return parseInt(subAccountAddress.slice(-2), 16);
}

/**
 * Derive a sub-account address from a user address and index.
 *
 * @param userAddress - The main user address
 * @param index - The sub-account index (0-255)
 * @returns The sub-account address
 */
export function deriveSubAccountAddress(userAddress: string, index: number): string {
  if (!userAddress || index < 0 || index > 255) return userAddress;

  // Always apply the formula: clear last byte and OR with index
  // Don't special-case index 0 - it's a valid sub-account (0x...00)
  // The user's "main" account has index = last byte of their wallet address
  const prefix = userAddress.slice(0, -2);
  const indexHex = index.toString(16).padStart(2, "0");
  return prefix + indexHex;
}

/**
 * Result from finding a sub-account for refinance
 */
export interface EulerRefinanceSubAccount {
  /** The sub-account index to use (0-255) */
  subAccountIndex: number;
  /** Whether this is an existing position (vs. creating a new one) */
  isExistingPosition: boolean;
  /** The sub-account address for reference */
  subAccountAddress: string;
  /** If existing, the current collateral vaults in this position */
  existingCollateralVaults?: string[];
}

/**
 * Find the appropriate sub-account for a refinance operation.
 *
 * Logic:
 * 1. Look for an existing position with the same borrow vault
 * 2. If found, use that sub-account (add collateral to existing position)
 * 3. If not found, use the next available sub-account index
 *
 * @param positionGroups - User's existing Euler position groups
 * @param targetBorrowVault - The borrow vault address for the refinance
 * @param userAddress - The user's main address
 * @returns The sub-account to use for refinance
 */
export function findEulerRefinanceSubAccount(
  positionGroups: (EulerPositionGroup | EulerPositionGroupWithBalances)[],
  targetBorrowVault: string,
  userAddress: string
): EulerRefinanceSubAccount {
  const targetBorrowVaultLower = targetBorrowVault.toLowerCase();

  console.log("[findEulerRefinanceSubAccount] Input:", {
    positionGroupCount: positionGroups.length,
    targetBorrowVault: targetBorrowVaultLower,
    userAddress,
    existingPositions: positionGroups.map(g => ({
      subAccount: g.subAccount,
      subAccountIndex: getSubAccountIndex(g.subAccount),
      debtVault: g.debt?.vault.address,
      collateralVaults: g.collaterals.map(c => c.vault.address),
    })),
  });

  // 1. Look for existing position with matching borrow vault
  for (const group of positionGroups) {
    if (group.debt?.vault.address.toLowerCase() === targetBorrowVaultLower) {
      const index = getSubAccountIndex(group.subAccount);
      console.log("[findEulerRefinanceSubAccount] Found matching position at index:", index);
      return {
        subAccountIndex: index,
        isExistingPosition: true,
        subAccountAddress: group.subAccount,
        existingCollateralVaults: group.collaterals.map(c => c.vault.address),
      };
    }
  }

  // 2. No matching position - find next available sub-account
  // Get all used indices from existing positions
  const usedIndices = new Set<number>();
  for (const group of positionGroups) {
    usedIndices.add(getSubAccountIndex(group.subAccount));
  }

  // Also consider the user's main account index as potentially used
  // (even if they don't have a position there, they might want to keep it free)
  const mainAccountIndex = getSubAccountIndex(userAddress);

  // Find first unused index, starting from 1 and skipping the main account index
  // We start from 1 because 0 might be commonly used by other users and could
  // cause confusion in UIs that show "sub-account 0" prominently
  let nextIndex = 1;
  while ((usedIndices.has(nextIndex) || nextIndex === mainAccountIndex) && nextIndex < 256) {
    nextIndex++;
  }

  // If all indices except 0 are used, try 0
  if (nextIndex >= 256) {
    nextIndex = 0;
    if (usedIndices.has(0) || mainAccountIndex === 0) {
      // Extremely unlikely: all 256 are used or main is 0 and used
      // Just use 1 and hope for the best
      nextIndex = 1;
    }
  }

  console.log("[findEulerRefinanceSubAccount] No matching position found.", {
    nextIndex,
    usedIndices: Array.from(usedIndices),
    mainAccountIndex,
    positionGroupCount: positionGroups.length,
  });

  return {
    subAccountIndex: nextIndex,
    isExistingPosition: false,
    subAccountAddress: deriveSubAccountAddress(userAddress, nextIndex),
    existingCollateralVaults: [],
  };
}

/**
 * Check if a collateral is already in an existing position.
 * Used to determine if we need to add collateral or if it's already there.
 *
 * @param refinanceTarget - The result from findEulerRefinanceSubAccount
 * @param collateralVaultAddress - The collateral vault to check
 * @returns true if the collateral is already in the position
 */
export function isCollateralInExistingPosition(
  refinanceTarget: EulerRefinanceSubAccount,
  collateralVaultAddress: string
): boolean {
  if (!refinanceTarget.isExistingPosition || !refinanceTarget.existingCollateralVaults) {
    return false;
  }
  const lowerAddr = collateralVaultAddress.toLowerCase();
  return refinanceTarget.existingCollateralVaults.some(
    addr => addr.toLowerCase() === lowerAddr
  );
}
