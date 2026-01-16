import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import type {
  EulerVaultInfo,
  EulerCollateralPosition,
  EulerPositionGroup,
} from "~~/app/api/euler/[chainId]/positions/route";

// Euler vault ABI for balance queries
const EULER_VAULT_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "debtOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "asset",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// Re-export API types for convenience
export type { EulerVaultInfo, EulerCollateralPosition, EulerPositionGroup };

// Enriched types with balance data
export interface EulerCollateralWithBalance extends EulerCollateralPosition {
  balance: bigint; // Supply balance (shares)
}

export interface EulerDebtWithBalance {
  vault: EulerVaultInfo;
  balance: bigint; // Debt balance
}

export interface EulerPositionGroupWithBalances {
  subAccount: string;
  isMainAccount: boolean;
  debt: EulerDebtWithBalance | null;
  collaterals: EulerCollateralWithBalance[];
}

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

interface PositionsApiResponse {
  positions: EulerPosition[];
  positionGroups: EulerPositionGroup[];
}

async function fetchEulerPositions(
  chainId: number,
  userAddress: string
): Promise<PositionsApiResponse> {
  try {
    const response = await fetch(
      `/api/euler/${chainId}/positions?user=${userAddress}`
    );
    if (!response.ok) {
      console.error(`[useEulerLendingPositions] Positions API error: ${response.status}`);
      return { positions: [], positionGroups: [] };
    }
    const data = await response.json();
    return {
      positions: data?.positions || [],
      positionGroups: data?.positionGroups || [],
    };
  } catch (error) {
    console.error("[useEulerLendingPositions] Failed to fetch positions:", error);
    return { positions: [], positionGroups: [] };
  }
}

// ============ Hook Result ============

interface UseEulerLendingPositionsResult {
  // All vaults available on this chain
  vaults: EulerVault[];
  // User positions as rows (legacy format)
  rows: EulerPositionRow[];
  // Grouped positions (1 debt + N collaterals per sub-account)
  positionGroups: EulerPositionGroup[];
  // Enriched grouped positions with on-chain balance data
  enrichedPositionGroups: EulerPositionGroupWithBalances[];
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
    data: positionsData,
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

  // Extract position groups from API response
  const positionGroups = positionsData?.positionGroups ?? [];

  // Get vault addresses for on-chain balance queries
  const vaultAddresses = useMemo(() => {
    const positions = positionsData?.positions ?? [];
    return positions
      .filter((pos) => pos.supplyShares !== "0" || pos.borrowShares !== "0")
      .map((pos) => pos.vault.address as `0x${string}`);
  }, [positionsData]);

  // Build multicall contracts for balance queries
  // For each vault: balanceOf(user), debtOf(user)
  const balanceContracts = useMemo(() => {
    if (!userAddress || vaultAddresses.length === 0) return [];

    const contracts: Array<{
      address: `0x${string}`;
      abi: typeof EULER_VAULT_ABI;
      functionName: "balanceOf" | "debtOf";
      args: [`0x${string}`];
      chainId: number;
    }> = [];

    for (const vaultAddr of vaultAddresses) {
      // balanceOf - returns shares
      contracts.push({
        address: vaultAddr,
        abi: EULER_VAULT_ABI,
        functionName: "balanceOf",
        args: [userAddress as `0x${string}`],
        chainId,
      });
      // debtOf - returns debt in asset units
      contracts.push({
        address: vaultAddr,
        abi: EULER_VAULT_ABI,
        functionName: "debtOf",
        args: [userAddress as `0x${string}`],
        chainId,
      });
    }

    return contracts;
  }, [userAddress, vaultAddresses, chainId]);

