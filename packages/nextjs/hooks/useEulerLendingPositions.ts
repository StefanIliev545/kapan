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
  // LTV and liquidity functions
  {
    name: "LTVBorrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "collateral", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    name: "LTVLiquidation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "collateral", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    name: "accountLiquidity",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "liquidation", type: "bool" },
    ],
    outputs: [
      { name: "collateralValue", type: "uint256" },
      { name: "liabilityValue", type: "uint256" },
    ],
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

/** LTV configuration for a collateral */
export interface EulerCollateralLtv {
  collateralVault: string;
  /** Borrow LTV in percentage (e.g., 80 = 80%) */
  borrowLtv: number;
  /** Liquidation LTV in percentage (e.g., 90 = 90%) */
  liquidationLtv: number;
}

/** Account liquidity data from on-chain */
export interface EulerAccountLiquidity {
  /** Total collateral value adjusted by liquidation LTV (18 decimals) */
  collateralValueLiquidation: bigint;
  /** Total collateral value adjusted by borrow LTV (18 decimals) */
  collateralValueBorrow: bigint;
  /** Total liability/debt value (18 decimals) */
  liabilityValue: bigint;
  /** Liquidation health: collateralValueLiquidation / liabilityValue (< 1.0 = liquidatable) */
  liquidationHealth: number;
  /** LTV configs for each collateral in this position */
  collateralLtvs: EulerCollateralLtv[];
  /** Effective LLTV for the position (weighted or min if multiple collaterals) */
  effectiveLltv: number;
  /** Effective max LTV for borrowing */
  effectiveMaxLtv: number;
  /** Current LTV: calculated from actual position values */
  currentLtv: number;
}

export interface EulerPositionGroupWithBalances {
  subAccount: string;
  isMainAccount: boolean;
  debt: EulerDebtWithBalance | null;
  collaterals: EulerCollateralWithBalance[];
  /** Account liquidity/health data (only available if there's debt) */
  liquidity: EulerAccountLiquidity | null;
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

  // Build liquidity and LTV queries for position groups with debt
  // For each group: accountLiquidity(true), accountLiquidity(false), and LTV configs per collateral
  const liquidityContracts = useMemo(() => {
    if (!positionGroups.length) return [];

    type LiquidityContract = {
      address: `0x${string}`;
      abi: typeof EULER_VAULT_ABI;
      functionName: "accountLiquidity" | "LTVBorrow" | "LTVLiquidation";
      args: [`0x${string}`, boolean] | [`0x${string}`];
      chainId: number;
    };

    const contracts: LiquidityContract[] = [];

    for (const group of positionGroups) {
      if (group.debt) {
        const borrowVault = group.debt.vault.address as `0x${string}`;
        const subAccount = group.subAccount as `0x${string}`;

        // accountLiquidity(subAccount, true) - liquidation mode
        contracts.push({
          address: borrowVault,
          abi: EULER_VAULT_ABI,
          functionName: "accountLiquidity",
          args: [subAccount, true],
          chainId,
        });

        // accountLiquidity(subAccount, false) - borrow mode
        contracts.push({
          address: borrowVault,
          abi: EULER_VAULT_ABI,
          functionName: "accountLiquidity",
          args: [subAccount, false],
          chainId,
        });

        // LTV configs for each collateral
        for (const col of group.collaterals) {
          const collateralVault = col.vault.address as `0x${string}`;

          // LTVBorrow(collateralVault)
          contracts.push({
            address: borrowVault,
            abi: EULER_VAULT_ABI,
            functionName: "LTVBorrow",
            args: [collateralVault],
            chainId,
          });

          // LTVLiquidation(collateralVault)
          contracts.push({
            address: borrowVault,
            abi: EULER_VAULT_ABI,
            functionName: "LTVLiquidation",
            args: [collateralVault],
            chainId,
          });
        }
      }
    }

    return contracts;
  }, [positionGroups, chainId]);

  // Fetch liquidity and LTV data
  const { data: liquidityResults } = useReadContracts({
    contracts: liquidityContracts,
    query: {
      enabled: liquidityContracts.length > 0,
      staleTime: 30_000,
    },
  });

