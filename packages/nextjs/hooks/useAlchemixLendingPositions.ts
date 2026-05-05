import { useCallback, useMemo } from "react";
import { useReadContracts } from "wagmi";
import { Address } from "viem";
import { ALCHEMIX_MARKETS, type AlchemixMarket, getAlchemixMarkets } from "~~/utils/alchemix/markets";
import { useTxCompletedListenerDelayed } from "~~/hooks/common";

/**
 * Hook: read all Alchemix V3 positions for a user across the registered markets on `chainId`.
 *
 * Strategy
 * --------
 *   1. For each market on this chain, multicall `IERC721Enumerable(positionNft).balanceOf(user)`
 *      to find how many positions the user holds in that market.
 *   2. For each (market, index) pair, multicall `tokenOfOwnerByIndex(user, index)` to discover
 *      the actual tokenIds.
 *   3. For each (market, tokenId), multicall `getCDP(tokenId)` to get
 *      `(collateralMytShares, debt, earmarked)`.
 *   4. Convert collateral (denominated in MYT shares) to underlying via
 *      `convertYieldTokensToUnderlying(collateral)`.
 *
 * The hook surfaces a flat list of positions (one entry per NFT/tokenId), each carrying enough
 * data for the UI to render a SupplyPosition + BorrowPosition pair.
 */

