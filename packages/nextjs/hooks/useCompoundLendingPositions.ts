import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { Abi } from "abitype";
import { useQueryClient } from "@tanstack/react-query";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { sanitizeSymbol } from "~~/utils/tokenSymbols";
import { compoundRateToAPR, decimalsFromScale } from "~~/utils/protocolRates";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { useTxCompletedListener } from "~~/hooks/common";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Minimal ERC20 read ABI for symbol and decimals
const ERC20_META_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ── Types ──────────────────────────────────────────────────────────

export interface CompoundCollateral {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  usdValue: number;
  /** USD price in 8-decimal format */
  priceRaw: bigint;
  /** Collateral factor in bps (borrow limit) */
  ltvBps: bigint;
  /** Liquidation threshold in bps */
  lltvBps: bigint;
  icon: string;
}

export interface CompoundMarketPosition {
  /** Comet base token address */
  baseToken: Address;
  baseSymbol: string;
  baseDecimals: number;
  baseIcon: string;
  /** Base token supply balance (yield-earning) */
  supplyBalance: bigint;
  supplyBalanceUsd: number;
  /** Base token debt */
  borrowBalance: bigint;
  borrowBalanceUsd: number;
  supplyApr: number;
  borrowApr: number;
  /** USD price in 8-decimal format */
  priceRaw: bigint;
  /** USD price as float */
  priceUsd: number;
  collaterals: CompoundCollateral[];
  totalCollateralUsd: number;
  /** Current utilization: borrowUsd / totalCollateralUsd * 100 */
  utilizationPercent: number;
  /** Weighted liquidation LTV across all collaterals (in bps) */
  weightedLltvBps: bigint;
  /** All accepted collateral assets for this market (from getCollateralFactors, always populated) */
  acceptedCollaterals: CompoundAcceptedCollateral[];
}