  // Parse liquidity results into a map with all the data we need
  const liquidityMap = useMemo(() => {
    const map = new Map<string, {
      collateralValueLiq: bigint;
      liabilityValueLiq: bigint;
      collateralValueBorrow: bigint;
      liabilityValueBorrow: bigint;
      collateralLtvs: EulerCollateralLtv[];
    }>();
    if (!liquidityResults || liquidityResults.length === 0) return map;

    let resultIndex = 0;
    for (const group of positionGroups) {
      if (group.debt && resultIndex < liquidityResults.length) {
        // accountLiquidity(true) - liquidation mode
        const liqResult = liquidityResults[resultIndex];
        resultIndex++;

        // accountLiquidity(false) - borrow mode
        const borrowResult = liquidityResults[resultIndex];
        resultIndex++;

        let collateralValueLiq = 0n;
        let liabilityValueLiq = 0n;
        let collateralValueBorrow = 0n;
        let liabilityValueBorrow = 0n;

        if (liqResult?.status === "success") {
          [collateralValueLiq, liabilityValueLiq] = liqResult.result as [bigint, bigint];
        }
        if (borrowResult?.status === "success") {
          [collateralValueBorrow, liabilityValueBorrow] = borrowResult.result as [bigint, bigint];
        }

        // Parse LTV configs for each collateral
        const collateralLtvs: EulerCollateralLtv[] = [];
        for (const col of group.collaterals) {
          const borrowLtvResult = liquidityResults[resultIndex];
          resultIndex++;
          const liqLtvResult = liquidityResults[resultIndex];
          resultIndex++;

          const borrowLtv = borrowLtvResult?.status === "success"
            ? Number(borrowLtvResult.result as bigint) / 100 // 1e4 scale to percentage
            : 0;
          const liquidationLtv = liqLtvResult?.status === "success"
            ? Number(liqLtvResult.result as bigint) / 100 // 1e4 scale to percentage
            : 0;

          collateralLtvs.push({
            collateralVault: col.vault.address,
            borrowLtv,
            liquidationLtv,
          });
        }

        map.set(group.subAccount.toLowerCase(), {
          collateralValueLiq,
          liabilityValueLiq,
          collateralValueBorrow,
          liabilityValueBorrow,
          collateralLtvs,
        });
      }
    }

    return map;
  }, [liquidityResults, positionGroups]);

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

  // Enrich position groups with on-chain balance and liquidity data
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

      // Get liquidity data for this position group
      let liquidity: EulerAccountLiquidity | null = null;
      if (enrichedDebt) {
        const liquidityData = liquidityMap.get(group.subAccount.toLowerCase());
        if (liquidityData && liquidityData.liabilityValueLiq > 0n) {
          const {
            collateralValueLiq,
            liabilityValueLiq,
            collateralValueBorrow,
            collateralLtvs,
          } = liquidityData;

          // Liquidation health: collateralValueLiq / liabilityValueLiq
          // If < 1.0, position is liquidatable
          const liquidationHealth = Number(collateralValueLiq) / Number(liabilityValueLiq);

          // Calculate effective LLTV and max LTV from collateral configs
          // Use minimum LLTV if multiple collaterals (most conservative)
          let effectiveLltv = 100;
          let effectiveMaxLtv = 100;
          for (const ltv of collateralLtvs) {
            if (ltv.liquidationLtv > 0 && ltv.liquidationLtv < effectiveLltv) {
              effectiveLltv = ltv.liquidationLtv;
            }
            if (ltv.borrowLtv > 0 && ltv.borrowLtv < effectiveMaxLtv) {
              effectiveMaxLtv = ltv.borrowLtv;
            }
          }

          // Current LTV calculation:
          // Raw collateral value = collateralValueLiq / effectiveLltv * 100
          // Current LTV = liabilityValue / rawCollateralValue * 100
          // Simplified: currentLtv = (liabilityValue / collateralValueLiq) * effectiveLltv
          const currentLtv = collateralValueLiq > 0n
            ? (Number(liabilityValueLiq) / Number(collateralValueLiq)) * effectiveLltv
            : 0;

          liquidity = {
            collateralValueLiquidation: collateralValueLiq,
            collateralValueBorrow,
            liabilityValue: liabilityValueLiq,
            liquidationHealth,
            collateralLtvs,
            effectiveLltv,
            effectiveMaxLtv,
            currentLtv,
          };
        }
      }

      return {
        subAccount: group.subAccount,
        isMainAccount: group.isMainAccount,
        debt: enrichedDebt,
        collaterals: enrichedCollaterals,
        liquidity,
      };
    });
  }, [positionGroups, balanceMap, liquidityMap]);

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