const POSITION_NFT_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ALCHEMIST_ABI = [
  {
    name: "getCDP",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "collateral", type: "uint256" },
      { name: "debt", type: "uint256" },
      { name: "earmarked", type: "uint256" },
    ],
  },
  {
    name: "convertYieldTokensToUnderlying",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "minimumCollateralization",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "alchemistPositionNFT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const FIXED_POINT_SCALAR = 10n ** 18n;

export interface AlchemixPosition {
  market: AlchemixMarket;
  /** ERC721 tokenId for this position (1-indexed by alchemist convention). */
  tokenId: bigint;
  /** Collateral balance in MYT yield-token shares (1e18 decimals). */
  collateralMyt: bigint;
  /** Collateral balance in underlying-token units (matches market.underlyingDecimals). */
  collateralUnderlying: bigint;
  /** Total debt in `debtToken` units (alAsset, 1e18). */
  debt: bigint;
  /** Portion of `debt` that is earmarked for transmuter redemption (alAsset, 1e18). */
  earmarked: bigint;
  /** Current LTV as a percentage (e.g. 78.4 means 78.4% loan-to-value). */
  currentLtvPct: number;
  /** Maximum LTV before the position becomes liquidatable, derived from `minimumCollateralization`. */
  maxLtvPct: number;
}

export interface UseAlchemixLendingPositionsResult {
  positions: AlchemixPosition[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  refetch: () => void;
}

/** Compute LTV percentage from debt and collateral, both expressed in the debt-token (alAsset) unit. */
function computeLtvPercent(debt: bigint, collateralAsDebt: bigint): number {
  if (collateralAsDebt === 0n) return 0;
  // Use a fixed-point intermediate (10000 = 100.00%) to avoid float precision loss for big numbers.
  const ltvBps = Number((debt * 10_000n) / collateralAsDebt);
  return ltvBps / 100;
}

export function useAlchemixLendingPositions(
  chainId: number,
  userAddress: string | undefined,
): UseAlchemixLendingPositionsResult {
  const markets = useMemo(() => getAlchemixMarkets(chainId), [chainId]);

  // Step 0: resolve the actual position NFT address from each alchemist on-chain.
  // Defensive: if the registry has a stale / wrong address, this corrects it. Same source of
  // truth as `AlchemixGatewayWrite._decodeContext`.
  const positionNftLookupContracts = useMemo(() => {
    if (markets.length === 0) return [];
    return markets.map(m => ({
      address: m.alchemist,
      abi: ALCHEMIST_ABI,
      functionName: "alchemistPositionNFT" as const,
      args: [] as const,
      chainId,
    }));
  }, [markets, chainId]);

  const { data: positionNftLookupResults } = useReadContracts({
    contracts: positionNftLookupContracts,
    query: {
      enabled: positionNftLookupContracts.length > 0,
      staleTime: 600_000,
      refetchOnWindowFocus: false,
    },
  });

  const resolvedPositionNfts = useMemo<readonly `0x${string}`[]>(() => {
    return markets.map((m, i) => {
      const r = positionNftLookupResults?.[i];
      if (r?.status === "success") {
        const addr = (r.result as `0x${string}`).toLowerCase() as `0x${string}`;
        if (addr.toLowerCase() !== m.positionNft.toLowerCase()) {
          // Loud diagnostic — registry is wrong, surface it so we can fix the constant.
          // eslint-disable-next-line no-console
          console.warn(
            `[Alchemix] Registry positionNft mismatch for market "${m.id}": registry=${m.positionNft}, on-chain=${addr}. Using on-chain value.`,
          );
        }
        return addr;
      }
      return m.positionNft;
    });
  }, [markets, positionNftLookupResults]);

  // Step 1: balanceOf(user) per position NFT (using resolved address)
  const balanceContracts = useMemo(() => {
    if (!userAddress || markets.length === 0) return [];
    return markets.map((m, i) => ({
      address: resolvedPositionNfts[i],
      abi: POSITION_NFT_ABI,
      functionName: "balanceOf" as const,
      args: [userAddress as Address] as const,
      chainId,
    }));
  }, [markets, resolvedPositionNfts, userAddress, chainId]);

  const {
    data: balanceResults,
    isLoading: isLoadingBalances,
    isSuccess: hasLoadedBalances,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: balanceContracts.length > 0,
      // Poll the NFT balance every 30s so positions minted outside Kapan auto-discover.
      // Subsequent steps (tokenIds, CDP, conversion) cascade automatically via useMemo deps.
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  // Step 2: tokenOfOwnerByIndex per (market, index) where balance > 0
  // Each entry is annotated with which market it belongs to so we can stitch results back.
  const tokenIdContracts = useMemo(() => {
    if (!balanceResults || !userAddress) return [] as Array<{
      address: `0x${string}`;
      abi: typeof POSITION_NFT_ABI;
      functionName: "tokenOfOwnerByIndex";
      args: readonly [Address, bigint];
      chainId: number;
      _meta: { marketIndex: number };
    }>;

    const out: Array<{
      address: `0x${string}`;
      abi: typeof POSITION_NFT_ABI;
      functionName: "tokenOfOwnerByIndex";
      args: readonly [Address, bigint];
      chainId: number;
      _meta: { marketIndex: number };
    }> = [];

    for (let mi = 0; mi < markets.length; mi++) {
      const r = balanceResults[mi];
      if (r?.status !== "success") continue;
      const balance = r.result as bigint;
      for (let i = 0n; i < balance; i++) {
        out.push({
          address: resolvedPositionNfts[mi],
          abi: POSITION_NFT_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [userAddress as Address, i] as const,
          chainId,
          _meta: { marketIndex: mi },
        });
      }
    }
    return out;
  }, [balanceResults, markets, resolvedPositionNfts, userAddress, chainId]);

  const {
    data: tokenIdResults,
    isLoading: isLoadingTokenIds,
  } = useReadContracts({
    contracts: tokenIdContracts,
    query: {
      enabled: tokenIdContracts.length > 0,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  // Step 3: getCDP per (market, tokenId) — for each successfully resolved tokenId
  const cdpContracts = useMemo(() => {
    if (!tokenIdResults) return [] as Array<{
      address: `0x${string}`;
      abi: typeof ALCHEMIST_ABI;
      functionName: "getCDP";
      args: readonly [bigint];
      chainId: number;
      _meta: { marketIndex: number; tokenId: bigint };
    }>;

    const out: Array<{
      address: `0x${string}`;
      abi: typeof ALCHEMIST_ABI;
      functionName: "getCDP";
      args: readonly [bigint];
      chainId: number;
      _meta: { marketIndex: number; tokenId: bigint };
    }> = [];

    for (let i = 0; i < tokenIdResults.length; i++) {
      const r = tokenIdResults[i];
      const tokenIdContract = tokenIdContracts[i];
      if (r?.status !== "success" || !tokenIdContract?._meta) continue;
      const tokenId = r.result as bigint;
      out.push({
        address: markets[tokenIdContract._meta.marketIndex].alchemist,
        abi: ALCHEMIST_ABI,
        functionName: "getCDP",
        args: [tokenId] as const,
        chainId,
        _meta: { marketIndex: tokenIdContract._meta.marketIndex, tokenId },
      });
    }
    return out;
  }, [tokenIdResults, tokenIdContracts, markets, chainId]);

  const {
    data: cdpResults,
    isLoading: isLoadingCdps,
  } = useReadContracts({
    contracts: cdpContracts,
    query: {
      enabled: cdpContracts.length > 0,
      staleTime: 15_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  // Step 4: Per-market constants (minimumCollateralization) and per-position underlying conversion.
  // Each market has a single minimumCollateralization; we read it once per market.
  const constantContracts = useMemo(() => {
    if (markets.length === 0) return [];
    return markets.map(m => ({
      address: m.alchemist,
      abi: ALCHEMIST_ABI,
      functionName: "minimumCollateralization" as const,
      args: [] as const,
      chainId,
    }));
  }, [markets, chainId]);

  const { data: constantResults } = useReadContracts({
    contracts: constantContracts,
    query: {
      enabled: constantContracts.length > 0,
      staleTime: 600_000,
      refetchOnWindowFocus: false,
    },
  });

  // Per-position: convert collateral (MYT shares) → underlying for display.
  const conversionContracts = useMemo(() => {
    if (!cdpResults) return [] as Array<{
      address: `0x${string}`;
      abi: typeof ALCHEMIST_ABI;
      functionName: "convertYieldTokensToUnderlying";
      args: readonly [bigint];
      chainId: number;
      _meta: { cdpIndex: number };
    }>;

    const out: Array<{
      address: `0x${string}`;
      abi: typeof ALCHEMIST_ABI;
      functionName: "convertYieldTokensToUnderlying";
      args: readonly [bigint];
      chainId: number;
      _meta: { cdpIndex: number };
    }> = [];

    for (let i = 0; i < cdpResults.length; i++) {
      const r = cdpResults[i];
      const cdpContract = cdpContracts[i];
      if (r?.status !== "success" || !cdpContract?._meta) continue;
      const [collateral] = r.result as [bigint, bigint, bigint];
      if (collateral === 0n) continue;
      out.push({
        address: markets[cdpContract._meta.marketIndex].alchemist,
        abi: ALCHEMIST_ABI,
        functionName: "convertYieldTokensToUnderlying",
        args: [collateral] as const,
        chainId,
        _meta: { cdpIndex: i },
      });
    }
    return out;
  }, [cdpResults, cdpContracts, markets, chainId]);

  const { data: conversionResults } = useReadContracts({
    contracts: conversionContracts,
    query: {
      enabled: conversionContracts.length > 0,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  // Diagnostic: surface the per-market balance results so we can debug "no positions showing"
  // without manual JSON-RPC calls. Logs once per change in balance results.
  if (typeof window !== "undefined" && balanceResults && userAddress) {
    // eslint-disable-next-line no-console
    console.debug(
      "[Alchemix] balanceOf per market:",
      markets.map((m, i) => ({
        market: m.id,
        positionNft: resolvedPositionNfts[i],
        balance: balanceResults[i]?.status === "success" ? (balanceResults[i].result as bigint).toString() : `(${balanceResults[i]?.status})`,
      })),
      { user: userAddress, chainId },
    );
  }

  // Stitch results into AlchemixPosition[]
  const positions = useMemo<AlchemixPosition[]>(() => {
    if (!cdpResults) return [];

    // Map cdpIndex → underlying value (0 if unavailable)
    const underlyingByCdpIndex = new Map<number, bigint>();
    if (conversionResults) {
      for (let i = 0; i < conversionResults.length; i++) {
        const r = conversionResults[i];
        const c = conversionContracts[i];
        if (r?.status === "success" && c?._meta) {
          underlyingByCdpIndex.set(c._meta.cdpIndex, r.result as bigint);
        }
      }
    }

    const out: AlchemixPosition[] = [];
    for (let i = 0; i < cdpResults.length; i++) {
      const r = cdpResults[i];
      const c = cdpContracts[i];
      if (r?.status !== "success" || !c?._meta) continue;
      const [collateralMyt, debt, earmarked] = r.result as [bigint, bigint, bigint];
      const market = markets[c._meta.marketIndex];

      // collateral expressed in debt-token units (for LTV math)
      const collateralAsDebt = (collateralMyt * FIXED_POINT_SCALAR) / FIXED_POINT_SCALAR; // placeholder — we use convertYieldTokensToUnderlying for display only
      // For LTV we compare debt (in alAsset, 1e18) to collateralAsDebt (also 1e18).
      // alchemist.convertYieldTokensToDebt would be the precise call, but in V3 alAsset and underlying
      // are 1:1 by mint design, so converting MYT→underlying→debt is the same as MYT→debt for ratio
      // purposes. We use the underlying conversion result above.
      const underlying = underlyingByCdpIndex.get(i) ?? 0n;
      // Normalize underlying decimals up to 18 so LTV math against 18-decimal `debt` is sound.
      const decimalScale = 10n ** BigInt(18 - market.underlyingDecimals);
      const collateralAsDebtNormalized = underlying * decimalScale;

      // Maximum LTV: minimumCollateralization is 1e18-fixed (e.g. 1.111…e18 → 90% LTV).
      // maxLtvPct = 100 / (minimumCollateralization / 1e18) = 100 * 1e18 / minimumCollateralization
      let maxLtvPct = 0;
      const minCollat = constantResults?.[c._meta.marketIndex];
      if (minCollat?.status === "success") {
        const mc = minCollat.result as bigint;
        if (mc > 0n) {
          maxLtvPct = Number((100n * FIXED_POINT_SCALAR * 100n) / mc) / 100;
        }
      }

      out.push({
        market,
        tokenId: c._meta.tokenId,
        collateralMyt,
        collateralUnderlying: underlying,
        debt,
        earmarked,
        currentLtvPct: computeLtvPercent(debt, collateralAsDebtNormalized),
        maxLtvPct,
      });
      // Silence unused intermediate
      void collateralAsDebt;
    }
    return out;
  }, [cdpResults, cdpContracts, conversionResults, conversionContracts, constantResults, markets]);

  const isLoading = isLoadingBalances || isLoadingTokenIds || isLoadingCdps;
  const hasLoadedOnce = hasLoadedBalances;

  // Stable refetch callback used both externally and by the tx-completion listener.
  // Refetching `balanceOf` cascades through tokenIds → CDP → conversion via useMemo deps.
  const refetch = useCallback(() => {
    void refetchBalances();
  }, [refetchBalances]);

  // Refetch shortly after a Kapan transaction completes, in case the user just opened
  // or closed an Alchemix position via the router. 3s delay gives the chain time to settle.
  useTxCompletedListenerDelayed(refetch, 3000, hasLoadedOnce);

  return {
    positions,
    isLoading,
    hasLoadedOnce,
    refetch,
  };
}

/** Public re-export to avoid import-loop issues for components that need just the markets list. */
export { ALCHEMIX_MARKETS };
