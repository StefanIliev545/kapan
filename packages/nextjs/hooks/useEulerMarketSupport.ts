import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EulerVaultResponse, CollateralInfo } from "~~/app/api/euler/[chainId]/vaults/route";

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

// ============ API Fetcher ============

async function fetchEulerVaults(chainId: number): Promise<EulerVaultResponse[]> {
  try {
    const params = new URLSearchParams({
      first: "500",
    });

    const response = await fetch(`/api/euler/${chainId}/vaults?${params.toString()}`);
    if (!response.ok) {
      console.error(`[useEulerMarketSupport] Vaults API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data?.vaults || [];
  } catch (error) {
    console.error("[useEulerMarketSupport] Failed to fetch vaults:", error);
    return [];
  }
}

// ============ Helper Functions ============

/**
 * Normalize symbol for comparison (case-insensitive, handles wrapped variants)
 */
function normalizeSymbol(symbol: string): string {
  const s = symbol.toLowerCase().trim();
  // Map common variants
  if (s === "weth" || s === "eth") return "eth";
  if (s === "wbtc" || s === "btc") return "btc";
  if (s === "wsteth" || s === "steth") return "steth";
  return s;
}

/**
 * Check if a vault's collateral matches a user's collateral
 */
function collateralMatches(
  vaultCollaterals: CollateralInfo[],
  userCollateralSymbol: string
): boolean {
  const normalized = normalizeSymbol(userCollateralSymbol);
  return vaultCollaterals.some(c => {
    const collateralNormalized = normalizeSymbol(c.tokenSymbol);
    return collateralNormalized === normalized;
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
  // Fetch all vaults for this chain (with caching)
  const {
    data: allVaults,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["euler-vaults-support", chainId],
    queryFn: () => fetchEulerVaults(chainId),
    enabled: enabled && !!chainId,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000, // 10 min garbage collection
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

    // Build lookup: collateral address -> symbol
    const addrToSymbol: Record<string, string> = {};
    for (let i = 0; i < collateralAddresses.length; i++) {
      addrToSymbol[collateralAddresses[i].toLowerCase()] = collateralSymbols[i] || "";
    }

    // Group by user's collateral
    const byCollateral: Record<string, EulerVaultResponse[]> = {};
    const supported: Record<string, boolean> = {};

    for (const collateralAddr of collateralAddresses) {
      const addr = collateralAddr.toLowerCase();
      const symbol = addrToSymbol[addr];
      if (!symbol) continue;

      // Find vaults that accept this collateral
      const matchingVaults = vaultsWithMatchingLoan.filter(v =>
        collateralMatches(v.collaterals, symbol)
      );

      console.log("[useEulerMarketSupport] Checking collateral:", symbol, "addr:", addr, "matchingVaults:", matchingVaults.length);
      if (matchingVaults.length > 0) {
        console.log("[useEulerMarketSupport] Found vaults for", symbol, ":", matchingVaults.map(v => ({ address: v.address, symbol: v.symbol, collaterals: v.collaterals.map(c => c.tokenSymbol) })));
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
