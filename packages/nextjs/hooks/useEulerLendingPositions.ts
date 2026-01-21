import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { qk } from "~~/lib/queryKeys";
import type {
  EulerVaultInfo,
  EulerCollateralPosition,
  EulerPositionGroup,
} from "~~/app/api/euler/[chainId]/positions/route";
import { fetchEulerVaults as fetchEulerVaultsApi } from "~~/utils/euler/vaultApi";
import { getEffectiveChainId } from "~~/utils/forkChain";

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
    // ERC-4626: Returns max assets withdrawable by account (= convertToAssets(balanceOf(account)))
    // This gives us the underlying asset balance directly, not shares
    name: "maxWithdraw",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
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
  balance: bigint; // Supply balance in underlying assets (from maxWithdraw)
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

// fetchEulerVaults is imported from ~~/utils/euler/vaultApi

interface PositionsApiResponse {
  positions: EulerPosition[];
  positionGroups: EulerPositionGroup[];
}

async function fetchEulerPositions(
  chainId: number,
  userAddress: string
): Promise<PositionsApiResponse> {
  try {
    // For hardhat, pass the forked chain ID so the API uses the correct subgraph
    const params = new URLSearchParams({ user: userAddress });
    if (chainId === 31337) {
      const forkChainId = getEffectiveChainId(chainId);
      params.set("forkChainId", String(forkChainId));
    }

    const response = await fetch(
      `/api/euler/${chainId}/positions?${params.toString()}`
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
    queryKey: qk.euler.vaults(chainId),
    queryFn: () => fetchEulerVaultsApi(chainId),
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
    queryKey: qk.euler.positions(chainId, userAddress as string),
    queryFn: () => fetchEulerPositions(chainId, userAddress as string),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Auto-refresh every 60 seconds
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

  // Extract position groups from API response - memoized to ensure stable reference
  // and avoid dependency warnings in downstream useMemo hooks
  const positionGroups = useMemo(() => {
    return positionsData?.positionGroups ?? [];
  }, [positionsData?.positionGroups]);

  // Build multicall contracts for balance queries using sub-account addresses
  // IMPORTANT: Euler V2 uses sub-accounts, so we must query balances
  // using the sub-account address, NOT the main user address!
  // NOTE: We query balanceOf (shares) first, then convertToAssets in a second batch
  const balanceContracts = useMemo(() => {
    if (!positionGroups.length) return [];

    const contracts: Array<{
      address: `0x${string}`;
      abi: typeof EULER_VAULT_ABI;
      functionName: "balanceOf" | "debtOf";
      args: [`0x${string}`];
      chainId: number;
      // Track which sub-account and vault type for parsing results
      _meta: { subAccount: string; vaultAddress: string; type: "collateral" | "debt" };
    }> = [];

    for (const group of positionGroups) {
      const subAccount = group.subAccount as `0x${string}`;

      // Query balanceOf for each collateral vault (returns shares)
      for (const col of group.collaterals) {
        contracts.push({
          address: col.vault.address as `0x${string}`,
          abi: EULER_VAULT_ABI,
          functionName: "balanceOf",
          args: [subAccount],
          chainId,
          _meta: { subAccount: group.subAccount, vaultAddress: col.vault.address, type: "collateral" },
        });
      }

      // Query debtOf for debt vault (already returns underlying asset amount)
      if (group.debt) {
        contracts.push({
          address: group.debt.vault.address as `0x${string}`,
          abi: EULER_VAULT_ABI,
          functionName: "debtOf",
          args: [subAccount],
          chainId,
          _meta: { subAccount: group.subAccount, vaultAddress: group.debt.vault.address, type: "debt" },
        });
      }
    }

    return contracts;
  }, [positionGroups, chainId]);

  // Fetch on-chain balances (shares for collateral, debt amount for debt)
  const { data: balanceResults } = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: balanceContracts.length > 0,
      staleTime: 30_000,
    },
  });

  // Build convertToAssets contracts to convert shares to underlying assets
  // This runs after we have the shares from balanceResults
  const convertContracts = useMemo(() => {
    if (!balanceResults || !balanceContracts.length) return [];

    const contracts: Array<{
      address: `0x${string}`;
      abi: typeof EULER_VAULT_ABI;
      functionName: "convertToAssets";
      args: [bigint];
      chainId: number;
      _meta: { subAccount: string; vaultAddress: string };
    }> = [];

    for (let i = 0; i < balanceResults.length; i++) {
      const result = balanceResults[i];
      const contract = balanceContracts[i];
      if (!contract?._meta || contract._meta.type !== "collateral") continue;

      // Get shares from result
      const shares = result?.status === "success" ? (result.result as bigint) : 0n;
      if (shares === 0n) continue;

      contracts.push({
        address: contract.address,
        abi: EULER_VAULT_ABI,
        functionName: "convertToAssets",
        args: [shares],
        chainId,
        _meta: { subAccount: contract._meta.subAccount, vaultAddress: contract._meta.vaultAddress },
      });
    }

    return contracts;
  }, [balanceResults, balanceContracts, chainId]);

  // Fetch converted asset amounts
  const { data: convertResults } = useReadContracts({
    contracts: convertContracts,
    query: {
      enabled: convertContracts.length > 0,
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

  // Parse balance results into a map: "subAccount:vaultAddress" -> { assets, debt }
  // We key by both sub-account and vault since the same vault can have different
  // balances on different sub-accounts
  // NOTE: For collateral, we use convertResults (underlying assets) not balanceResults (shares)
  const balanceMap = useMemo(() => {
    const map = new Map<string, { assets: bigint; debt: bigint }>();
    if (!balanceResults || balanceResults.length === 0 || !balanceContracts.length) return map;

    // Build a map of converted assets from convertResults
    const convertedAssetsMap = new Map<string, bigint>();
    if (convertResults && convertContracts.length > 0) {
      for (let i = 0; i < convertResults.length; i++) {
        const result = convertResults[i];
        const contract = convertContracts[i];
        if (!contract?._meta) continue;

        const key = `${contract._meta.subAccount.toLowerCase()}:${contract._meta.vaultAddress.toLowerCase()}`;
        if (result?.status === "success") {
          convertedAssetsMap.set(key, result.result as bigint);
        }
      }
    }

    // Validate array alignment - this should never happen, but guard against race conditions
    if (balanceResults.length !== balanceContracts.length) {
      console.error(
        `[useEulerLendingPositions] Balance data mismatch: ${balanceResults.length} results vs ${balanceContracts.length} contracts. ` +
        `This may cause missing balance data. The arrays should be aligned.`
      );
    }

    for (let i = 0; i < balanceResults.length; i++) {
      const result = balanceResults[i];
      const contract = balanceContracts[i];

      // Log error instead of silently skipping when _meta is missing
      // This indicates a data integrity issue that should be investigated
      if (!contract?._meta) {
        console.error(
          `[useEulerLendingPositions] Missing _meta for contract at index ${i}. ` +
          `Contract: ${JSON.stringify(contract)}. ` +
          `This entry will be skipped, which may cause incorrect balance display.`
        );
        continue;
      }

      const { subAccount, vaultAddress, type } = contract._meta;
      const key = `${subAccount.toLowerCase()}:${vaultAddress.toLowerCase()}`;

      // Get or create entry
      const existing = map.get(key) ?? { assets: 0n, debt: 0n };

      if (result?.status === "success") {
        const value = result.result as bigint;
        if (type === "collateral") {
          // Use converted assets if available, otherwise fall back to shares
          // (shares will be slightly off but better than nothing)
          existing.assets = convertedAssetsMap.get(key) ?? value;
        } else {
          // Debt is already in underlying asset units
          existing.debt = value;
        }
      } else if (result?.status === "failure") {
        // Log failed balance queries for debugging
        console.warn(
          `[useEulerLendingPositions] Balance query failed for ${type} at vault ${vaultAddress} ` +
          `(subAccount: ${subAccount}): ${result.error}`
        );
      }

      map.set(key, existing);
    }

    console.log("[useEulerLendingPositions] Balance map:", Array.from(map.entries()).map(([k, v]) => ({
      key: k,
      assets: v.assets.toString(),
      debt: v.debt.toString(),
    })));

    return map;
  }, [balanceResults, balanceContracts, convertResults, convertContracts]);

  // Enrich position groups with on-chain balance and liquidity data
  const enrichedPositionGroups = useMemo<EulerPositionGroupWithBalances[]>(() => {
    if (!positionGroups.length) return [];

    return positionGroups.map((group): EulerPositionGroupWithBalances => {
      const subAccountLower = group.subAccount.toLowerCase();

      // Enrich collaterals with balance data (using subAccount:vault key)
      // NOTE: balance is now in underlying assets (from maxWithdraw), not shares
      const enrichedCollaterals: EulerCollateralWithBalance[] = group.collaterals.map((col) => {
        const key = `${subAccountLower}:${col.vault.address.toLowerCase()}`;
        const balanceData = balanceMap.get(key);
        return {
          ...col,
          balance: balanceData?.assets ?? 0n,
        };
      });

      // Enrich debt with balance data (using subAccount:vault key)
      const enrichedDebt: EulerDebtWithBalance | null = group.debt
        ? {
            vault: group.debt.vault,
            balance: balanceMap.get(`${subAccountLower}:${group.debt.vault.address.toLowerCase()}`)?.debt ?? 0n,
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

  // Build position rows from enriched position groups (for legacy flat view)
  // Each row represents a vault within a specific sub-account
  const rows = useMemo<EulerPositionRow[]>(() => {
    const result: EulerPositionRow[] = [];

    for (const group of enrichedPositionGroups) {
      // Add rows for collateral positions (supply)
      for (const col of group.collaterals) {
        const vault = col.vault;
        const supplyBalance = col.balance;

        // Only include if has balance
        if (supplyBalance === 0n) continue;

        const context = createEulerContext(
          group.debt?.vault.address ?? vault.address, // borrow vault (or self if no debt)
          vault.address // collateral vault
        );

        result.push({
          key: `${group.subAccount}:${vault.address}`,
          vault: {
            address: vault.address,
            name: vault.name,
            symbol: vault.symbol,
            asset: vault.asset,
            supplyApy: vault.supplyApy,
            borrowApy: vault.borrowApy,
          },
          context,
          assetSymbol: vault.asset.symbol,
          supplyBalance,
          supplyBalanceUsd: 0, // Would need price feed
          supplyDecimals: vault.asset.decimals,
          borrowBalance: 0n,
          borrowBalanceUsd: 0,
          borrowDecimals: vault.asset.decimals,
          supplyApy: (vault.supplyApy ?? 0) * 100,
          borrowApy: (vault.borrowApy ?? 0) * 100,
          hasSupply: true,
          hasDebt: false,
        });
      }

      // Add row for debt position if exists
      if (group.debt && group.debt.balance > 0n) {
        const vault = group.debt.vault;
        const borrowBalance = group.debt.balance;

        const context = createEulerContext(
          vault.address,
          group.collaterals[0]?.vault.address ?? vault.address
        );

        result.push({
          key: `${group.subAccount}:${vault.address}:debt`,
          vault: {
            address: vault.address,
            name: vault.name,
            symbol: vault.symbol,
            asset: vault.asset,
            supplyApy: vault.supplyApy,
            borrowApy: vault.borrowApy,
          },
          context,
          assetSymbol: vault.asset.symbol,
          supplyBalance: 0n,
          supplyBalanceUsd: 0,
          supplyDecimals: vault.asset.decimals,
          borrowBalance,
          borrowBalanceUsd: 0, // Would need price feed
          borrowDecimals: vault.asset.decimals,
          supplyApy: (vault.supplyApy ?? 0) * 100,
          borrowApy: (vault.borrowApy ?? 0) * 100,
          hasSupply: false,
          hasDebt: true,
        });
      }
    }

    return result;
  }, [enrichedPositionGroups]);

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
    queryKey: qk.euler.vaults(chainId, normalizedSearch),
    queryFn: () => fetchEulerVaultsApi(chainId, { search: normalizedSearch }),
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
