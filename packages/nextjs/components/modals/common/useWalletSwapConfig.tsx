/**
 * Configuration hook for WalletSwapModal.
 *
 * This hook encapsulates all the state and logic for wallet-to-wallet swaps,
 * providing a clean interface that can be used with SwapModalShell.
 *
 * Wallet swaps are the simplest swap operation:
 * - No flash loans required
 * - No protocol interactions
 * - Direct swap via 1inch/Pendle
 */

import { useState, useMemo, useCallback, useEffect, type ReactNode } from "react";
import { formatUnits, parseUnits, type Address, erc20Abi } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useBatchingPreference } from "~~/hooks/useBatchingPreference";
import { use1inchTokens } from "~~/hooks/use1inchTokens";
import { usePendleTokens, formatPTTokenForPicker } from "~~/hooks/usePendleTokens";
import { useDirectSwapQuote } from "~~/hooks/useDirectSwapQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { is1inchSupported, isPendleSupported, isPendleToken } from "~~/utils/chainFeatures";
import type { SwapAsset, SwapRouter } from "../SwapModalShell";
import { SearchableTokenPicker, type TokenOption } from "./SearchableTokenPicker";
import type { SwapOperationConfig, UseWalletSwapConfigProps, ExecutionType } from "./swapConfigTypes";

