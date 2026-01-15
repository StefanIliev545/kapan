import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// ============ Types ============

export interface EulerVaultAsset {
  address: string;
  symbol: string;
  decimals: number;
}

export interface EulerCollateralInfo {
  vaultAddress: string;
  vaultSymbol: string;
  tokenSymbol: string;
}

export interface EulerVault {
  id: string;
  address: string;
  name: string;
  symbol: string;
  asset: EulerVaultAsset;
  totalSupply: string;
  totalBorrows: string;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
  collateralCount: number;
  collaterals: EulerCollateralInfo[];
  creator: string;
}

export interface EulerPositionVault {
  address: string;
  name: string;
  symbol: string;
  asset: EulerVaultAsset;
  supplyApy: number;
  borrowApy: number;
}

export interface EulerPosition {
  vault: EulerPositionVault;
  supplyShares: string;
  borrowShares: string;
}

// ============ Vault Context (for lending instructions) ============

export interface EulerVaultContext {
  borrowVault: string;
  collateralVault: string;
}

export function createEulerContext(borrowVault: string, collateralVault: string): EulerVaultContext {
  return {
    borrowVault,
    collateralVault,
  };
}

// ============ Position Row (for display) ============

export interface EulerPositionRow {
  key: string;
  vault: EulerPositionVault;
  context: EulerVaultContext;
  assetSymbol: string;
  // Supply position
  supplyBalance: bigint;
  supplyBalanceUsd: number;
  supplyDecimals: number;
  // Borrow position
  borrowBalance: bigint;
  borrowBalanceUsd: number;
  borrowDecimals: number;
  // Rates
  supplyApy: number;
  borrowApy: number;
  // Display
  hasSupply: boolean;
  hasDebt: boolean;
}

// ============ API Fetchers ============

