import { useMemo } from "react";
import type { CollateralInfo } from "~~/app/api/euler/[chainId]/vaults/route";
import { useEulerVaultsQuery, type EulerVaultResponse } from "~~/utils/euler/vaultApi";

// ============ Types ============

export interface UseEulerMarketSupportParams {
  chainId: number;
  loanTokenAddress: string; // The debt token being refinanced
  collateralAddresses: string[]; // All user's collaterals (underlying token addresses)
  collateralSymbols: string[]; // Symbols of user's collaterals for matching
  enabled?: boolean; // Only fetch when Euler is selected
}

export interface UseEulerMarketSupportResult {
  // Map of collateral address (lowercase) → boolean (true if at least one vault accepts it)
  supportedCollaterals: Record<string, boolean>;
  // Map of collateral address (lowercase) → EulerVaultResponse[] (all compatible vaults)
  vaultsByCollateral: Record<string, EulerVaultResponse[]>;
  // All vaults for the loan token (unfiltered by collateral)
  allVaultsForLoanToken: EulerVaultResponse[];
  // Loading state
  isLoading: boolean;
  // Error
  error: Error | null;
}

// ============ Helper Functions ============

/**
 * Check if a vault's collateral matches a user's collateral by address
 * Falls back to symbol matching if address not available
 */
function collateralMatchesByAddress(
  vaultCollaterals: CollateralInfo[],
  userCollateralAddress: string
): boolean {
  const normalizedUserAddr = userCollateralAddress.toLowerCase();
  return vaultCollaterals.some(c => {
    // Primary: match by underlying token address
    if (c.tokenAddress && c.tokenAddress.toLowerCase() === normalizedUserAddr) {
      return true;
    }
    return false;
  });
}

// ============ Hook ============

export function useEulerMarketSupport({
  chainId,
  loanTokenAddress,
  collateralAddresses,
  collateralSymbols,
  enabled = true,
}: UseEulerMarketSupportParams): UseEulerMarketSupportResult {
  // Fetch all vaults for this chain (with caching via shared hook)
  const {
    data: allVaults,
    isLoading,
    error,
  } = useEulerVaultsQuery(chainId, {
    enabled: enabled && !!chainId,
  });

  // Filter and group vaults by user's collateral
  const { supportedCollaterals, vaultsByCollateral, allVaultsForLoanToken } = useMemo(() => {
    console.log("[useEulerMarketSupport] Computing - allVaults:", allVaults?.length, "loanTokenAddress:", loanTokenAddress);
    console.log("[useEulerMarketSupport] collateralAddresses:", collateralAddresses);
    console.log("[useEulerMarketSupport] collateralSymbols:", collateralSymbols);

    if (!allVaults || !loanTokenAddress) {
      console.log("[useEulerMarketSupport] Early return - no vaults or no loanToken");
      return { supportedCollaterals: {}, vaultsByCollateral: {}, allVaultsForLoanToken: [] };
    }

    const loanAddr = loanTokenAddress.toLowerCase();

    // First, filter vaults that match the loan token (debt asset)
    const vaultsWithMatchingLoan = allVaults.filter(
      v => v.asset.address.toLowerCase() === loanAddr
    );
    console.log("[useEulerMarketSupport] Vaults matching loan token:", vaultsWithMatchingLoan.length, "for loanAddr:", loanAddr);

    // Build lookup: collateral address -> symbol (for logging)
    const addrToSymbol: Record<string, string> = {};
    for (let i = 0; i < collateralAddresses.length; i++) {
      addrToSymbol[collateralAddresses[i].toLowerCase()] = collateralSymbols[i] || "";
    }

    // Group by user's collateral - match by underlying token address
    const byCollateral: Record<string, EulerVaultResponse[]> = {};
    const supported: Record<string, boolean> = {};

    for (const collateralAddr of collateralAddresses) {
      const addr = collateralAddr.toLowerCase();
      const symbol = addrToSymbol[addr] || "???";

      // Find vaults that accept this collateral (by token address)
      const matchingVaults = vaultsWithMatchingLoan.filter(v =>
        collateralMatchesByAddress(v.collaterals, addr)
      );

      console.log("[useEulerMarketSupport] Checking collateral:", symbol, "addr:", addr, "matchingVaults:", matchingVaults.length);
      if (matchingVaults.length > 0) {
        console.log("[useEulerMarketSupport] Found vaults for", symbol, ":", matchingVaults.map(v => ({ address: v.address, symbol: v.symbol, collaterals: v.collaterals.map(c => ({ symbol: c.tokenSymbol, addr: c.tokenAddress })) })));
        byCollateral[addr] = matchingVaults;
        supported[addr] = true;
      }
    }
    console.log("[useEulerMarketSupport] Final result - supported:", Object.keys(supported), "byCollateral keys:", Object.keys(byCollateral));

    // Sort vaults within each collateral group by borrow APY (lowest first - best for borrower)
    for (const addr of Object.keys(byCollateral)) {
      byCollateral[addr].sort((a, b) => a.borrowApy - b.borrowApy);
    }

    return {
      supportedCollaterals: supported,
      vaultsByCollateral: byCollateral,
      allVaultsForLoanToken: vaultsWithMatchingLoan,
    };
  }, [allVaults, loanTokenAddress, collateralAddresses, collateralSymbols]);

  return {
    supportedCollaterals,
    vaultsByCollateral,
    allVaultsForLoanToken,
    isLoading,
    error: error as Error | null,
  };
}