// Common tokens to swap to (by chainId) - fallback when API tokens are loading
const COMMON_SWAP_TARGETS: Record<number, Array<{ address: Address; symbol: string; decimals: number }>> = {
  1: [ // Ethereum
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
  ],
  42161: [ // Arbitrum
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18 },
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 },
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6 },
  ],
  8453: [ // Base
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 },
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
  ],
  10: [ // Optimism
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 },
    { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6 },
  ],
  59144: [ // Linea
    { address: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f", symbol: "WETH", decimals: 18 },
    { address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", symbol: "USDC", decimals: 6 },
  ],
};

// Router addresses
const ONE_INCH_ROUTER: Record<number, Address> = {
  1: "0x111111125421cA6dc452d289314280a0f8842A65",
  42161: "0x111111125421cA6dc452d289314280a0f8842A65",
  8453: "0x111111125421cA6dc452d289314280a0f8842A65",
  10: "0x111111125421cA6dc452d289314280a0f8842A65",
  59144: "0x111111125421cA6dc452d289314280a0f8842A65",
};

const PENDLE_ROUTER: Address = "0x888888888889758F76e7103c6CbF23ABbF58F946";

// 1inch uses this address for native ETH swaps
const NATIVE_TOKEN_1INCH: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const NATIVE_TOKEN_ZERO: Address = "0x0000000000000000000000000000000000000000";

// Extended swap asset type with optional name and subtitle
type ExtendedSwapAsset = SwapAsset & { name?: string; subtitle?: string };

/**
 * Convert 1inch token to SwapAsset format
 */
function oneInchTokenToAsset(
  t: { address: string; symbol: string; name?: string; decimals: number; logoURI?: string }
): ExtendedSwapAsset {
  return {
    symbol: t.symbol,
    name: t.name,
    address: t.address as Address,
    decimals: t.decimals,
    rawBalance: 0n,
    balance: 0,
    icon: t.logoURI || tokenNameToLogo(t.symbol.toLowerCase()),
    price: 0n,
  };
}

/**
 * Convert common target token to SwapAsset format
 */
function commonTargetToAsset(
  t: { address: Address; symbol: string; decimals: number }
): ExtendedSwapAsset {
  return {
    symbol: t.symbol,
    address: t.address,
    decimals: t.decimals,
    rawBalance: 0n,
    balance: 0,
    icon: tokenNameToLogo(t.symbol.toLowerCase()),
    price: 0n,
  };
}

/**
 * Convert Pendle token to SwapAsset format
 */
function pendleTokenToAsset(
  t: Parameters<typeof formatPTTokenForPicker>[0]
): ExtendedSwapAsset {
  const formatted = formatPTTokenForPicker(t);
  return {
    symbol: formatted.symbol,
    name: formatted.name,
    address: formatted.address as Address,
    decimals: formatted.decimals,
    rawBalance: 0n,
    balance: 0,
    icon: formatted.icon,
    price: 0n,
    subtitle: formatted.subtitle,
  };
}

/**
 * Hook that provides all configuration for a wallet swap operation.
 *
 * Returns a SwapOperationConfig that can be spread into SwapModalShell.
 */
export function useWalletSwapConfig(props: UseWalletSwapConfigProps): SwapOperationConfig {
  const { isOpen, onClose, chainId, fromToken, walletTokens, onSuccess } = props;

  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });

  // ============ State ============
  const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(null);
  const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
  const [amountIn, setAmountIn] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(1);
  const [swapRouter, setSwapRouter] = useState<SwapRouter>("1inch");

  // Batching preference
  const { enabled: preferBatching, setEnabled: setPreferBatching } = useBatchingPreference();

  // Router availability
  const oneInchAvailable = is1inchSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);

  // ============ Token Lists ============
  const { tokens: oneInchTokens, isLoading: is1inchTokensLoading } = use1inchTokens({
    chainId,
    enabled: isOpen && oneInchAvailable,
  });

  const { tokens: pendleTokens, isLoading: isPendleTokensLoading } = usePendleTokens({
    chainId,
    enabled: isOpen && pendleAvailable,
  });

  const isTokensLoading = is1inchTokensLoading || (pendleAvailable && isPendleTokensLoading);

  // ============ Asset Conversion ============
  // Convert wallet tokens to SwapAsset format
  const fromAssets = useMemo<SwapAsset[]>(() => {
    return walletTokens
      .filter(t => t.balance > 0n)
      .map(t => ({
        symbol: t.symbol,
        // 1inch expects 0xEeee... for native ETH, not the zero address
        address: t.address === NATIVE_TOKEN_ZERO ? NATIVE_TOKEN_1INCH : t.address,
        decimals: t.decimals,
        rawBalance: t.balance,
        balance: t.balanceFormatted,
        icon: t.icon,
        price: BigInt(Math.floor(t.price * 1e8)),
      }));
  }, [walletTokens]);

  // Build "to" assets from 1inch tokens and Pendle PT tokens
  const toAssets = useMemo<ExtendedSwapAsset[]>(() => {
    const seen = new Set<string>();
    const result: ExtendedSwapAsset[] = [];
    const selectedFromAddr = selectedFrom?.address.toLowerCase();

    // Helper to add token if not already seen
    const addIfNew = (addr: string, asset: ExtendedSwapAsset) => {
      if (addr === selectedFromAddr || seen.has(addr)) return;
      seen.add(addr);
      result.push(asset);
    };

    // Add 1inch tokens (or fallback to common targets)
    const tokenSource = oneInchTokens.length > 0
      ? oneInchTokens.map(t => ({ addr: t.address.toLowerCase(), asset: oneInchTokenToAsset(t) }))
      : (COMMON_SWAP_TARGETS[chainId] || []).map(t => ({ addr: t.address.toLowerCase(), asset: commonTargetToAsset(t) }));

    for (const { addr, asset } of tokenSource) {
      addIfNew(addr, asset);
    }

    // Add Pendle PT tokens if available
    if (pendleAvailable && pendleTokens.length > 0) {
      for (const t of pendleTokens) {
        addIfNew(t.address.toLowerCase(), pendleTokenToAsset(t));
      }
    }

    return result;
  }, [chainId, selectedFrom, oneInchTokens, pendleTokens, pendleAvailable]);

  // ============ Effects ============
  // Initialize from token when modal opens
  useEffect(() => {
    if (isOpen && fromToken) {
      // Map zero address to 1inch native address for matching
      const lookupAddr = fromToken.address === NATIVE_TOKEN_ZERO
        ? NATIVE_TOKEN_1INCH.toLowerCase()
        : fromToken.address.toLowerCase();
      const asset = fromAssets.find(a => a.address.toLowerCase() === lookupAddr);
      if (asset) setSelectedFrom(asset);
    }
  }, [isOpen, fromToken, fromAssets]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAmountIn("");
      setIsMax(false);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Auto-switch router based on PT token involvement
  useEffect(() => {
    const fromIsPT = selectedFrom && isPendleToken(selectedFrom.symbol);
    const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);

    if ((fromIsPT || toIsPT) && pendleAvailable) {
      setSwapRouter("pendle");
    } else if (!fromIsPT && !toIsPT && oneInchAvailable) {
      setSwapRouter("1inch");
    }
  }, [selectedFrom, selectedTo, pendleAvailable, oneInchAvailable]);

  // ============ Quote Fetching ============
  const rawAmountIn = useMemo(() => {
    if (!selectedFrom || !amountIn) return "0";
    try {
      return parseUnits(amountIn, selectedFrom.decimals).toString();
    } catch {
      return "0";
    }
  }, [amountIn, selectedFrom]);

  // 1inch quote
  const {
    data: oneInchQuote,
    isLoading: is1inchLoading,
    error: oneInchError,
  } = useDirectSwapQuote({
    chainId,
    src: selectedFrom?.address || "0x",
    dst: selectedTo?.address || "0x",
    amount: rawAmountIn,
    userAddress: userAddress || "0x",
    slippage,
    enabled: isOpen && swapRouter === "1inch" && !!selectedFrom && !!selectedTo && !!userAddress && rawAmountIn !== "0",
  });

  // Pendle quote
  const {
    data: pendleQuote,
    isLoading: isPendleLoading,
    error: pendleError,
  } = usePendleConvert({
    chainId,
    receiver: userAddress || "0x",
    tokensIn: selectedFrom?.address || "0x",
    tokensOut: selectedTo?.address || "0x",
    amountsIn: rawAmountIn,
    slippage: slippage / 100,
    enabled: isOpen && swapRouter === "pendle" && !!selectedFrom && !!selectedTo && !!userAddress && rawAmountIn !== "0",
  });

  const isQuoteLoading = isTokensLoading || (swapRouter === "1inch" ? is1inchLoading : isPendleLoading);
  const quoteError = swapRouter === "1inch" ? oneInchError : pendleError;

  // ============ Output Amount ============
  const amountOut = useMemo(() => {
    if (!selectedTo) return "";
    if (swapRouter === "1inch") {
      if (!oneInchQuote?.dstAmount) return "";
      return formatUnits(BigInt(oneInchQuote.dstAmount), selectedTo.decimals);
    } else {
      const outAmount = pendleQuote?.data?.amountTokenOut || pendleQuote?.data?.amountPtOut;
      if (!outAmount) return "";
      return formatUnits(BigInt(outAmount), selectedTo.decimals);
    }
  }, [swapRouter, oneInchQuote, pendleQuote, selectedTo]);

  // ============ Price Impact ============
  const priceImpact = useMemo(() => {
    if (swapRouter === "1inch") {
      if (!oneInchQuote?.srcUSD || !oneInchQuote?.dstUSD) return null;
      const srcUsd = parseFloat(oneInchQuote.srcUSD);
      const dstUsd = parseFloat(oneInchQuote.dstUSD);
      if (srcUsd === 0) return null;
      return ((srcUsd - dstUsd) / srcUsd) * 100;
    } else {
      if (pendleQuote?.data?.priceImpact !== undefined) {
        return Math.abs(pendleQuote.data.priceImpact * 100);
      }
      return null;
    }
  }, [swapRouter, oneInchQuote, pendleQuote]);

  // ============ Approval & Execution ============
  const getRouterAddress = useCallback((): Address | null => {
    if (swapRouter === "1inch") return ONE_INCH_ROUTER[chainId] || null;
    return PENDLE_ROUTER;
  }, [swapRouter, chainId]);

  const isNativeToken = selectedFrom?.address === NATIVE_TOKEN_1INCH || selectedFrom?.address === NATIVE_TOKEN_ZERO;

  const checkApproval = useCallback(async (): Promise<boolean> => {
    // Native ETH doesn't need approval — it's sent as msg.value
    if (isNativeToken) return true;
    if (!publicClient || !userAddress || !selectedFrom || rawAmountIn === "0") return false;
    const routerAddress = getRouterAddress();
    if (!routerAddress) return false;

    try {
      const allowance = await publicClient.readContract({
        address: selectedFrom.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress, routerAddress],
      });
      return allowance >= BigInt(rawAmountIn);
    } catch {
      return false;
    }
  }, [isNativeToken, publicClient, userAddress, selectedFrom, rawAmountIn, getRouterAddress]);

  const handleApprove = useCallback(async () => {
    if (!walletClient || !publicClient || !selectedFrom || !userAddress) return;
    const routerAddress = getRouterAddress();
    if (!routerAddress) throw new Error(`${swapRouter} router not found for this chain`);

    const hash = await walletClient.writeContract({
      address: selectedFrom.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [routerAddress, BigInt(rawAmountIn)],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }, [walletClient, publicClient, selectedFrom, userAddress, swapRouter, rawAmountIn, getRouterAddress]);

  const handleSubmit = useCallback(async () => {
    if (!walletClient || !publicClient || !userAddress) return;
    if (swapRouter === "1inch" && !oneInchQuote?.tx) return;
    if (swapRouter === "pendle" && !pendleQuote?.transaction) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Check and handle approval
      const hasApproval = await checkApproval();
      if (!hasApproval) {
        await handleApprove();
      }

      // Execute swap
      let hash: `0x${string}`;
      if (swapRouter === "1inch") {
        if (!oneInchQuote?.tx) throw new Error("1inch quote not available");
        const tx = oneInchQuote.tx;
        hash = await walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value || "0"),
        });
      } else {
        if (!pendleQuote?.transaction) throw new Error("Pendle quote not available");
        const tx = pendleQuote.transaction;
        hash = await walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value || "0"),
        });
      }

      await publicClient.waitForTransactionReceipt({ hash });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("[WalletSwapConfig] Swap failed:", err);
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    walletClient,
    publicClient,
    userAddress,
    swapRouter,
    oneInchQuote,
    pendleQuote,
    checkApproval,
    handleApprove,
    onSuccess,
    onClose,
  ]);

  // ============ Can Submit ============
  const canSubmit = useMemo(() => {
    const hasQuote = swapRouter === "1inch" ? !!oneInchQuote?.tx : !!pendleQuote?.transaction;
    const routerSupported = swapRouter === "1inch" ? oneInchAvailable : pendleAvailable;

    return (
      !!selectedFrom &&
      !!selectedTo &&
      hasQuote &&
      !isQuoteLoading &&
      !isSubmitting &&
      rawAmountIn !== "0" &&
      routerSupported
    );
  }, [selectedFrom, selectedTo, swapRouter, oneInchQuote, pendleQuote, isQuoteLoading, isSubmitting, rawAmountIn, oneInchAvailable, pendleAvailable]);

  // ============ Submit Label ============
  const submitLabel = useMemo(() => {
    const routerSupported = swapRouter === "1inch" ? oneInchAvailable : pendleAvailable;
    if (!routerSupported) return `${swapRouter === "1inch" ? "1inch" : "Pendle"} not supported`;
    if (!selectedFrom) return "Select token";
    if (!selectedTo) return "Select output token";
    if (rawAmountIn === "0") return "Enter amount";
    return "Swap";
  }, [swapRouter, oneInchAvailable, pendleAvailable, selectedFrom, selectedTo, rawAmountIn]);

  // ============ Custom Token Picker ============
  const tokenPickerOptions = useMemo<TokenOption[]>(() => {
    return toAssets.map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name || t.symbol,
      decimals: t.decimals,
      icon: t.icon,
      balance: t.balance,
      subtitle: t.subtitle,
    }));
  }, [toAssets]);

  const selectedTokenOption = useMemo<TokenOption | null>(() => {
    if (!selectedTo) return null;
    return {
      address: selectedTo.address,
      symbol: selectedTo.symbol,
      decimals: selectedTo.decimals,
      icon: selectedTo.icon,
      balance: selectedTo.balance,
    };
  }, [selectedTo]);

  const handleTokenPickerSelect = useCallback((token: TokenOption) => {
    const asset = toAssets.find(a => a.address.toLowerCase() === token.address.toLowerCase());
    if (asset) setSelectedTo(asset);
  }, [toAssets]);

  const customToTokenPicker: ReactNode = (
    <SearchableTokenPicker
      selected={selectedTokenOption}
      options={tokenPickerOptions}
      onSelect={handleTokenPickerSelect}
      placeholder="Select token"
      isLoading={isTokensLoading}
    />
  );

  // ============ Info Content ============
  const infoContent: ReactNode = (
    <div className="space-y-3 text-sm">
      <p>
        <strong>Direct Wallet Swap</strong>
      </p>
      <p className="text-base-content/70">
        {swapRouter === "pendle"
          ? "Swap PT tokens via Pendle router for optimal rates on principal tokens."
          : "Swap tokens directly from your wallet using 1inch aggregator for best rates."}
      </p>
      <ul className="text-base-content/70 list-disc space-y-1 pl-4">
        {swapRouter === "pendle" ? (
          <>
            <li>Optimized routing for PT tokens</li>
            <li>Automatic underlying asset conversion</li>
          </>
        ) : (
          <li>Best rates across multiple DEXs</li>
        )}
        <li>Approval required for first swap of each token</li>
        <li>Gas fees paid in native token (ETH)</li>
      </ul>
    </div>
  );

  // ============ Enriched selectedTo with price derived from quote ============
  // The toAssets don't have prices. Derive the output token price from:
  // 1. The 1inch quote's dstUSD field (if available)
  // 2. Fallback: use the from token price + exchange ratio from the quote
  const enrichedSelectedTo = useMemo<SwapAsset | null>(() => {
    if (!selectedTo) return null;
    if (selectedTo.price && selectedTo.price > 0n) return selectedTo;

    if (swapRouter === "1inch" && oneInchQuote?.dstAmount) {
      const dstAmountNum = Number(formatUnits(BigInt(oneInchQuote.dstAmount), selectedTo.decimals));
      if (dstAmountNum <= 0) return selectedTo;

      // Try dstUSD first (may not be returned by all 1inch endpoints)
      if (oneInchQuote.dstUSD) {
        const dstUsd = parseFloat(oneInchQuote.dstUSD);
        if (dstUsd > 0) {
          return { ...selectedTo, price: BigInt(Math.round((dstUsd / dstAmountNum) * 1e8)) };
        }
      }

      // Fallback: derive from the from-token price and the exchange ratio
      if (selectedFrom?.price && selectedFrom.price > 0n) {
        const srcAmountNum = Number(formatUnits(
          BigInt(oneInchQuote.srcAmount || rawAmountIn),
          selectedFrom.decimals,
        ));
        if (srcAmountNum > 0) {
          const fromPriceUsd = Number(selectedFrom.price) / 1e8;
          const toTokenPrice = (fromPriceUsd * srcAmountNum) / dstAmountNum;
          return { ...selectedTo, price: BigInt(Math.round(toTokenPrice * 1e8)) };
        }
      }
    }

    return selectedTo;
  }, [selectedTo, selectedFrom, swapRouter, oneInchQuote, rawAmountIn]);

  // ============ Warnings ============
  const warnings: ReactNode = error ? (
    <div className="alert alert-error text-sm">{error}</div>
  ) : undefined;

  // ============ Return Config ============
  return {
    // Operation identity
    operationType: "wallet-swap",
    title: "Swap",
    protocolName: "Wallet",

    // Token configuration
    fromAssets,
    toAssets,
    selectedFrom,
    selectedTo: enrichedSelectedTo,
    setSelectedFrom,
    setSelectedTo,
    fromReadOnly: false,
    toReadOnly: false,
    fromLabel: "You Pay",
    toLabel: "You Receive",

    // Amount state
    amountIn,
    setAmountIn,
    isMax,
    setIsMax,
    amountOut,

    // Quote state
    isQuoteLoading,
    quoteError,
    priceImpact,

    // Slippage
    slippage,
    setSlippage,

    // Execution - wallet swaps are always market orders, no limit order support
    executionType: "market" as ExecutionType,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setExecutionType: () => {},
    isSubmitting,
    canSubmit,
    submitLabel,
    onSubmit: handleSubmit,

    // Batching
    preferBatching,
    setPreferBatching,

    // UI customization
    infoContent,
    warnings,
    customToTokenPicker,
    hideDefaultStats: false,
  };
}
