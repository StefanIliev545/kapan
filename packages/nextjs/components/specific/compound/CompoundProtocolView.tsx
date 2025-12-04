import { FC, useEffect, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { CompoundCollateralView } from "./CompoundCollateralView";
import { Address, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { Abi } from "abitype";
import { useQueryClient } from "@tanstack/react-query";
import type { SwapAsset } from "../../modals/SwapModalShell";

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
  const { data: uiHelper } = useScaffoldContract({ contractName: "UiHelper", chainId: chainId as any });
  const uiHelperAddress = uiHelper?.address as Address | undefined;

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
    if (!gatewayAddress || !gateway || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(t => ({ address: gatewayAddress, abi: gateway.abi as Abi, functionName: "getCompoundData" as const, args: [t, queryAddress], chainId }));
  }, [gatewayAddress, gateway, baseTokens, queryAddress, chainId]);
  const { data: compoundResults } = useReadContracts({ allowFailure: true, contracts: compoundCalls, query: { enabled: compoundCalls.length > 0 } });

// Batch collateral data per market
  const depositedCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || baseTokens.length === 0) return [] as any[];
    return baseTokens.map(t => ({ address: gatewayAddress, abi: gateway.abi as Abi, functionName: "getDepositedCollaterals" as const, args: [t, queryAddress], chainId }));
  }, [gatewayAddress, gateway, baseTokens, queryAddress, chainId]);
  const { data: depositedResults } = useReadContracts({ allowFailure: true, contracts: depositedCalls, query: { enabled: depositedCalls.length > 0 } });

  const pricesCalls = useMemo(() => {
    if (!gatewayAddress || !gateway || !depositedResults) return [] as any[];
    const calls: any[] = [];
    (depositedResults as any[]).forEach((res, i) => {
      const colls = ((res?.result?.[0] as Address[] | undefined) || []) as Address[];
      if (colls.length > 0) {
        calls.push({ address: gatewayAddress, abi: gateway.abi as Abi, functionName: "getPrices" as const, args: [baseTokens[i], colls], chainId });
      }
    });
    return calls;
  }, [gatewayAddress, gateway, depositedResults, baseTokens, chainId]);
  const { data: pricesResults } = useReadContracts({ allowFailure: true, contracts: pricesCalls, query: { enabled: pricesCalls.length > 0 } });

  const collDecimalsCalls = useMemo(() => {
    if (!uiHelperAddress || !uiHelper || !depositedResults) return [] as any[];
    const calls: any[] = [];
    (depositedResults as any[]).forEach(res => {
      const colls = ((res?.result?.[0] as Address[] | undefined) || []) as Address[];
      if (colls.length > 0) {
        calls.push({ address: uiHelperAddress, abi: uiHelper.abi as Abi, functionName: "getDecimals" as const, args: [colls], chainId });
      }
    });
    return calls;
  }, [uiHelperAddress, uiHelper, depositedResults, chainId]);
  const { data: collDecimalsResults } = useReadContracts({ allowFailure: true, contracts: collDecimalsCalls, query: { enabled: collDecimalsCalls.length > 0 } });

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
      const price = Number(formatUnits(priceRaw, priceDecimals));
      const supplyAPR = convertRateToAPR(supplyRate ?? 0n);
      const borrowAPR = convertRateToAPR(borrowRate ?? 0n);

      const tokenBalance = Number(formatUnits(balanceRaw ?? 0n, decimals));
      const usdBalance = tokenBalance * price;
      const tokenBorrow = Number(formatUnits(borrowBalanceRaw ?? 0n, decimals));
      const usdBorrow = tokenBorrow * price;

      // Collateral value for this base token
      let collateralValue = 0;
      const depRes = depositedResults?.[idx]?.result as [Address[], bigint[], string[]] | undefined;
      const colls = depRes?.[0] ?? [];
      const balances = depRes?.[1] ?? [];
      const collNames = depRes?.[2] ?? [];

      // locate prices/decimals array index among non-empty markets
      const locateRank = (): number => {
        if (!depositedResults) return -1;
        let rank = -1;
        let seen = 0;
        for (let i = 0; i < depositedResults.length; i++) {
          const r = depositedResults[i]?.result as [Address[], bigint[], string[]] | undefined;
          if ((r?.[0]?.length ?? 0) > 0) {
            if (i === idx) { rank = seen; break; }
            seen++;
          }
        }
        return rank;
      };

      let marketPrices: bigint[] = [];
      let collDecs: bigint[] = [];
      const nonEmptyRank = locateRank();
      if (nonEmptyRank >= 0) {
        marketPrices = (pricesResults?.[nonEmptyRank]?.result as bigint[] | undefined) ?? [];
        collDecs = (collDecimalsResults?.[nonEmptyRank]?.result as bigint[] | undefined) ?? [];
      }

      const swapCollaterals: SwapAsset[] = colls.map((collAddr, i) => {
        const balRaw = balances[i] ?? 0n;
        const dec = Number(collDecs[i] ?? 18n);
        const bal = Number(formatUnits(balRaw, dec));
        const collateralPriceInBase = Number(formatUnits(marketPrices[i] ?? 0n, priceDecimals));
        const collateralUsdPrice = collateralPriceInBase * price;
        const usdValue = Number.isFinite(collateralUsdPrice) ? bal * collateralUsdPrice : 0;
        if (Number.isFinite(usdValue)) {
          collateralValue += usdValue;
        }

        const collateralPrice = Number.isFinite(collateralUsdPrice)
          ? BigInt(Math.round(collateralUsdPrice * 1e8))
          : undefined;

        const name = collNames[i] || "Collateral";

        return {
          symbol: name,
          address: collAddr as Address,
          decimals: dec,
          rawBalance: balRaw,
          balance: bal,
          icon: tokenNameToLogo(name) || "/logos/token.svg",
          usdValue,
          price: collateralPrice,
        };
      });

      const safeName = (symbol || "").replace("₮", "T");
      const icon = tokenNameToLogo(safeName) || "/logos/token.svg";

      supplied.push({
        icon,
        name: safeName || "Token",
        balance: usdBalance,
        tokenBalance: balanceRaw ?? 0n,
        currentRate: supplyAPR,
        tokenAddress: base,
        tokenPrice: priceRaw,
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
        tokenPrice: priceRaw,
        tokenDecimals: decimals,
        tokenSymbol: safeName,
        collaterals: swapCollaterals,
        collateralView: (
          <CompoundCollateralView baseToken={base} baseTokenDecimals={decimals} compoundData={compound} chainId={chainId} />
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
    chainId,
  ]);

  const tokenFilter = new Set(["BTC", "ETH", "WETH", "USDC", "USDT", "USDC.E"]);
  const sanitize = (name: string) => name.replace("₮", "T").replace(/[^a-zA-Z.]/g, "").toUpperCase();

  const filteredSuppliedPositions = isWalletConnected
    ? suppliedPositions
    : suppliedPositions.filter(p => tokenFilter.has(sanitize(p.name)));
  const filteredBorrowedPositions = isWalletConnected
    ? borrowedPositions
    : borrowedPositions.filter(p => tokenFilter.has(sanitize(p.name)));

  // Hardcode current LTV (or fetch from contract if needed).
  const currentLtv = 75;

  return (
    <div>
      <ProtocolView
        protocolName="Compound V3"
        protocolIcon="/logos/compound.svg"
        ltv={currentLtv as any}
        maxLtv={undefined as any}
        suppliedPositions={filteredSuppliedPositions}
        borrowedPositions={filteredBorrowedPositions}
        hideUtilization={true}
        forceShowAll={forceShowAll}
        networkType="evm"
        chainId={chainId}
        enabledFeatures={enabledFeatures}
      />
    </div>
  );
};

export default CompoundProtocolView;