  // Fetch on-chain balances
  const { data: balanceResults } = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: balanceContracts.length > 0,
      staleTime: 30_000,
    },
  });

  // Parse balance results into a map: vaultAddress -> { shares, debt }
  const balanceMap = useMemo(() => {
    const map = new Map<string, { shares: bigint; debt: bigint }>();
    if (!balanceResults || balanceResults.length === 0) return map;

    for (let i = 0; i < vaultAddresses.length; i++) {
      const sharesResult = balanceResults[i * 2];
      const debtResult = balanceResults[i * 2 + 1];

      const shares = sharesResult?.status === "success" ? (sharesResult.result as bigint) : 0n;
      const debt = debtResult?.status === "success" ? (debtResult.result as bigint) : 0n;

      map.set(vaultAddresses[i].toLowerCase(), { shares, debt });
    }

    return map;
  }, [balanceResults, vaultAddresses]);

  // Enrich position groups with on-chain balance data
  const enrichedPositionGroups = useMemo<EulerPositionGroupWithBalances[]>(() => {
    if (!positionGroups.length) return [];

    return positionGroups.map((group): EulerPositionGroupWithBalances => {
      // Enrich collaterals with balance data
      const enrichedCollaterals: EulerCollateralWithBalance[] = group.collaterals.map((col) => {
        const balanceData = balanceMap.get(col.vault.address.toLowerCase());
        return {
          ...col,
          balance: balanceData?.shares ?? 0n,
        };
      });

      // Enrich debt with balance data
      const enrichedDebt: EulerDebtWithBalance | null = group.debt
        ? {
            vault: group.debt.vault,
            balance: balanceMap.get(group.debt.vault.address.toLowerCase())?.debt ?? 0n,
          }
        : null;

      return {
        subAccount: group.subAccount,
        isMainAccount: group.isMainAccount,
        debt: enrichedDebt,
        collaterals: enrichedCollaterals,
      };
    });
  }, [positionGroups, balanceMap]);

  // Build position rows with on-chain balances
  const rows = useMemo<EulerPositionRow[]>(() => {
    const positions = positionsData?.positions ?? [];
    if (!positions.length) return [];

    return positions
      .filter((pos) => pos.supplyShares !== "0" || pos.borrowShares !== "0")
      .map((pos): EulerPositionRow => {
        const vault = pos.vault;
        const decimals = vault.asset.decimals;

        // Get on-chain balances (shares for supply, debt for borrow)
        const onChainData = balanceMap.get(vault.address.toLowerCase());
        // For supply, shares ARE the balance (ERC4626 vault shares)
        // We'd need convertToAssets to get actual asset amount, but shares work for display
        const supplyBalance = onChainData?.shares ?? 0n;
        const borrowBalance = onChainData?.debt ?? 0n;

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
          supplyApy: (vault.supplyApy ?? 0) * 100,
          borrowApy: (vault.borrowApy ?? 0) * 100,
          hasSupply: supplyBalance > 0n,
          hasDebt: borrowBalance > 0n,
        };
      });
  }, [positionsData, balanceMap]);

  // Convert to ProtocolPosition format for compatibility
  const suppliedPositions = useMemo<ProtocolPosition[]>(() => {
    return rows
      .filter((r) => r.hasSupply)
      .map((row) => {
        // Handle unknown symbols - use "default" for logo lookup
        const symbol = row.assetSymbol === "???" ? "unknown" : row.assetSymbol;
        const icon = symbol === "unknown" ? "/logos/default.svg" : tokenNameToLogo(symbol.toLowerCase());
        return {
          icon,
          name: symbol,
          balance: row.supplyBalanceUsd ?? 0,
          tokenBalance: row.supplyBalance,
          currentRate: row.supplyApy ?? 0,
          tokenAddress: row.vault.asset.address,
          tokenDecimals: row.supplyDecimals,
          tokenPrice: 0n, // Would need price feed
          tokenSymbol: symbol,
        };
      });
  }, [rows]);

  const borrowedPositions = useMemo<ProtocolPosition[]>(() => {
    return rows
      .filter((r) => r.hasDebt)
      .map((row) => {
        // Handle unknown symbols - use "default" for logo lookup
        const symbol = row.assetSymbol === "???" ? "unknown" : row.assetSymbol;
        const icon = symbol === "unknown" ? "/logos/default.svg" : tokenNameToLogo(symbol.toLowerCase());
        return {
          icon,
          name: symbol,
          balance: row.borrowBalanceUsd ?? 0,
          tokenBalance: row.borrowBalance,
          currentRate: row.borrowApy ?? 0,
          tokenAddress: row.vault.asset.address,
          tokenDecimals: row.borrowDecimals,
          tokenPrice: 0n, // Would need price feed
          tokenSymbol: symbol,
        };
      });
  }, [rows]);

  const isUpdating =
    (isFetchingVaults && !isLoadingVaults) ||
    (isFetchingPositions && !isLoadingPositions);

  return {
    vaults,
    rows,
    positionGroups,
    enrichedPositionGroups,
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
