import { FC, useEffect, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { CompoundCollateralView } from "./CompoundCollateralView";
import { Address, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { Abi } from "abitype";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SwapAsset } from "../../modals/SwapModalShell";
import { useGlobalState } from "~~/services/store/store";
import { useRiskParams } from "~~/hooks/useRiskParams";
import { sanitizeSymbol } from "~~/utils/tokenSymbols";

// Minimal ERC20 read ABI for symbol
const ERC20_META_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

// Define a constant for zero address
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Helper: derive decimals from a priceScale bigint (e.g., 1e8 -> 8)
const decimalsFromScale = (scale: bigint) => {
  if (scale <= 1n) return 0;
  let s = scale;
  let d = 0;
  while (s % 10n === 0n) { s /= 10n; d++; }
  return d;
};

// (collateral value is computed via batch reads in the component below)

export const CompoundProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  const { address: connectedAddress } = useAccount();
  const isWalletConnected = !!connectedAddress;
  const forceShowAll = !isWalletConnected;
  const queryClient = useQueryClient();

  // Determine the address to use for queries
  const queryAddress = (connectedAddress || ZERO_ADDRESS) as Address;

  // Contracts via scaffold-eth registry
  const { data: gateway } = useScaffoldContract({ contractName: "CompoundGatewayView", chainId: chainId as any });
  const gatewayAddress = gateway?.address as Address | undefined;
  const gatewayAbi = useMemo(() => gateway?.abi, [gateway?.abi]);
  const { data: uiHelper } = useScaffoldContract({ contractName: "UiHelper", chainId: chainId as any });
  const uiHelperAddress = uiHelper?.address as Address | undefined;
  const uiHelperAbi = useMemo(() => uiHelper?.abi, [uiHelper?.abi]);

  // Fetch active base tokens from view helper (unions view + write gateway on-chain)
  const { data: activeBaseTokens } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "allActiveBaseTokens",
    chainId: chainId as any,
  });
  const baseTokens: Address[] = useMemo(() => ((activeBaseTokens as Address[] | undefined) || []) as Address[], [activeBaseTokens]);

  const noMarkets = !gatewayAddress || baseTokens.length === 0;

  // Batch symbols + decimals
  const symbolCalls = useMemo(() => {
    return baseTokens.map(t => ({ address: t, abi: ERC20_META_ABI, functionName: "symbol" as const, args: [], chainId }));
  }, [baseTokens, chainId]);
  const { data: symbolResults } = useReadContracts({ allowFailure: true, contracts: symbolCalls, query: { enabled: symbolCalls.length > 0 } });
  const symbols: string[] = useMemo(() => (symbolResults || []).map(r => (r?.result as string) || ""), [symbolResults]);

  const { data: baseTokenDecimalsRaw } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [baseTokens],
    chainId: chainId as any,
    query: { enabled: !!uiHelperAddress && baseTokens.length > 0 },
  });
  const baseTokenDecimals: number[] = useMemo(() => (baseTokenDecimalsRaw || []).map((d: any) => Number(d)), [baseTokenDecimalsRaw]);

  // Refetch contract reads when a transaction completes
  useEffect(() => {
    const handler = () => {
      queryClient.refetchQueries({ queryKey: [chainId, "readContract"], type: "active" });
      queryClient.refetchQueries({ queryKey: [chainId, "readContracts"], type: "active" });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("txCompleted", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("txCompleted", handler);
      }
    };
  }, [chainId, queryClient]);

  // Batch market data getCompoundData(baseToken, user)
  const compoundCalls = useMemo(() => {
    if (!gatewayAddress || !gatewayAbi || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(t => ({ address: gatewayAddress, abi: gatewayAbi as Abi, functionName: "getCompoundData" as const, args: [t, queryAddress], chainId }));
  }, [gatewayAddress, gatewayAbi, baseTokens, queryAddress, chainId]);
  const { data: compoundResults } = useReadContracts({ allowFailure: true, contracts: compoundCalls, query: { enabled: compoundCalls.length > 0 } });

  // Only fetch collateral details for markets where the user has a position.
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

  const marketForRisk = useMemo(() => {
    if (activeMarketsForCollateral.length > 0) return activeMarketsForCollateral[0].baseToken;
    return baseTokens[0];
  }, [activeMarketsForCollateral, baseTokens]);

  const { ltvBps, lltvBps } = useRiskParams({
    gateway: gatewayAddress,
    gatewayAbi: gatewayAbi,
    marketOrToken: marketForRisk,
    user: queryAddress,
  });

  const depositedIndexByBase = useMemo(() => {
    const indexMap = new Map<number, number>();
    activeMarketsForCollateral.forEach((market, order) => indexMap.set(market.idx, order));
    return indexMap;
  }, [activeMarketsForCollateral]);

  // Batch collateral data per market
  const depositedCalls = useMemo(() => {
    if (!gatewayAddress || !gatewayAbi || activeMarketsForCollateral.length === 0) return [] as any[];
    return activeMarketsForCollateral.map(({ baseToken }) => ({
      address: gatewayAddress,
      abi: gatewayAbi as Abi,
      functionName: "getDepositedCollaterals" as const,
      args: [baseToken, queryAddress],
      chainId,
    }));
  }, [gatewayAddress, gatewayAbi, activeMarketsForCollateral, queryAddress, chainId]);
  const { data: depositedResults } = useReadContracts({ allowFailure: true, contracts: depositedCalls, query: { enabled: depositedCalls.length > 0 } });

  const pricesCalls = useMemo(() => {
    if (!gatewayAddress || !gatewayAbi || !depositedResults) return [] as any[];
    const calls: any[] = [];
    (depositedResults as any[]).forEach((res, i) => {
      const baseToken = activeMarketsForCollateral[i]?.baseToken;
      const colls = ((res?.result?.[0] as Address[] | undefined) || []) as Address[];
      if (colls.length > 0 && baseToken) {
        calls.push({ address: gatewayAddress, abi: gatewayAbi as Abi, functionName: "getPrices" as const, args: [baseToken, colls], chainId });
      }
    });
    return calls;
  }, [gatewayAddress, gatewayAbi, depositedResults, activeMarketsForCollateral, chainId]);
  const { data: pricesResults } = useReadContracts({ allowFailure: true, contracts: pricesCalls, query: { enabled: pricesCalls.length > 0 } });

  const collDecimalsCalls = useMemo(() => {
    if (!uiHelperAddress || !uiHelperAbi || !depositedResults) return [] as any[];
    const calls: any[] = [];
    (depositedResults as any[]).forEach(res => {
      const colls = ((res?.result?.[0] as Address[] | undefined) || []) as Address[];
      if (colls.length > 0) {
        calls.push({ address: uiHelperAddress, abi: uiHelperAbi as Abi, functionName: "getDecimals" as const, args: [colls], chainId });
      }
    });
    return calls;
  }, [uiHelperAddress, uiHelperAbi, depositedResults, chainId]);
  const { data: collDecimalsResults } = useReadContracts({ allowFailure: true, contracts: collDecimalsCalls, query: { enabled: collDecimalsCalls.length > 0 } });

  const priceSymbols = useMemo(() => {
    const symbolsForPrices = new Set<string>();

    symbols.forEach(sym => {
      const clean = sanitizeSymbol(sym);
      if (clean) symbolsForPrices.add(clean);
    });

    (depositedResults as any[] | undefined)?.forEach(res => {
      const names = (res?.result?.[2] as string[] | undefined) || [];
      names.forEach(n => {
        const clean = sanitizeSymbol(n);
        if (clean) symbolsForPrices.add(clean);
      });
    });

    // Sort the array for stable reference across renders when symbols are the same
    return Array.from(symbolsForPrices).sort();
  }, [symbols, depositedResults]);

  const { data: usdPriceMap = {} } = useQuery({
    queryKey: ["compoundUsdPrices", chainId, priceSymbols.join(",")],
    enabled: priceSymbols.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set("symbols", priceSymbols.join(","));
      const res = await fetch(`/api/tokenPrice?${searchParams.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch token prices: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as { prices?: Record<string, number> };
      return json.prices || {};
    },
    // Use structuralSharing to prevent rerenders when data hasn't changed
    structuralSharing: (oldData, newData) => {
      // If both are empty objects, return the old reference
      if (oldData && Object.keys(oldData).length === 0 && Object.keys(newData).length === 0) {
        return oldData;
      }
      // If keys and values are the same, return old reference
      if (oldData) {
        const oldKeys = Object.keys(oldData).sort();
        const newKeys = Object.keys(newData).sort();
        if (oldKeys.length === newKeys.length &&
            oldKeys.every((key, i) => key === newKeys[i] && oldData[key] === newData[key])) {
          return oldData;
        }
      }
      return newData;
    },
  });

  // Helper: Convert Compound's per-second rate to an APR percentage.
  const convertRateToAPR = (ratePerSecond: bigint): number => {
    const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
    return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / 1e18;
  };

  // Aggregate positions dynamically
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];
    if (noMarkets) return { suppliedPositions: supplied, borrowedPositions: borrowed };

    baseTokens.forEach((base, idx) => {
      const compound = (compoundResults?.[idx]?.result as [bigint, bigint, bigint, bigint, bigint, bigint] | undefined);
      const symbol = symbols[idx] || "";
      const decimals = Number((baseTokenDecimals?.[idx] as unknown as bigint) ?? 18n);
      if (!compound) return;

      const [supplyRate, borrowRate, balanceRaw, borrowBalanceRaw, priceRaw, priceScale] = compound;
      const priceDecimals = decimalsFromScale(priceScale ?? 1n);
      const symbolKey = sanitizeSymbol(symbol).toLowerCase();
      const apiUsdPrice = usdPriceMap[symbolKey];
      const fallbackPrice = Number(formatUnits(priceRaw, priceDecimals));
      // API returns 0 when price is not found, so > 0 check is appropriate for fallback
      const price = typeof apiUsdPrice === "number" && apiUsdPrice > 0 ? apiUsdPrice : fallbackPrice;
      const supplyAPR = convertRateToAPR(supplyRate ?? 0n);
      const borrowAPR = convertRateToAPR(borrowRate ?? 0n);

      const tokenBalance = Number(formatUnits(balanceRaw ?? 0n, decimals));
      const usdBalance = tokenBalance * price;
      const tokenBorrow = Number(formatUnits(borrowBalanceRaw ?? 0n, decimals));
      const usdBorrow = tokenBorrow * price;

      // Collateral value for this base token
      let collateralValue = 0;
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

      const swapCollaterals: SwapAsset[] = colls.map((collAddr, i) => {
        const balRaw = balances[i] ?? 0n;
        const dec = Number(collDecs[i] ?? 18n);
        const bal = Number(formatUnits(balRaw, dec));
        const collateralPriceInBase = Number(formatUnits(marketPrices[i] ?? 0n, priceDecimals));
        const collName = collNames[i] || "Collateral";
        const collateralSymbolKey = sanitizeSymbol(collName).toLowerCase();
        const directUsdPrice = usdPriceMap[collateralSymbolKey];
        // API returns 0 when price is not found, so > 0 check is appropriate for fallback
        const collateralUsdPrice = typeof directUsdPrice === "number" && directUsdPrice > 0
          ? directUsdPrice
          : collateralPriceInBase * price;
        const usdValue = Number.isFinite(collateralUsdPrice) ? bal * collateralUsdPrice : 0;
        if (Number.isFinite(usdValue)) {
          collateralValue += usdValue;
        }

        const collateralPrice = Number.isFinite(collateralUsdPrice)
          ? BigInt(Math.round(collateralUsdPrice * 1e8))
          : undefined;

        return {
          symbol: collName,
          address: collAddr as Address,
          decimals: dec,
          rawBalance: balRaw,
          balance: bal,
          icon: tokenNameToLogo(collName) || "/logos/token.svg",
          usdValue,
          price: collateralPrice,
        };
      });

      const safeName = (symbol || "").replace("₮", "T");
      const icon = tokenNameToLogo(safeName) || "/logos/token.svg";

      // Convert price to standard 8-decimal format for consistency
      // If price is finite (from API or fallback), convert to bigint with 8 decimals
      // Otherwise, use raw on-chain price which should also be in the same scale
      const tokenPriceUsd = Number.isFinite(price) ? BigInt(Math.round(price * 1e8)) : priceRaw;

      supplied.push({
        icon,
        name: safeName || "Token",
        balance: usdBalance,
        tokenBalance: balanceRaw ?? 0n,
        currentRate: supplyAPR,
        tokenAddress: base,
        tokenPrice: tokenPriceUsd,
        tokenDecimals: decimals,
        tokenSymbol: safeName,
      });

      borrowed.push({
        icon,
        name: safeName || "Token",
        balance: (borrowBalanceRaw && borrowBalanceRaw > 0n) ? -usdBorrow : 0,
        collateralValue,
        tokenBalance: borrowBalanceRaw ?? 0n,
        currentRate: borrowAPR,
        tokenAddress: base,
        tokenPrice: tokenPriceUsd,
        tokenDecimals: decimals,
        tokenSymbol: safeName,
        collaterals: swapCollaterals,
        collateralView: (
          <CompoundCollateralView
            baseToken={base}
            baseTokenDecimals={decimals}
            compoundData={compound}
            chainId={chainId}
            priceMap={usdPriceMap}
            baseTokenSymbol={safeName}
          />
        ),
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [
    noMarkets,
    baseTokens,
    compoundResults,
    symbols,
    baseTokenDecimals,
    depositedResults,
    pricesResults,
    collDecimalsResults,
    depositedIndexByBase,
    usdPriceMap,
    chainId,
  ]);

  const tokenFilter = new Set(["BTC", "ETH", "WETH", "USDC", "USDT", "USDC.E"]);

  const filteredSuppliedPositions = isWalletConnected
    ? suppliedPositions
    : suppliedPositions.filter(p => tokenFilter.has(sanitizeSymbol(p.name)));
  const filteredBorrowedPositions = isWalletConnected
    ? borrowedPositions
    : borrowedPositions.filter(p => tokenFilter.has(sanitizeSymbol(p.name)));

  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (noMarkets) return;

    const totalSupplied = filteredSuppliedPositions.reduce((sum, position) => sum + position.balance, 0);
    const totalBorrowed = filteredBorrowedPositions.reduce(
      (sum, position) => sum + (position.balance < 0 ? -position.balance : 0),
      0,
    );

    setProtocolTotals("Compound", totalSupplied, totalBorrowed);
  }, [filteredBorrowedPositions, filteredSuppliedPositions, noMarkets, setProtocolTotals]);

  const lltvValue = useMemo(() => (lltvBps > 0n ? lltvBps : ltvBps), [lltvBps, ltvBps]);

  return (
    <div>
        <ProtocolView
          protocolName="Compound V3"
          protocolIcon="/logos/compound.svg"
          ltvBps={ltvBps}
          lltvBps={lltvValue}
          suppliedPositions={filteredSuppliedPositions}
          borrowedPositions={filteredBorrowedPositions}
          forceShowAll={forceShowAll}
          networkType="evm"
          chainId={chainId}
          enabledFeatures={enabledFeatures}
          inlineMarkets={true}
          hideUtilization={true}
      />
    </div>
  );
};

export default CompoundProtocolView;