async function fetchEulerVaults(chainId: number, search?: string): Promise<EulerVault[]> {
  try {
    const params = new URLSearchParams({
      first: "500",
    });

    if (search && search.trim().length > 0) {
      params.set("search", search.trim());
    }

    const response = await fetch(`/api/euler/${chainId}/vaults?${params.toString()}`);
    if (!response.ok) {
      console.error(`[useEulerLendingPositions] Vaults API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const vaults: EulerVault[] = data?.vaults || [];

    console.log(`[useEulerLendingPositions] Fetched ${vaults.length} vaults`);
    return vaults;
  } catch (error) {
    console.error("[useEulerLendingPositions] Failed to fetch vaults:", error);
    return [];
  }
}

async function fetchEulerPositions(
  chainId: number,
  userAddress: string
): Promise<EulerPosition[]> {
  try {
    const response = await fetch(
      `/api/euler/${chainId}/positions?user=${userAddress}`
    );
    if (!response.ok) {
      console.error(`[useEulerLendingPositions] Positions API error: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data?.positions || [];
  } catch (error) {
    console.error("[useEulerLendingPositions] Failed to fetch positions:", error);
    return [];
  }
}

// ============ Hook Result ============

interface UseEulerLendingPositionsResult {
  // All vaults available on this chain
  vaults: EulerVault[];
  // User positions as rows
  rows: EulerPositionRow[];
  // Positions with supply (for supply display)
  suppliedPositions: ProtocolPosition[];
  // Positions with debt (for borrow display)
  borrowedPositions: ProtocolPosition[];
  // Loading states
  isLoadingVaults: boolean;
  isLoadingPositions: boolean;
  hasLoadedOnce: boolean;
  isUpdating: boolean;
  // Refetch
  refetchPositions: () => void;
  refetchVaults: () => void;
  // Errors
  vaultsError: unknown;
  positionsError: unknown;
}

// ============ Main Hook ============

export function useEulerLendingPositions(
  chainId: number,
  userAddress: string | undefined
): UseEulerLendingPositionsResult {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Fetch vaults
  const {
    data: vaults = [],
    isLoading: isLoadingVaults,
    isFetching: isFetchingVaults,
    error: vaultsError,
    refetch: refetchVaults,
  } = useQuery({
    queryKey: ["euler-vaults", chainId],
    queryFn: () => fetchEulerVaults(chainId),
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
    enabled: chainId > 0,
  });

  // Fetch user positions
  const {
    data: positions = [],
    isLoading: isLoadingPositions,
    isFetching: isFetchingPositions,
    error: positionsError,
    refetch: refetchPositions,
  } = useQuery({
    queryKey: ["euler-positions", chainId, userAddress],
    queryFn: () => fetchEulerPositions(chainId, userAddress as string),
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: false,
    enabled: chainId > 0 && !!userAddress,
  });

  // Track first load
  useEffect(() => {
    if (!isLoadingPositions && !hasLoadedOnce && userAddress) {
      setHasLoadedOnce(true);
    }
  }, [isLoadingPositions, hasLoadedOnce, userAddress]);

  // Reset on address or chainId change
  useEffect(() => {
    setHasLoadedOnce(false);
  }, [userAddress, chainId]);

  // Build position rows
  const rows = useMemo<EulerPositionRow[]>(() => {
    if (!positions.length) return [];

    return positions
      .filter((pos) => pos.supplyShares !== "0" || pos.borrowShares !== "0")
      .map((pos): EulerPositionRow => {
        const vault = pos.vault;
        const decimals = vault.asset.decimals;

        // For now, use placeholder balances (subgraph returns shares, not assets)
        // In production, you'd convert shares to assets using vault's exchange rate
        const supplyBalance = BigInt(pos.supplyShares);
        const borrowBalance = BigInt(pos.borrowShares);

        // Placeholder USD values (would need price feed integration)
        const supplyBalanceUsd = 0;
        const borrowBalanceUsd = 0;

        // Context uses the vault as both borrow and collateral by default
        // In multi-vault scenarios, this would be different
        const context = createEulerContext(vault.address, vault.address);

        return {
          key: vault.address,
          vault,
          context,
          assetSymbol: vault.asset.symbol,
          supplyBalance,
          supplyBalanceUsd,
          supplyDecimals: decimals,
          borrowBalance,
          borrowBalanceUsd,
          borrowDecimals: decimals,
          supplyApy: vault.supplyApy * 100,
          borrowApy: vault.borrowApy * 100,
          hasSupply: supplyBalance > 0n,
          hasDebt: borrowBalance > 0n,
        };
      });
  }, [positions]);

  // Convert to ProtocolPosition format for compatibility
  const suppliedPositions = useMemo<ProtocolPosition[]>(() => {
    return rows
      .filter((r) => r.hasSupply)
      .map((row) => ({
        icon: tokenNameToLogo(row.assetSymbol.toLowerCase()),
        name: row.assetSymbol,
        balance: row.supplyBalanceUsd,
        tokenBalance: row.supplyBalance,
        currentRate: row.supplyApy,
        tokenAddress: row.vault.asset.address,
        tokenDecimals: row.supplyDecimals,
        tokenPrice: 0n, // Would need price feed
        tokenSymbol: row.assetSymbol,
      }));
  }, [rows]);

  const borrowedPositions = useMemo<ProtocolPosition[]>(() => {
    return rows
      .filter((r) => r.hasDebt)
      .map((row) => ({
        icon: tokenNameToLogo(row.assetSymbol.toLowerCase()),
        name: row.assetSymbol,
        balance: row.borrowBalanceUsd,
        tokenBalance: row.borrowBalance,
        currentRate: row.borrowApy,
        tokenAddress: row.vault.asset.address,
        tokenDecimals: row.borrowDecimals,
        tokenPrice: 0n, // Would need price feed
        tokenSymbol: row.assetSymbol,
      }));
  }, [rows]);

  const isUpdating =
    (isFetchingVaults && !isLoadingVaults) ||
    (isFetchingPositions && !isLoadingPositions);

  return {
    vaults,
    rows,
    suppliedPositions,
    borrowedPositions,
    isLoadingVaults,
    isLoadingPositions,
    hasLoadedOnce,
    isUpdating,
    refetchPositions: useCallback(() => refetchPositions(), [refetchPositions]),
    refetchVaults: useCallback(() => refetchVaults(), [refetchVaults]),
    vaultsError,
    positionsError,
  };
}

// ============ Vaults-only Hook (for vault selection UI) ============

export function useEulerVaults(chainId: number, search?: string) {
  const normalizedSearch = search?.trim() || undefined;

  const {
    data: vaults = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["euler-vaults", chainId, normalizedSearch],
    queryFn: () => fetchEulerVaults(chainId, normalizedSearch),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: chainId > 0,
  });

  // Filter to only vaults with supply
  const validVaults = useMemo(() => {
    return vaults.filter(
      (v) => parseFloat(v.totalSupply) > 0
    );
  }, [vaults]);

  // Group by asset symbol for display
  const vaultsByAsset = useMemo(() => {
    const groups = new Map<string, EulerVault[]>();
    validVaults.forEach((v) => {
      const key = v.asset.symbol;
      const existing = groups.get(key) || [];
      existing.push(v);
      groups.set(key, existing);
    });
    return groups;
  }, [validVaults]);

  return {
    vaults: validVaults,
    vaultsByAsset,
    isLoading,
    error,
    refetch,
  };
}