/** Lightweight collateral info for markets table display (no user balances) */
export interface CompoundAcceptedCollateral {
  address: string;
  symbol: string;
  icon: string;
  /** Token decimals (fetched from ERC20 contract) */
  decimals: number;
  /** Collateral factor in bps (borrow limit) */
  ltvBps: number;
  /** Liquidation collateral factor in bps */
  lltvBps: number;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useCompoundLendingPositions(chainId?: number) {
  const { address: connectedAddress } = useAccount();
  const queryClient = useQueryClient();
  const queryAddress = (connectedAddress || ZERO_ADDRESS) as Address;

  // Contracts
  const { data: gateway } = useScaffoldContract({ contractName: "CompoundGatewayView", chainId: chainId as any });
  const gatewayAddress = gateway?.address as Address | undefined;
  const { data: uiHelper } = useScaffoldContract({ contractName: "UiHelper", chainId: chainId as any });
  const uiHelperAddress = uiHelper?.address as Address | undefined;

  // Fetch active base tokens
  const { data: activeBaseTokens } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "allActiveBaseTokens",
    chainId: chainId as any,
  });
  const baseTokens: Address[] = useMemo(
    () => ((activeBaseTokens as Address[] | undefined) || []) as Address[],
    [activeBaseTokens],
  );

  const noMarkets = !gatewayAddress || baseTokens.length === 0;

  // Batch symbols
  const symbolCalls = useMemo(() => {
    return baseTokens.map(t => ({ address: t, abi: ERC20_META_ABI, functionName: "symbol" as const, args: [], chainId }));
  }, [baseTokens, chainId]);
  const { data: symbolResults } = useReadContracts({
    allowFailure: true,
    contracts: symbolCalls,
    query: { enabled: symbolCalls.length > 0 },
  });
  const symbols: string[] = useMemo(
    () => (symbolResults || []).map(r => (r?.result as string) || ""),
    [symbolResults],
  );

  // Batch decimals
  const { data: baseTokenDecimalsRaw } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [baseTokens],
    chainId: chainId as any,
    query: { enabled: !!uiHelperAddress && baseTokens.length > 0 },
  });
  const baseTokenDecimals: number[] = useMemo(
    () => (baseTokenDecimalsRaw || []).map((d: any) => Number(d)),
    [baseTokenDecimalsRaw],
  );

  // Tx completed listener for refetching
  const handleTxCompleted = useCallback(() => {
    queryClient.refetchQueries({ queryKey: [chainId, "readContract"], type: "active" });
    queryClient.refetchQueries({ queryKey: [chainId, "readContracts"], type: "active" });
  }, [chainId, queryClient]);
  useTxCompletedListener(handleTxCompleted);

  // Batch getCompoundData(baseToken, user) per market
  const compoundCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(t => ({
      address: gatewayAddress,
      abi: gateway.abi as Abi,
      functionName: "getCompoundData" as const,
      args: [t, queryAddress],
      chainId,
    }));
  }, [gatewayAddress, gateway, baseTokens, queryAddress, chainId]);
  const { data: compoundResults, isFetched: compoundFetched } = useReadContracts({
    allowFailure: true,
    contracts: compoundCalls,
    query: { enabled: compoundCalls.length > 0 },
  });

  // Loading state
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    setHasLoadedOnce(false);
  }, [chainId]);
  useEffect(() => {
    if (compoundFetched && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [compoundFetched, hasLoadedOnce]);

  // ── Accepted collaterals for ALL markets (needed by markets table) ──
  // Batch getCollateralFactors for every base token, not just active ones
  const allFactorsCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(baseToken => ({
      address: gatewayAddress,
      abi: gateway.abi as Abi,
      functionName: "getCollateralFactors" as const,
      args: [baseToken],
      chainId,
    }));
  }, [gatewayAddress, gateway, baseTokens, chainId]);
  const { data: allFactorsResults } = useReadContracts({
    allowFailure: true,
    contracts: allFactorsCalls,
    query: { enabled: allFactorsCalls.length > 0 },
  });

  // Collect unique collateral addresses across all markets for symbol resolution
  const allCollateralAddresses: Address[] = useMemo(() => {
    if (!allFactorsResults) return [];
    const addressSet = new Set<string>();
    allFactorsResults.forEach(res => {
      const assets = (res?.result as [string[], bigint[], bigint[]] | undefined)?.[0] ?? [];
      assets.forEach(a => addressSet.add(a));
    });
    return Array.from(addressSet) as Address[];
  }, [allFactorsResults]);

  // Batch ERC20 symbol reads for all collateral addresses
  const collSymbolCalls = useMemo(() => {
    return allCollateralAddresses.map(addr => ({
      address: addr,
      abi: ERC20_META_ABI,
      functionName: "symbol" as const,
      args: [] as const,
      chainId,
    }));
  }, [allCollateralAddresses, chainId]);
  const { data: collSymbolResults } = useReadContracts({
    allowFailure: true,
    contracts: collSymbolCalls,
    query: { enabled: collSymbolCalls.length > 0 },
  });

  // Batch ERC20 decimals reads for all collateral addresses
  const collDecimalsAllCalls = useMemo(() => {
    return allCollateralAddresses.map(addr => ({
      address: addr,
      abi: ERC20_META_ABI,
      functionName: "decimals" as const,
      args: [] as const,
      chainId,
    }));
  }, [allCollateralAddresses, chainId]);
  const { data: collDecimalsAllResults } = useReadContracts({
    allowFailure: true,
    contracts: collDecimalsAllCalls,
    query: { enabled: collDecimalsAllCalls.length > 0 },
  });

  // Build address → symbol and address → decimals lookups
  const collSymbolByAddress = useMemo(() => {
    const map = new Map<string, string>();
    allCollateralAddresses.forEach((addr, i) => {
      const sym = (collSymbolResults?.[i]?.result as string) || "";
      map.set(addr.toLowerCase(), sanitizeSymbol(sym));
    });
    return map;
  }, [allCollateralAddresses, collSymbolResults]);

  const collDecimalsByAddress = useMemo(() => {
    const map = new Map<string, number>();
    allCollateralAddresses.forEach((addr, i) => {
      const dec = collDecimalsAllResults?.[i]?.result;
      map.set(addr.toLowerCase(), typeof dec === "number" ? dec : 18);
    });
    return map;
  }, [allCollateralAddresses, collDecimalsAllResults]);

  // Active markets (those with user positions)
  const activeMarketsForCollateral = useMemo(() => {
    if (!compoundResults || baseTokens.length === 0) return [] as { baseToken: Address; idx: number }[];
    return baseTokens.reduce((acc, baseToken, idx) => {
      const compound = compoundResults[idx]?.result as [bigint, bigint, bigint, bigint, bigint, bigint] | undefined;
      const balanceRaw = compound?.[2] ?? 0n;
      const borrowBalanceRaw = compound?.[3] ?? 0n;
      if (balanceRaw > 0n || borrowBalanceRaw > 0n) {
        acc.push({ baseToken, idx });
      }
      return acc;
    }, [] as { baseToken: Address; idx: number }[]);
  }, [baseTokens, compoundResults]);

  const depositedIndexByBase = useMemo(() => {
    const indexMap = new Map<number, number>();
    activeMarketsForCollateral.forEach((market, order) => indexMap.set(market.idx, order));
    return indexMap;
  }, [activeMarketsForCollateral]);

  // Batch collateral data for active markets
  const depositedCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || activeMarketsForCollateral.length === 0) return [] as any[];
    return activeMarketsForCollateral.map(({ baseToken }) => ({
      address: gatewayAddress,
      abi: gateway.abi as Abi,
      functionName: "getDepositedCollaterals" as const,
      args: [baseToken, queryAddress],
      chainId,
    }));
  }, [gatewayAddress, gateway, activeMarketsForCollateral, queryAddress, chainId]);
  const { data: depositedResults } = useReadContracts({
    allowFailure: true,
    contracts: depositedCalls,
    query: { enabled: depositedCalls.length > 0 },
  });

  // Batch collateral prices
  const pricesCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || !depositedResults) return [] as any[];
    const calls: any[] = [];
    (depositedResults as any[]).forEach((res, i) => {
      const baseToken = activeMarketsForCollateral[i]?.baseToken;
      const colls = ((res?.result?.[0] as Address[] | undefined) || []) as Address[];
      if (colls.length > 0 && baseToken) {
        calls.push({
          address: gatewayAddress,
          abi: gateway.abi as Abi,
          functionName: "getPrices" as const,
          args: [baseToken, colls],
          chainId,
        });
      }
    });
    return calls;
  }, [gatewayAddress, gateway, depositedResults, activeMarketsForCollateral, chainId]);
  const { data: pricesResults } = useReadContracts({
    allowFailure: true,
    contracts: pricesCalls,
    query: { enabled: pricesCalls.length > 0 },
  });

  // Batch collateral decimals
  const collDecimalsCalls = useMemo(() => {
    if (!uiHelperAddress || !uiHelper || !depositedResults) return [] as any[];
    const calls: any[] = [];
    (depositedResults as any[]).forEach(res => {
      const colls = ((res?.result?.[0] as Address[] | undefined) || []) as Address[];
      if (colls.length > 0) {
        calls.push({
          address: uiHelperAddress,
          abi: uiHelper.abi as Abi,
          functionName: "getDecimals" as const,
          args: [colls],
          chainId,
        });
      }
    });
    return calls;
  }, [uiHelperAddress, uiHelper, depositedResults, chainId]);
  const { data: collDecimalsResults } = useReadContracts({
    allowFailure: true,
    contracts: collDecimalsCalls,
    query: { enabled: collDecimalsCalls.length > 0 },
  });

  // Batch collateral factors for active markets
  const factorsCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || activeMarketsForCollateral.length === 0) return [] as any[];
    return activeMarketsForCollateral.map(({ baseToken }) => ({
      address: gatewayAddress,
      abi: gateway.abi as Abi,
      functionName: "getCollateralFactors" as const,
      args: [baseToken],
      chainId,
    }));
  }, [gatewayAddress, gateway, activeMarketsForCollateral, chainId]);
  const { data: factorsResults } = useReadContracts({
    allowFailure: true,
    contracts: factorsCalls,
    query: { enabled: factorsCalls.length > 0 },
  });

  // On-chain liquidation LTV for active markets (reliable — handles price denomination correctly)
  const lltvBpsCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || activeMarketsForCollateral.length === 0) return [] as any[];
    return activeMarketsForCollateral.map(({ baseToken }) => ({
      address: gatewayAddress,
      abi: gateway.abi as Abi,
      functionName: "getLiquidationLtvBps" as const,
      args: [baseToken, queryAddress],
      chainId,
    }));
  }, [gatewayAddress, gateway, activeMarketsForCollateral, queryAddress, chainId]);
  const { data: lltvBpsResults } = useReadContracts({
    allowFailure: true,
    contracts: lltvBpsCalls,
    query: { enabled: lltvBpsCalls.length > 0 },
  });

  // USD prices from CoinGecko by contract address (no symbol ambiguity)
  const priceAddresses = useMemo(() => {
    const addrs = new Set<string>();
    baseTokens.forEach(t => { if (t && t !== ZERO_ADDRESS) addrs.add(t.toLowerCase()); });
    (depositedResults as any[] | undefined)?.forEach(res => {
      const colls = (res?.result?.[0] as string[] | undefined) || [];
      colls.forEach(a => { if (a && a !== ZERO_ADDRESS) addrs.add(a.toLowerCase()); });
    });
    return Array.from(addrs).sort();
  }, [baseTokens, depositedResults]);

  const { prices: usdPriceByAddress = {} } = useTokenPricesByAddress(
    chainId ?? 1,
    priceAddresses,
    { enabled: priceAddresses.length > 0 && !!chainId },
  );

  // Build CompoundMarketPosition[] from all data
  const markets: CompoundMarketPosition[] = useMemo(() => {
    if (noMarkets) return [];

    return baseTokens.map((base, idx) => {
      const compound = compoundResults?.[idx]?.result as [bigint, bigint, bigint, bigint, bigint, bigint] | undefined;
      const symbol = symbols[idx] || "";
      const decimals = Number((baseTokenDecimals?.[idx] as unknown as bigint) ?? 18n);
      if (!compound) {
        return null;
      }

      const [supplyRate, borrowRate, balanceRaw, borrowBalanceRaw, priceRawOnchain, priceScale] = compound;
      const priceDecimals = decimalsFromScale(priceScale ?? 1n);
      // Always use CoinGecko for the base token USD price.
      // The on-chain oracle (getPrice) returns the base token price in its OWN units
      // (e.g., WETH market returns 1.0 since WETH/WETH = 1), not USD.
      // Only USDC-like markets have a USD-equivalent oracle price.
      const apiUsdPrice = usdPriceByAddress[base.toLowerCase()];
      const priceUsd = typeof apiUsdPrice === "number" && apiUsdPrice > 0
        ? apiUsdPrice
        : 0;

      const supplyApr = compoundRateToAPR(supplyRate ?? 0n);
      const borrowApr = compoundRateToAPR(borrowRate ?? 0n);
      const tokenBalance = Number(formatUnits(balanceRaw ?? 0n, decimals));
      const usdBalance = tokenBalance * priceUsd;
      const tokenBorrow = Number(formatUnits(borrowBalanceRaw ?? 0n, decimals));
      const usdBorrow = tokenBorrow * priceUsd;

      // Price in 8-decimal format
      const priceRaw8 = Number.isFinite(priceUsd) ? BigInt(Math.round(priceUsd * 1e8)) : priceRawOnchain;
      const safeName = (symbol || "").replace("₮", "T");
      const baseIcon = tokenNameToLogo(safeName) || "/logos/token.svg";

      // Build collaterals for this market
      const depositResultIndex = depositedIndexByBase.get(idx);
      const depRes = depositResultIndex === undefined
        ? undefined
        : (depositedResults?.[depositResultIndex]?.result as [Address[], bigint[], string[]] | undefined);
      const colls = depRes?.[0] ?? [];
      const balances = depRes?.[1] ?? [];
      const collNames = depRes?.[2] ?? [];

      let marketPrices: bigint[] = [];
      let collDecs: bigint[] = [];
      if (depositResultIndex !== undefined) {
        marketPrices = (pricesResults?.[depositResultIndex]?.result as bigint[] | undefined) ?? [];
        collDecs = (collDecimalsResults?.[depositResultIndex]?.result as bigint[] | undefined) ?? [];
      }

      // Build factor map for this market
      const factorResult = depositResultIndex !== undefined
        ? (factorsResults?.[depositResultIndex]?.result as [string[], bigint[], bigint[]] | undefined)
        : undefined;
      const factorMap = new Map<string, { ltvBps: bigint; lltvBps: bigint }>();
      if (factorResult) {
        const [assets, ltvList, lltvList] = factorResult;
        assets.forEach((asset, i) => {
          factorMap.set(asset.toLowerCase(), {
            ltvBps: ltvList?.[i] ?? 0n,
            lltvBps: lltvList?.[i] ?? 0n,
          });
        });
      }

      let totalCollateralUsd = 0;
      const collaterals: CompoundCollateral[] = colls.map((collAddr, i) => {
        const balRaw = balances[i] ?? 0n;
        const dec = Number(collDecs[i] ?? 18n);
        const bal = Number(formatUnits(balRaw, dec));
        const collName = collNames[i] || "Collateral";
        // Prefer CoinGecko price by contract address; fall back to on-chain oracle.
        // NOTE: getPrices() returns collateral prices denominated in the BASE token
        // (e.g., ETH for WETH Comet), not USD. Must multiply by base token USD price.
        const directUsdPrice = usdPriceByAddress[(collAddr as string).toLowerCase()];
        const oraclePriceInBase = Number(formatUnits(marketPrices[i] ?? 0n, priceDecimals));
        const oraclePriceUsd = oraclePriceInBase * priceUsd;
        const collateralUsdPrice = typeof directUsdPrice === "number" && directUsdPrice > 0
          ? directUsdPrice
          : oraclePriceUsd;
        const usdValue = Number.isFinite(collateralUsdPrice) ? bal * collateralUsdPrice : 0;
        if (Number.isFinite(usdValue)) {
          totalCollateralUsd += usdValue;
        }
        const collateralPrice8 = Number.isFinite(collateralUsdPrice)
          ? BigInt(Math.round(collateralUsdPrice * 1e8))
          : 0n;

        const factors = factorMap.get((collAddr as string).toLowerCase());

        return {
          address: collAddr as string,
          symbol: collName,
          decimals: dec,
          balance: balRaw,
          usdValue,
          priceRaw: collateralPrice8,
          ltvBps: factors?.ltvBps ?? 0n,
          lltvBps: factors?.lltvBps ?? 0n,
          icon: tokenNameToLogo(collName) || "/logos/token.svg",
        };
      });

      // Utilization
      const utilizationPercent = totalCollateralUsd > 0
        ? (usdBorrow / totalCollateralUsd) * 100
        : 0;

      // Weighted LLTV — prefer on-chain getLiquidationLtvBps (handles price denomination correctly)
      let weightedLltvBps = 0n;
      const onChainLltv = depositResultIndex !== undefined
        ? (lltvBpsResults?.[depositResultIndex]?.result as bigint | undefined)
        : undefined;
      if (onChainLltv && onChainLltv > 0n) {
        weightedLltvBps = onChainLltv;
      } else if (totalCollateralUsd > 0) {
        // Fallback: client-side weighted average (may be wrong for non-USD-denominated markets)
        let totalWeightedLltv = 0n;
        let totalWeight = 0n;
        for (const col of collaterals) {
          if (col.usdValue > 0 && col.lltvBps > 0n) {
            const weight = BigInt(Math.floor(col.usdValue * 100));
            totalWeightedLltv += col.lltvBps * weight;
            totalWeight += weight;
          }
        }
        if (totalWeight > 0n) {
          weightedLltvBps = totalWeightedLltv / totalWeight;
        }
      }

      // Build accepted collaterals from allFactorsResults (for markets table display)
      const allFactorResult = allFactorsResults?.[idx]?.result as [string[], bigint[], bigint[]] | undefined;
      const allFactorAddrs = allFactorResult?.[0] ?? [];
      const allFactorLtvs = allFactorResult?.[1] ?? [];
      const allFactorLltvs = allFactorResult?.[2] ?? [];
      const acceptedCollaterals: CompoundAcceptedCollateral[] = allFactorAddrs.map((addr, ai) => {
        const sym = collSymbolByAddress.get(addr.toLowerCase()) || "???";
        return {
          address: addr as string,
          symbol: sym,
          icon: tokenNameToLogo(sym) || "/logos/token.svg",
          decimals: collDecimalsByAddress.get(addr.toLowerCase()) ?? 18,
          ltvBps: Number(allFactorLtvs[ai] ?? 0n),
          lltvBps: Number(allFactorLltvs[ai] ?? 0n),
        };
      });

      return {
        baseToken: base,
        baseSymbol: safeName,
        baseDecimals: decimals,
        baseIcon,
        supplyBalance: balanceRaw ?? 0n,
        supplyBalanceUsd: usdBalance,
        borrowBalance: borrowBalanceRaw ?? 0n,
        borrowBalanceUsd: usdBorrow,
        supplyApr,
        borrowApr,
        priceRaw: priceRaw8,
        priceUsd,
        collaterals,
        totalCollateralUsd,
        utilizationPercent,
        weightedLltvBps,
        acceptedCollaterals,
      } satisfies CompoundMarketPosition;
    }).filter((m): m is CompoundMarketPosition => m !== null);
  }, [
    noMarkets,
    baseTokens,
    compoundResults,
    symbols,
    baseTokenDecimals,
    depositedResults,
    pricesResults,
    collDecimalsResults,
    factorsResults,
    lltvBpsResults,
    depositedIndexByBase,
    usdPriceByAddress,
    allFactorsResults,
    collSymbolByAddress,
  ]);

  const isLoading = !compoundFetched;

  return {
    markets,
    hasLoadedOnce,
    isLoading,
  };
}
