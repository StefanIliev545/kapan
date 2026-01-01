import { FC, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import Image from "next/image";
import { Address, formatUnits, parseUnits } from "viem";
import { CheckIcon, ClockIcon } from "@heroicons/react/24/outline";

import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { usePredictiveMaxLeverage, EModeCategory } from "~~/hooks/usePredictiveLtv";
import { useCowOrder } from "~~/hooks/useCowOrder";
import { useCowQuote, getCowQuoteBuyAmount } from "~~/hooks/useCowQuote";
import { SwapAsset, SwapRouter, SWAP_ROUTER_OPTIONS } from "./SwapModalShell";
import { 
  FlashLoanProvider, 
  MorphoMarketContextForEncoding, 
  encodeMorphoContext,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodePushToken,
  encodeApprove,
  encodeAdd,
  encodeLendingInstruction,
  LendingOp,
  normalizeProtocolName,
  ProtocolInstruction,
} from "~~/utils/v2/instructionHelpers";
import { CompletionType, getCowExplorerAddressUrl, calculateChunkParams, calculateSwapRate, type ChunkCalculationResult, getFlashLoanLender, calculateFlashLoanFee, COW_PROTOCOL, COW_FLASH_LOAN_ROUTER } from "~~/utils/cow";
import { calculateSuggestedSlippage } from "~~/utils/slippage";
import { formatBps } from "~~/utils/risk";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isAaveV3Supported, isBalancerV2Supported, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { useAccount } from "wagmi";
import { useSendCalls, useCallsStatus } from "wagmi/experimental";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { encodeFunctionData, type Hex } from "viem";

interface MultiplyEvmModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  collaterals: SwapAsset[];  // Should be pre-filtered by caller if needed (e.g., E-Mode compatible)
  debtOptions: SwapAsset[];  // Should be pre-filtered by caller if needed
  market?: Address;
  morphoContext?: MorphoMarketContextForEncoding;  // Optional Morpho market context for preselected markets
  maxLtvBps?: bigint;
  lltvBps?: bigint;
  supplyApyMap?: Record<string, number>; // address -> APY %
  borrowApyMap?: Record<string, number>; // address -> APY %
  eMode?: EModeCategory | null;  // Optional E-Mode for LTV/liquidation threshold override
  disableAssetSelection?: boolean;  // If true, disable collateral/debt dropdowns (e.g., for Morpho preselected markets)
}

// No additional safety buffer - the protocol's LTV vs liquidation threshold gap is sufficient
const SAFETY_BUFFER = 1.0;

const PROTOCOL_DEFAULT_LTV: Record<string, number> = {
  aave: 8000, compound: 7500, venus: 7500, euler: 8500, default: 7500,
};

const getProtocolDefaultLtv = (protocolName: string): bigint => {
  const key = protocolName.toLowerCase();
  for (const [protocol, ltv] of Object.entries(PROTOCOL_DEFAULT_LTV)) {
    if (key.includes(protocol)) return BigInt(ltv);
  }
  return BigInt(PROTOCOL_DEFAULT_LTV.default);
};

const calculateMaxLeverage = (ltvBps: bigint, protocolName: string): number => {
  const minReasonableLtv = 5000n;
  const effectiveLtvBps = ltvBps >= minReasonableLtv ? ltvBps : getProtocolDefaultLtv(protocolName);
  const effectiveLtv = Number(effectiveLtvBps) / 10000;
  if (effectiveLtv <= 0) return 1;
  if (effectiveLtv >= 0.99) return 100;
  return Math.round((1 / (1 - effectiveLtv)) * 100) / 100;
};

const calculateFlashLoanAmount = (
  marginCollateral: bigint, leverage: number, collateralPrice: bigint,
  debtPrice: bigint, collateralDecimals: number, debtDecimals: number
): bigint => {
  if (leverage <= 1 || marginCollateral === 0n || collateralPrice === 0n || debtPrice === 0n) return 0n;
  const marginUsd = (marginCollateral * collateralPrice) / BigInt(10 ** collateralDecimals);
  const leverageMultiplier = Math.round((leverage - 1) * 10000);
  const additionalExposureUsd = (marginUsd * BigInt(leverageMultiplier)) / 10000n;
  return (additionalExposureUsd * BigInt(10 ** debtDecimals)) / debtPrice;
};

export const MultiplyEvmModal: FC<MultiplyEvmModalProps> = ({
  isOpen, onClose, protocolName, chainId, collaterals, debtOptions, market, morphoContext,
  maxLtvBps = 8000n, lltvBps = 8500n, supplyApyMap = {}, borrowApyMap = {}, eMode, disableAssetSelection = false,
}) => {
  const wasOpenRef = useRef(false);
  const [collateral, setCollateral] = useState<SwapAsset | undefined>(collaterals[0]);
  const [debt, setDebt] = useState<SwapAsset | undefined>(debtOptions[0]);
  const [marginAmount, setMarginAmount] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(1);
  const [leverageInput, setLeverageInput] = useState<string>("1.00");
  const [slippage, setSlippage] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Execution type: "market" (flash loan, instant) vs "limit" (CoW, async chunks)
  type ExecutionType = "market" | "limit";
  const [executionType, setExecutionType] = useState<ExecutionType>("market");
  
  // CoW limit order specific state
  // Limit order slippage: how much worse than market price we accept (allows filling when price moves)
  // Default 0.1% - will be auto-adjusted based on price impact on first quote
  const [limitSlippage, setLimitSlippage] = useState<number>(0.1);
  const [hasAutoSetLimitSlippage, setHasAutoSetLimitSlippage] = useState(false);
  const [customMinPrice, setCustomMinPrice] = useState<string>(""); // User override for min price
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false);
  const [lastOrderSalt, setLastOrderSalt] = useState<string | null>(null); // Store salt for CoW Explorer link
  const [limitOrderNotificationId, setLimitOrderNotificationId] = useState<string | number | null>(null); // Track loading notification
  const cowAvailable = isCowProtocolSupported(chainId);
  
  // Check if we're in a dev environment
  const isDevEnvironment = process.env.NODE_ENV === 'development';
  
  // Flash loan toggle for limit orders - enables single-tx execution via CoW Protocol flash loans
  const [useFlashLoan, setUseFlashLoan] = useState<boolean>(true); // Default ON
  
  // Get user address for CoW order creation
  const { address: userAddress } = useAccount();
  
  // CoW order hook
  const { createOrder: createCowOrder, buildOrderCalls, isCreating: isCowCreating, isAvailable: cowContractAvailable, orderManagerAddress } = useCowOrder();
  
  // Check swap router availability for this chain
  const oneInchAvailable = is1inchSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const defaultRouter = getDefaultSwapRouter(chainId);
  
  // Swap router selection - default based on chain availability
  const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");
  
  // Update swap router if chain changes and current router is not available
  useEffect(() => {
    if (swapRouter === "1inch" && !oneInchAvailable) {
      setSwapRouter(pendleAvailable ? "pendle" : "1inch");
    } else if (swapRouter === "pendle" && !pendleAvailable) {
      setSwapRouter(oneInchAvailable ? "1inch" : "pendle");
    }
  }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

  // Auto-switch to Pendle when a PT token is involved
  useEffect(() => {
    const collateralIsPT = collateral && isPendleToken(collateral.symbol);
    const debtIsPT = debt && isPendleToken(debt.symbol);
    if ((collateralIsPT || debtIsPT) && pendleAvailable) {
      setSwapRouter("pendle");
    }
  }, [collateral, debt, pendleAvailable]);
  
  // Zap mode: deposit debt token instead of collateral (e.g., USDe → PT-USDe)
  const [zapMode, setZapMode] = useState(false);

  // Fetch predictive LTV data for the selected collateral/debt pair
  // E-Mode is passed as prop for protocols that support it (e.g., Aave)
  const {
    maxLeverage: predictiveMaxLeverage,
    liquidationThreshold: predictiveLiqThreshold,
    collateralConfig,
    isEModeActive,
  } = usePredictiveMaxLeverage(
    protocolName,
    collateral?.address,
    debt?.address,
    market,
    chainId,
    SAFETY_BUFFER,
    eMode ?? null
  );

  // Use predictive max leverage if available (from collateral config or E-Mode)
  // Adjust for slippage: with slippage s, actual LTV = (L-1) / (1 + (L-1)*(1-s))
  // To achieve target LTV T with slippage s: L = (1 + T*s) / (1 - T*(1-s))
  const maxLeverage = useMemo(() => {
    let baseLeverage: number;
    if (predictiveMaxLeverage > 1 && (collateralConfig || isEModeActive)) {
      baseLeverage = predictiveMaxLeverage;
    } else {
      baseLeverage = calculateMaxLeverage(maxLtvBps, protocolName);
    }
    
    // Adjust max leverage to account for swap slippage
    // If we use leverage L with slippage s, actual LTV = (L-1) / (1 + (L-1)*(1-s))
    // This is higher than (L-1)/L, so we need to reduce max leverage
    // Formula: targetLTV = (L-1) / (1 + (L-1)*(1-s))
    // Solving for L when we want actual LTV to hit target:
    // L = (1 + targetLTV * slippageDecimal) / (1 - targetLTV * (1 - slippageDecimal))
    const slippageDecimal = slippage / 100; // Convert 1% to 0.01
    const targetLtv = (baseLeverage - 1) / baseLeverage; // The LTV we want to achieve
    
    if (targetLtv >= 0.99 || slippageDecimal >= 1) return baseLeverage;
    
    const adjustedLeverage = (1 + targetLtv * slippageDecimal) / (1 - targetLtv * (1 - slippageDecimal));
    return Math.round(Math.min(adjustedLeverage, baseLeverage) * 100) / 100;
  }, [predictiveMaxLeverage, collateralConfig, isEModeActive, maxLtvBps, protocolName, slippage]);

  // Use predictive liquidation threshold if available (from collateral config or E-Mode)
  const effectiveLltvBps = useMemo(() => {
    if (predictiveLiqThreshold > 0 && (collateralConfig || isEModeActive)) {
      return BigInt(Math.round(predictiveLiqThreshold * 100)); // Convert % to bps
    }
    return lltvBps;
  }, [predictiveLiqThreshold, collateralConfig, isEModeActive, lltvBps]);

  const updateLeverage = (val: number) => {
    const clamped = Math.min(Math.max(1, val), maxLeverage);
    setLeverage(clamped);
    setLeverageInput(clamped.toFixed(2));
  };

  // Fetch wallet balances for both collaterals and debt options (for zap mode)
  const allTokens = useMemo(() => {
    const tokens = [...collaterals.map(c => ({ address: c.address, decimals: c.decimals }))];
    debtOptions.forEach(d => {
      if (!tokens.find(t => t.address.toLowerCase() === d.address.toLowerCase())) {
        tokens.push({ address: d.address, decimals: d.decimals });
      }
    });
    return tokens;
  }, [collaterals, debtOptions]);

  const { balances: walletBalances } = useWalletTokenBalances({
    tokens: allTokens, network: "evm", chainId,
  });

  // Add wallet balances and sort by balance (highest first)
  // Note: Collaterals/debtOptions should already be filtered by the parent if needed (e.g., E-Mode)
  const collateralsWithWalletBalance = useMemo(() => {
    const withBalance = collaterals.map(c => ({
      ...c, walletBalance: walletBalances[c.address.toLowerCase()]?.balance ?? 0n,
    }));
    // Sort by wallet balance descending (tokens with balance first)
    return withBalance.sort((a, b) => {
      if (a.walletBalance > b.walletBalance) return -1;
      if (a.walletBalance < b.walletBalance) return 1;
      return 0;
    });
  }, [collaterals, walletBalances]);

  const debtWithWalletBalance = useMemo(() => {
    const withBalance = debtOptions.map(d => ({
      ...d, walletBalance: walletBalances[d.address.toLowerCase()]?.balance ?? 0n,
    }));
    // Sort by wallet balance descending (tokens with balance first)
    return withBalance.sort((a, b) => {
      if (a.walletBalance > b.walletBalance) return -1;
      if (a.walletBalance < b.walletBalance) return 1;
      return 0;
    });
  }, [debtOptions, walletBalances]);

  const currentCollateral = useMemo(() =>
    collateral ? collateralsWithWalletBalance.find(c => c.address === collateral.address) : undefined,
    [collateral, collateralsWithWalletBalance]);

  const currentDebt = useMemo(() =>
    debt ? debtWithWalletBalance.find(d => d.address === debt.address) : undefined,
    [debt, debtWithWalletBalance]);

  // In zap mode, wallet balance is the debt token; otherwise collateral
  const walletBalance = zapMode ? (currentDebt?.walletBalance ?? 0n) : (currentCollateral?.walletBalance ?? 0n);
  const depositToken = zapMode ? debt : collateral;
  const depositDecimals = depositToken?.decimals ?? 18;

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setMarginAmount(""); setLeverage(1); setLeverageInput("1.00");
      track("multiply_modal_open", { protocol: protocolName, chainId });
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, protocolName, chainId]);

  // Set initial collateral/debt from filtered lists (sorted by balance)
  useEffect(() => {
    if (collateralsWithWalletBalance.length > 0 && !collateral) {
      setCollateral(collateralsWithWalletBalance[0]);
    }
    if (debtWithWalletBalance.length > 0 && !debt) {
      setDebt(debtWithWalletBalance[0]);
    }
  }, [collateralsWithWalletBalance, debtWithWalletBalance, collateral, debt]);

  // Get adapter info directly from deployed contracts - no RPC calls needed
  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const pendleAdapter = getPendleAdapterInfo(chainId);

  // In zap mode, margin is in debt token terms; otherwise collateral
  const marginAmountRaw = useMemo(() => {
    try {
      if (!depositToken) return 0n;
      const parsed = parseUnits(marginAmount || "0", depositDecimals);
      return parsed > 0n ? parsed : 0n; // Ensure non-negative
    }
    catch { return 0n; }
  }, [depositToken, depositDecimals, marginAmount]);

  const flashLoanAmountRaw = useMemo(() => {
    if (!collateral || !debt || leverage <= 1 || marginAmountRaw === 0n) return 0n;
    
    if (zapMode) {
      // In zap mode, margin is in debt terms, so calculate flash loan differently
      // marginAmount is in debt tokens, flash loan = margin * (leverage - 1)
      const leverageMultiplier = Math.round((leverage - 1) * 10000);
      return (marginAmountRaw * BigInt(leverageMultiplier)) / 10000n;
    }
    
    return calculateFlashLoanAmount(marginAmountRaw, leverage, collateral.price ?? 0n, debt.price ?? 0n, collateral.decimals, debt.decimals);
  }, [collateral, debt, leverage, marginAmountRaw, zapMode]);

  // Total amount to swap in zap mode (deposit + flash loan)
  const totalSwapAmount = useMemo(() => {
    if (!zapMode) return flashLoanAmountRaw;
    return marginAmountRaw + flashLoanAmountRaw;
  }, [zapMode, marginAmountRaw, flashLoanAmountRaw]);

  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen, networkType: "evm", fromProtocol: protocolName, chainId,
    position: collateral ? { name: collateral.symbol, tokenAddress: collateral.address, decimals: collateral.decimals, type: "supply" }
      : { name: "", tokenAddress: "0x0000000000000000000000000000000000000000", decimals: 18, type: "supply" },
  });

  const providerOptions = useMemo(() => {
    if (flashLoanProviders?.length) return flashLoanProviders;
    if (defaultFlashLoanProvider) return [defaultFlashLoanProvider];
    // Chain-appropriate fallback - prefer Aave on chains where Balancer isn't available
    if (isAaveV3Supported(chainId) && !isBalancerV2Supported(chainId)) {
      return [{ name: "Aave", icon: "/logos/aave.svg", version: "aave", providerEnum: FlashLoanProvider.Aave }];
    }
    return [{ name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2", providerEnum: FlashLoanProvider.BalancerV2 }];
  }, [defaultFlashLoanProvider, flashLoanProviders, chainId]);

  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders: providerOptions, defaultProvider: defaultFlashLoanProvider ?? providerOptions[0],
    tokenAddress: debt?.address as Address, amount: flashLoanAmountRaw, chainId,
  });

  // Swap amount: in zap mode, swap everything (deposit + flash loan); otherwise just flash loan
  const swapQuoteAmount = zapMode ? totalSwapAmount : flashLoanAmountRaw;

  // 1inch Quote
  const { data: oneInchQuote, isLoading: is1inchLoading } = use1inchQuote({
    chainId, src: (debt?.address as Address) || "0x0000000000000000000000000000000000000000",
    dst: (collateral?.address as Address) || "0x0000000000000000000000000000000000000000",
    amount: swapQuoteAmount.toString(), from: (oneInchAdapter?.address as Address) || "0x0000000000000000000000000000000000000000",
    slippage, enabled: oneInchAvailable && swapRouter === "1inch" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!oneInchAdapter,
  });

  // Pendle Quote
  const { data: pendleQuote, isLoading: isPendleLoading } = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    tokensIn: debt?.address as Address,
    tokensOut: collateral?.address as Address,
    amountsIn: swapQuoteAmount.toString(),
    slippage: slippage / 100, // Pendle uses decimal slippage
    enabled: pendleAvailable && swapRouter === "pendle" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!pendleAdapter,
  });

  // CoW Quote (for limit orders - provides reference price)
  const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
    sellToken: debt?.address || "",
    buyToken: collateral?.address || "",
    sellAmount: swapQuoteAmount.toString(),
    from: userAddress || "",
    enabled: cowAvailable && executionType === "limit" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!userAddress,
  });

  // Unified loading state
  const isSwapQuoteLoading = executionType === "limit" 
    ? isCowQuoteLoading 
    : (swapRouter === "1inch" ? is1inchLoading : isPendleLoading);

  // Get best quote from all available sources
  const bestQuote = useMemo(() => {
    const quotes: { source: string; amount: bigint }[] = [];
    
    if (oneInchQuote?.dstAmount) {
      quotes.push({ source: "1inch", amount: BigInt(oneInchQuote.dstAmount) });
    }
    if (pendleQuote?.data) {
      const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
      if (outAmount !== "0") {
        quotes.push({ source: "Pendle", amount: BigInt(outAmount) });
      }
    }
    if (cowQuote?.quote?.buyAmount) {
      quotes.push({ source: "CoW", amount: BigInt(cowQuote.quote.buyAmount) });
    }
    
    if (quotes.length === 0) return null;
    
    // Return the best (highest output) quote
    return quotes.reduce((best, current) => 
      current.amount > best.amount ? current : best
    );
  }, [oneInchQuote, pendleQuote, cowQuote]);

  // Market price (rate) from best quote
  const marketRate = useMemo(() => {
    if (!bestQuote || !debt || swapQuoteAmount === 0n) return null;
    // Rate = buyAmount / sellAmount (how much collateral per debt token)
    const sellAmountFloat = Number(formatUnits(swapQuoteAmount, debt.decimals));
    const buyAmountFloat = Number(formatUnits(bestQuote.amount, collateral?.decimals ?? 18));
    if (sellAmountFloat === 0) return null;
    return buyAmountFloat / sellAmountFloat;
  }, [bestQuote, debt, collateral, swapQuoteAmount]);

  // Calculate price impact from available quote data (for limit order slippage estimation)
  const quotesPriceImpact = useMemo(() => {
    // Pendle provides priceImpact directly
    if (swapRouter === "pendle" && pendleQuote?.data?.priceImpact !== undefined) {
      return Math.abs(pendleQuote.data.priceImpact * 100);
    }
    // 1inch: calculate from USD values
    if (swapRouter === "1inch" && oneInchQuote?.srcUSD && oneInchQuote?.dstUSD) {
      const srcUSD = parseFloat(oneInchQuote.srcUSD);
      const dstUSD = parseFloat(oneInchQuote.dstUSD);
      if (srcUSD > 0) {
        return Math.max(0, ((srcUSD - dstUSD) / srcUSD) * 100);
      }
    }
    return null;
  }, [swapRouter, pendleQuote, oneInchQuote]);

  // Auto-estimate limit order slippage based on price impact (only on first quote)
  useEffect(() => {
    if (executionType !== "limit" || hasAutoSetLimitSlippage) return;
    if (quotesPriceImpact === null) return;
    
    const suggested = calculateSuggestedSlippage(quotesPriceImpact);
    setLimitSlippage(suggested);
    setHasAutoSetLimitSlippage(true);
  }, [executionType, quotesPriceImpact, hasAutoSetLimitSlippage]);

  // Reset limit slippage auto-set flag when switching execution type or tokens
  useEffect(() => {
    setHasAutoSetLimitSlippage(false);
    setLimitSlippage(0.1); // Reset to default
  }, [collateral?.address, debt?.address]);

  const minCollateralOut = useMemo(() => {
    if (!collateral) return { raw: 0n, formatted: "0" };
    
    // For limit orders with custom min price
    if (executionType === "limit" && customMinPrice && customMinPrice !== "") {
      try {
        const customRaw = parseUnits(customMinPrice, collateral.decimals);
        return { raw: customRaw, formatted: customMinPrice };
      } catch {
        // Invalid input, fall through to calculated value
      }
    }
    
    // Get the relevant quote
    let quoted = 0n;
    if (executionType === "limit") {
      // For limit orders, use best quote from any source
      quoted = bestQuote?.amount ?? 0n;
    } else if (swapRouter === "1inch" && oneInchQuote) {
      quoted = BigInt(oneInchQuote.dstAmount || "0");
    } else if (swapRouter === "pendle" && pendleQuote) {
      const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
      quoted = BigInt(outAmount);
    }
    
    if (quoted === 0n) return { raw: 0n, formatted: "0" };
    
    // Both limit and market orders: apply slippage tolerance (accept worse price)
    // For limit orders, this allows the order to fill even if price moves against us
    // e.g., 1% slippage means we accept 99% of the quoted amount
    const slippageToUse = executionType === "limit" ? limitSlippage : slippage;
    const bufferBps = BigInt(Math.round(slippageToUse * 100));
    const buffered = (quoted * (10000n - bufferBps)) / 10000n;
    return { raw: buffered, formatted: formatUnits(buffered, collateral.decimals) };
  }, [collateral, slippage, swapRouter, oneInchQuote, pendleQuote, executionType, bestQuote, limitSlippage, customMinPrice]);

  const metrics = useMemo(() => {
    if (!collateral || !debt || marginAmountRaw === 0n) {
      return { totalCollateralUsd: 0, debtUsd: 0, ltv: 0, liquidationPrice: null, healthFactor: Infinity, totalCollateralTokens: 0 };
    }
    const cPrice = Number(formatUnits(collateral.price ?? 0n, 8));
    const dPrice = Number(formatUnits(debt.price ?? 0n, 8));

    // In zap mode, all collateral comes from the swap; otherwise margin + swap
    let totalCollateralTokens: number;
    if (zapMode) {
      // All collateral is from the swap (deposit + flash loan → collateral)
      totalCollateralTokens = Number(minCollateralOut.formatted);
    } else {
      // Initial margin (in collateral) + swapped collateral
      const marginTokens = Number(formatUnits(marginAmountRaw, collateral.decimals));
      const swappedTokens = Number(minCollateralOut.formatted);
      totalCollateralTokens = marginTokens + swappedTokens;
    }
    const totalCollateralUsd = totalCollateralTokens * cPrice;

    const debtTokens = Number(formatUnits(flashLoanAmountRaw, debt.decimals));
    const debtUsd = debtTokens * dPrice;

    const ltv = totalCollateralUsd > 0 ? (debtUsd / totalCollateralUsd) * 100 : 0;
    const lltv = Number(effectiveLltvBps) / 10000;
    const healthFactor = debtUsd > 0 ? (totalCollateralUsd * lltv) / debtUsd : Infinity;

    // Liquidation price: price at which collateral * lltv = debt
    const liquidationPrice = debtUsd > 0 && totalCollateralTokens > 0
      ? debtUsd / (totalCollateralTokens * lltv)
      : null;

    return { totalCollateralUsd, debtUsd, ltv, liquidationPrice, healthFactor, totalCollateralTokens };
  }, [collateral, debt, marginAmountRaw, minCollateralOut.formatted, flashLoanAmountRaw, effectiveLltvBps, zapMode]);

  // Net APY and 30d yield calculation
  const { netApy, netYield30d } = useMemo(() => {
    if (!collateral || !debt || metrics.totalCollateralUsd === 0) return { netApy: null, netYield30d: null };
    const supplyApy = supplyApyMap[collateral.address.toLowerCase()] ?? 0;
    const borrowApy = borrowApyMap[debt.address.toLowerCase()] ?? 0;

    // Weighted: (collateral * supplyAPY - debt * borrowAPY) / equity
    const equity = metrics.totalCollateralUsd - metrics.debtUsd;
    if (equity <= 0) return { netApy: null, netYield30d: null };

    const earnedYield = (metrics.totalCollateralUsd * supplyApy) / 100;
    const paidInterest = (metrics.debtUsd * borrowApy) / 100;
    const netYieldUsd = earnedYield - paidInterest; // Annual yield in USD

    const netApyValue = (netYieldUsd / equity) * 100; // as percentage
    const netYield30dValue = netYieldUsd * (30 / 365); // 30 day yield in USD

    return { netApy: netApyValue, netYield30d: netYield30dValue };
  }, [collateral, debt, metrics, supplyApyMap, borrowApyMap]);

  const { buildMultiplyFlow, executeFlowBatchedIfPossible, executeFlowWithApprovals, buildFlowCalls, sendCallsAsync, setBatchId, setSuppressBatchNotifications, batchStatus, isBatchConfirmed, routerContract, getAuthorizations } = useKapanRouterV2();

  // Show success notification and close modal when limit order batch is confirmed
  useEffect(() => {
    if (isBatchConfirmed && executionType === "limit" && userAddress) {
      console.log("[Limit Order] Batch confirmed, showing success and closing modal");
      
      // Remove loading notification
      if (limitOrderNotificationId) {
        notification.remove(limitOrderNotificationId);
        setLimitOrderNotificationId(null);
      }
      
      // Build CoW Explorer link - use orderManagerAddress since orders are created by the contract
      const cowExplorerUrl = orderManagerAddress 
        ? getCowExplorerAddressUrl(chainId, orderManagerAddress)
        : undefined;
      const shortSalt = lastOrderSalt ? `${lastOrderSalt.slice(0, 10)}...${lastOrderSalt.slice(-6)}` : "";
      
      // Show success notification with CoW Explorer link
      notification.success(
        <TransactionToast
          step="confirmed"
          message={`Limit order created!${shortSalt ? ` (${shortSalt})` : ""}`}
          secondaryLink={cowExplorerUrl}
          secondaryLinkText="View on CoW Explorer"
        />
      );
      
      onClose();
    }
  }, [isBatchConfirmed, executionType, orderManagerAddress, chainId, lastOrderSalt, limitOrderNotificationId, onClose]);

  const buildFlow = () => {
    if (!collateral || !debt || flashLoanAmountRaw === 0n) return [];
    
    // Get swap data based on selected router
    let swapData: string;
    let minOut: string;
    
    if (swapRouter === "1inch") {
      if (!oneInchQuote || !oneInchAdapter) return [];
      swapData = oneInchQuote.tx.data;
      minOut = minCollateralOut.formatted;
    } else {
      if (!pendleQuote || !pendleAdapter) return [];
      swapData = pendleQuote.transaction.data;
      minOut = pendleQuote.data.minPtOut || pendleQuote.data.minTokenOut || minCollateralOut.formatted;
    }
    
    const flowParams = {
      protocolName, collateralToken: collateral.address as Address, debtToken: debt.address as Address,
      initialCollateral: zapMode ? "0" : (marginAmount || "0"), // In zap mode, no initial collateral
      flashLoanAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
      minCollateralOut: minOut, swapData,
      collateralDecimals: collateral.decimals, debtDecimals: debt.decimals,
      flashLoanProvider: selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2, market,
      morphoContext: morphoContext ? encodeMorphoContext(morphoContext) : undefined,
      swapRouter: (swapRouter === "1inch" ? "oneinch" : "pendle") as "oneinch" | "pendle",
      zapMode,
      depositAmount: zapMode ? marginAmount : undefined, // In zap mode, margin is the deposit amount
    };
    
    const flow = buildMultiplyFlow(flowParams);
    console.log("[MultiplyEvmModal] buildFlow result:", flow.length, "instructions");
    return flow;
  };

  /**
   * Calculate chunk parameters for limit orders
   * With flash loan enabled: single chunk, full amount
   * Without flash loan: calculate based on capacity constraints
   */
  const chunkParams = useMemo((): ChunkCalculationResult & { useFlashLoan?: boolean; flashLoanFee?: bigint; flashLoanLender?: string; protocolAdapter?: string } => {
    if (executionType !== "limit" || !collateral || !debt || flashLoanAmountRaw === 0n || marginAmountRaw === 0n) {
      return { numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw], needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0, recommendFlashLoan: false, explanation: "" };
    }

    // Get LTV - prefer from reserve config, fall back to prop, then default
    const ltvBps = collateralConfig?.ltv 
      ? Number(collateralConfig.ltv) 
      : (isEModeActive && eMode ? eMode.ltv : Number(maxLtvBps));

    // Get prices (8 decimals like Aave oracle)
    const collateralPrice = collateral.price ?? 0n;
    const debtPrice = debt.price ?? 0n;

    if (collateralPrice === 0n || debtPrice === 0n) {
      return { numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw], needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0, recommendFlashLoan: false, explanation: "Missing price data" };
    }

    // If flash loan is enabled, use single chunk with flash loan
    // Prefer Balancer V2 (0 fee) over Aave V3 (0.05% fee)
    if (useFlashLoan) {
      const balancerLender = getFlashLoanLender(chainId, "balancerV2");
      const aaveLender = getFlashLoanLender(chainId, "aaveV3");
      // Prefer Balancer (0 fee), fall back to Aave
      const flashLoanLender = balancerLender || aaveLender;
      const lenderType = balancerLender ? "balancerV2" : "aaveV3";
      // Balancer V2 has 0 fee, Aave V3 has 0.05% fee
      const flashLoanFee = lenderType === "balancerV2" ? 0n : calculateFlashLoanFee(flashLoanAmountRaw, "aaveV3");
      // Protocol adapter: ERC3156Borrower for Balancer, AaveBorrower for Aave
      const protocolAdapter = lenderType === "balancerV2" 
        ? COW_FLASH_LOAN_ROUTER.erc3156Borrower 
        : COW_FLASH_LOAN_ROUTER.aaveBorrower;
      
      console.log("[Limit Order] Flash loan mode:", {
        totalDebt: formatUnits(flashLoanAmountRaw, debt.decimals),
        flashLoanFee: formatUnits(flashLoanFee, debt.decimals),
        lender: flashLoanLender,
        lenderType,
        protocolAdapter,
      });
      
      return {
        numChunks: 1,
        chunkSize: flashLoanAmountRaw,
        chunkSizes: [flashLoanAmountRaw],
        needsChunking: false,
        initialBorrowCapacityUsd: 0n,
        geometricRatio: 0,
        recommendFlashLoan: true,
        useFlashLoan: true,
        flashLoanFee,
        flashLoanLender,
        protocolAdapter,
        explanation: flashLoanFee > 0n 
          ? `Flash loan: single tx execution (fee: ${formatUnits(flashLoanFee, debt.decimals)} ${debt.symbol})`
          : `Flash loan: single tx execution (no fee)`,
      };
    }

    // Calculate swap rate from best quote
    const swapRate = bestQuote && swapQuoteAmount > 0n
      ? calculateSwapRate(swapQuoteAmount, debt.decimals, bestQuote.amount, collateral.decimals)
      : 0n;

    const result = calculateChunkParams({
      initialCollateralAmount: marginAmountRaw,
      collateralPrice,
      collateralDecimals: collateral.decimals,
      debtPrice,
      debtDecimals: debt.decimals,
      totalDebtAmount: flashLoanAmountRaw,
      ltvBps,
      swapRate,
      safetyBuffer: 0.90, // 90% of max capacity per chunk
    });

    console.log("[Limit Order] Chunk calculation:", {
      initialCollateral: formatUnits(marginAmountRaw, collateral.decimals),
      totalDebt: formatUnits(flashLoanAmountRaw, debt.decimals),
      ltvBps,
      result,
    });

    return result;
  }, [executionType, collateral, debt, flashLoanAmountRaw, marginAmountRaw, collateralConfig, isEModeActive, eMode, maxLtvBps, bestQuote, swapQuoteAmount, useFlashLoan, chainId]);

  /**
   * Build per-iteration pre/post instructions for CoW limit order loop
   * 
   * FLASH LOAN MODE (useFlashLoan=true):
   * - Single iteration
   * - Pre-hook: Deposit initial collateral (if any)
   * - Post-hook: Deposit all swapped collateral, then borrow to repay flash loan
   * - The borrowed funds go to the settlement contract which repays the flash loan
   * 
   * MULTI-CHUNK MODE (useFlashLoan=false):
   * - Pre-hook (before swap): Empty - tokens already at OrderManager
   * - Post-hook (after swap): 
   *   - Non-final chunks: Deposit + Borrow + Push (fund next chunk)
   *   - Final chunk: Deposit only (no more borrowing needed)
   */
  const buildCowInstructions = useMemo(() => {
    if (!collateral || !debt || !userAddress || flashLoanAmountRaw === 0n || !orderManagerAddress) {
      return { preInstructionsPerIteration: [[]], postInstructionsPerIteration: [[]] };
    }

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const isMorpho = normalizedProtocol === "morpho-blue";
    const isCompound = normalizedProtocol === "compound";
    
    // Get context for the protocol (Morpho market params, Compound market, etc.)
    const context = isMorpho && morphoContext 
      ? encodeMorphoContext(morphoContext) 
      : (isCompound && market ? market : "0x");

    const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;
    
    // Common deposit instructions (used by all modes)
    const depositInstructions: ProtocolInstruction[] = [
      // 1. Approve collateral for lending protocol - amount comes from swap output (set as Output[0])
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // 2. Deposit collateral received from swap
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 0)
      ),
    ];

    // ========== FLASH LOAN MODE ==========
    // Flow: Solver takes flash loan → swap (debt → collateral) → post-hook deposits all & borrows to repay
    //
    // Post-hook receives swap output as Output[0] (prepended by OrderManager)
    // We then:
    // 1. Pull user's initial collateral → Output[1]
    // 2. Add Output[0] + Output[1] → Output[2] (total collateral)
    // 3. Approve & Deposit total collateral
    // 4. Borrow flash loan amount to settlement contract (repays the flash loan)
    //
    // Using Balancer V2 initially (0 fee), will add Aave support later
    if (chunkParams.useFlashLoan) {
      // For Balancer V2, no fee. For Aave, fee would be flashLoanAmount * 0.0005
      const flashLoanRepayAmount = flashLoanAmountRaw; // Balancer has 0 fee
      
      // Pre-hook: Empty (solver provides flash loan funds for the swap)
      const preInstructionsPerIteration: ProtocolInstruction[][] = [[]];
      
      // Post-hook: Combine collaterals, deposit all, borrow to repay flash loan
      // OrderManager prepends: Output[0] = swap output (collateral from swap)
      const postInstructionsFlashLoan: ProtocolInstruction[] = [
        // 1. Pull user's initial collateral → Output[1]
        createRouterInstruction(encodePullToken(marginAmountRaw, collateral.address, userAddress)),
        
        // 2. Add swap output + initial collateral → Output[2] (total collateral)
        createRouterInstruction(encodeAdd(0, 1)),
        
        // 3. Approve total collateral for lending protocol
        createRouterInstruction(encodeApprove(2, normalizedProtocol)),
        
        // 4. Deposit all collateral (single deposit)
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 2)
        ),
        
        // 5. Borrow to repay flash loan - sends debt tokens to settlement contract
        // Settlement contract uses these to repay the flash loan provider
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Borrow, debt.address, COW_PROTOCOL.settlement, flashLoanRepayAmount, context, 999)
        ),
      ];
      
      console.log("[buildCowInstructions] Flash loan mode:", {
        flashLoanAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
        initialCollateral: formatUnits(marginAmountRaw, collateral.decimals),
        repayAmount: formatUnits(flashLoanRepayAmount, debt.decimals),
        flow: "swap output[0] + pull[1] → add[2] → deposit[2] → borrow to settlement",
      });

      return { 
        preInstructionsPerIteration, 
        postInstructionsPerIteration: [postInstructionsFlashLoan] 
      };
    }

    // ========== MULTI-CHUNK MODE (no flash loan) ==========
    // Pre-hook instructions: Empty for all iterations
    // Tokens are already at OrderManager from:
    // - Chunk 0: seedAmount transferred during createOrder
    // - Chunk 1+: borrowed and pushed during previous post-hook
    const preInstructionsPerIteration: ProtocolInstruction[][] = [[]];
    
    // Post-hook for final chunk: Deposit only (no borrow needed)
    const postInstructionsFinal: ProtocolInstruction[] = [...depositInstructions];
    
    // Build per-iteration post instructions
    const numChunks = chunkParams.numChunks;
    const chunkSize = chunkParams.chunkSize;
    const postInstructionsPerIteration: ProtocolInstruction[][] = [];
    
    for (let i = 0; i < numChunks; i++) {
      if (i === numChunks - 1) {
        // Last chunk - deposit only
        postInstructionsPerIteration.push(postInstructionsFinal);
      } else {
        // Non-final chunk - deposit + borrow + push
        const postInstructionsWithBorrow: ProtocolInstruction[] = [
          ...depositInstructions,
          createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, chunkSize, context, 999)
          ),
          createRouterInstruction(encodePushToken(2, orderManagerAddress)),
        ];
        postInstructionsPerIteration.push(postInstructionsWithBorrow);
      }
    }
    
    if (postInstructionsPerIteration.length === 0) {
      postInstructionsPerIteration.push(postInstructionsFinal);
    }

    console.log("[buildCowInstructions] Multi-chunk mode:", numChunks, "chunks");

    return { preInstructionsPerIteration, postInstructionsPerIteration };
  }, [collateral, debt, userAddress, flashLoanAmountRaw, protocolName, morphoContext, market, orderManagerAddress, chunkParams]);

  /**
   * Build instructions to deposit initial collateral (executed before creating CoW order)
   */
  const buildInitialDepositFlow = useMemo(() => {
    if (!collateral || !userAddress || marginAmountRaw <= 0n) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const isMorpho = normalizedProtocol === "morpho-blue";
    const isCompound = normalizedProtocol === "compound";
    
    const context = isMorpho && morphoContext 
      ? encodeMorphoContext(morphoContext) 
      : (isCompound && market ? market : "0x");
    
    const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;

    return [
      // Pull collateral from user
      createRouterInstruction(encodePullToken(marginAmountRaw, collateral.address, userAddress)),
      // Approve lending protocol
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      // Deposit collateral
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 0)
      ),
    ];
  }, [collateral, userAddress, marginAmountRaw, protocolName, morphoContext, market]);

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen, chainId, onClose, buildFlow, successMessage: "Loop position opened!",
    emptyFlowErrorMessage: "Unable to build loop instructions", simulateWhenBatching: false, // Disabled for now - zap mode has complex flows
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      if (executionType === "limit") {
        // CoW Limit Order Loop - ALL IN ONE BATCHED TRANSACTION
        track("multiply_limit_order_begin", { protocol: protocolName, chainId, collateral: collateral?.symbol ?? "unknown", debt: debt?.symbol ?? "unknown", marginAmount, leverage });
        
        if (!collateral || !debt || !userAddress || !orderManagerAddress || !routerContract || !sendCallsAsync) {
          throw new Error("Missing required data for limit order");
        }

        const { preInstructionsPerIteration, postInstructionsPerIteration } = buildCowInstructions;
        
        // Calculate minBuyPerChunk - the minimum collateral expected per chunk
        // minCollateralOut is the TOTAL expected collateral, so we divide by numChunks
        // to get the proportional amount per chunk
        const minBuyPerChunkRaw = minCollateralOut.raw > 0n && chunkParams.numChunks > 0
          ? minCollateralOut.raw / BigInt(chunkParams.numChunks)
          : 0n;
        const minBuyAmount = minBuyPerChunkRaw > 0n
          ? formatUnits(minBuyPerChunkRaw, collateral.decimals)
          : "0";

        console.log("[Limit Order] Building batched transaction with:", {
          hasInitialDeposit: marginAmountRaw > 0n && buildInitialDepositFlow.length > 0,
          sellToken: debt.address,
          buyToken: collateral.address,
          preTotalAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
          totalMinBuy: formatUnits(minCollateralOut.raw, collateral.decimals),
          minBuyPerChunk: minBuyAmount,
          numChunks: chunkParams.numChunks,
          preInstructionsCount: preInstructionsPerIteration.length,
          postInstructionsCount: postInstructionsPerIteration.length,
        });

        // Build all calls for batching
        const allCalls: { to: Address; data: Hex }[] = [];
        
        const normalizedProtocol = normalizeProtocolName(protocolName);
        const isMorpho = normalizedProtocol === "morpho-blue";
        const isCompound = normalizedProtocol === "compound";
        const context = isMorpho && morphoContext 
          ? encodeMorphoContext(morphoContext) 
          : (isCompound && market ? market : "0x");

        // Flash loan mode vs multi-chunk mode
        const isFlashLoanMode = chunkParams.useFlashLoan === true;
        
        console.log("[Limit Order] Execution mode:", isFlashLoanMode ? "FLASH_LOAN" : "MULTI_CHUNK");
        console.log("[Limit Order] Using chunk params:", {
          numChunks: chunkParams.numChunks,
          chunkSize: formatUnits(chunkParams.chunkSize, debt.decimals),
          geometricRatio: chunkParams.geometricRatio,
          needsChunking: chunkParams.needsChunking,
          useFlashLoan: chunkParams.useFlashLoan,
          flashLoanFee: chunkParams.flashLoanFee ? formatUnits(chunkParams.flashLoanFee, debt.decimals) : "N/A",
          explanation: chunkParams.explanation,
        });
        
        // For multi-chunk mode: Build SEED BORROW instruction
        // For flash loan mode: No seed borrow needed - solver provides funds via flash loan
        const seedAmount = isFlashLoanMode ? 0n : chunkParams.chunkSize;
        
        let seedBorrowInstruction: ProtocolInstruction | undefined;
        if (!isFlashLoanMode) {
          seedBorrowInstruction = createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(
              LendingOp.Borrow,
              debt.address,
              userAddress,
              seedAmount,
              context,
              999 // No UTXO reference - fixed amount
            )
          );
        }

        // 1. Build authorization instructions explicitly
        // Only include instructions that actually need user authorization:
        // - PullToken needs ERC20 approve for router
        // - Borrow needs credit delegation
        // 
        // FLASH LOAN MODE:
        // - PullToken happens in post-hook (user's initial collateral pulled during hook execution)
        // - Borrow to settlement contract for flash loan repayment
        // - No initial deposit before order (everything happens in post-hook)
        //
        // MULTI-CHUNK MODE:
        // - PullToken for initial deposit (before order creation)
        // - Seed borrow (covers post-hook borrows too via same delegation)
        const instructionsNeedingAuth: ProtocolInstruction[] = [];
        
        if (isFlashLoanMode) {
          // Flash loan mode: collateral is pulled in post-hook, so we need approval for that
          if (marginAmountRaw > 0n && collateral) {
            // Create PullToken instruction for auth (same as what's in post-hook)
            const pullForAuth = createRouterInstruction(
              encodePullToken(marginAmountRaw, collateral.address, userAddress)
            );
            instructionsNeedingAuth.push(pullForAuth);
          }
          
          // Credit delegation for flash loan repayment borrow
          // Using Balancer V2 (0 fee) initially
          const flashLoanRepayAmount = flashLoanAmountRaw; // Balancer has 0 fee
          const borrowForAuth = createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(
              LendingOp.Borrow,
              debt.address,
              COW_PROTOCOL.settlement, // Borrow goes to settlement for flash loan repayment
              flashLoanRepayAmount,
              context,
              999
            )
          );
          instructionsNeedingAuth.push(borrowForAuth);
        } else {
          // Multi-chunk mode: initial deposit before order creation
          if (marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
            // First instruction is PullToken which needs ERC20 approve
            instructionsNeedingAuth.push(buildInitialDepositFlow[0]);
          }
          
          // Seed borrow (covers post-hook borrows too)
          if (seedBorrowInstruction) {
            instructionsNeedingAuth.push(seedBorrowInstruction);
          }
        }

        // Get authorizations only for instructions that need them
        const allAuthCalls = await getAuthorizations(instructionsNeedingAuth);
        const filteredAuthCalls = allAuthCalls
          .filter(({ target, data }) => target && data && data.length > 0)
          .map(({ target, data }) => ({ to: target as Address, data: data as Hex }));
        
        if (filteredAuthCalls.length > 0) {
          allCalls.push(...filteredAuthCalls);
          console.log("[Limit Order] Added authorization calls:", filteredAuthCalls.length);
        }

        // 2. Build initial deposit router call (ONLY for multi-chunk mode)
        // Flash loan mode does the deposit in the post-hook after the swap
        if (!isFlashLoanMode && marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
          const depositCalldata = encodeFunctionData({
            abi: routerContract.abi,
            functionName: "processProtocolInstructions",
            args: [buildInitialDepositFlow.map(inst => ({
              protocolName: inst.protocolName,
              data: inst.data as `0x${string}`,
            }))],
          });
          allCalls.push({ to: routerContract.address as Address, data: depositCalldata as Hex });
          console.log("[Limit Order] Added deposit router call");
        }

        // 3. Build seed borrow router call (ONLY for multi-chunk mode)
        // Flash loan mode skips this - solver provides funds via flash loan
        if (!isFlashLoanMode && seedBorrowInstruction) {
          const pushTokenInstruction = createRouterInstruction(encodePushToken(0, userAddress));
          const seedBorrowCalldata = encodeFunctionData({
            abi: routerContract.abi,
            functionName: "processProtocolInstructions",
            args: [[
              {
                protocolName: seedBorrowInstruction.protocolName,
                data: seedBorrowInstruction.data as `0x${string}`,
              },
              {
                protocolName: pushTokenInstruction.protocolName,
                data: pushTokenInstruction.data as `0x${string}`,
              },
            ]],
          });
          allCalls.push({ to: routerContract.address as Address, data: seedBorrowCalldata as Hex });
          console.log("[Limit Order] Added seed borrow + push router call");
        }

        // 4. Build CoW order calls (delegation + order creation)
        // For flash loan mode: pass flash loan config so appData includes flash loan hint
        // For multi-chunk: pass seedAmount so OrderManager pulls tokens from user
        const cowCalls = await buildOrderCalls({
          user: userAddress,
          preInstructions: preInstructionsPerIteration,
          postInstructions: postInstructionsPerIteration,
          preTotalAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
          preTotalAmountDecimals: debt.decimals,
          sellToken: debt.address,
          buyToken: collateral.address,
          chunkSize: formatUnits(chunkParams.chunkSize, debt.decimals),
          chunkSizeDecimals: debt.decimals,
          minBuyPerChunk: minBuyAmount,
          minBuyPerChunkDecimals: collateral.decimals,
          completion: CompletionType.Iterations,
          targetValue: chunkParams.numChunks,
          minHealthFactor: "1.1",
          // Multi-chunk: seed with borrowed tokens; Flash loan: no seed needed
          seedAmount: seedAmount,
          // Flash loan config: tells CoW solvers to use flash loan for this order
          flashLoan: isFlashLoanMode && chunkParams.flashLoanLender && chunkParams.protocolAdapter ? {
            lender: chunkParams.flashLoanLender,
            protocolAdapter: chunkParams.protocolAdapter,
            token: debt.address,
            amount: flashLoanAmountRaw,
          } : undefined,
        });

        if (!cowCalls) {
          throw new Error("Failed to build CoW order calls");
        }

        // Add delegation call if needed
        if (cowCalls.delegationCall) {
          allCalls.push(cowCalls.delegationCall);
          console.log("[Limit Order] Added delegation call");
        }

        // Note: cowCalls.authCalls are for pre/post instructions - already included above
        // So we skip adding them again to avoid duplicates

        // Add seed token approve call (user approves OrderManager to pull borrowed tokens)
        if (cowCalls.seedApproveCall) {
          allCalls.push(cowCalls.seedApproveCall);
          console.log("[Limit Order] Added seed approve call");
        }

        // Add order creation call (will pull seedAmount via transferFrom)
        allCalls.push(cowCalls.orderCall);
        console.log("[Limit Order] Added order creation call");

        console.log("[Limit Order] Total batched calls:", allCalls.length);

        // Execute all calls in one batch
        let notificationId: string | number = notification.loading(
          <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
        );

        try {
          const { id: newBatchId } = await sendCallsAsync({
            calls: allCalls,
            experimental_fallback: true,
          });

          // Store salt for CoW Explorer link in confirmation toast
          setLastOrderSalt(cowCalls.salt);
          
          // Suppress hook's generic notifications - we'll show custom ones with CoW Explorer link
          setSuppressBatchNotifications(true);
          
          // Set batch ID to trigger status tracking in useKapanRouterV2
          setBatchId(newBatchId);

          notification.remove(notificationId);
          
          // Show loading notification while waiting for confirmation
          const loadingId = notification.loading(
            <TransactionToast
              step="sent"
              message="Limit order submitted — waiting for confirmation..."
            />
          );
          setLimitOrderNotificationId(loadingId);
          
          console.log("[Limit Order] Batch submitted:", newBatchId);
          console.log("[Limit Order] Salt:", cowCalls.salt);
          console.log("[Limit Order] AppData Hash:", cowCalls.appDataHash);
          
          track("multiply_limit_order_complete", { status: "submitted", batchId: newBatchId });
          
          // Don't close immediately - the useEffect watching isBatchConfirmed will:
          // 1. Remove loading notification
          // 2. Show success notification with CoW Explorer link
          // 3. Close the modal
        } catch (batchError: any) {
          notification.remove(notificationId);
          throw batchError;
        }
      } else {
        // Market Order (flash loan, instant execution)
        track("multiply_tx_begin", { protocol: protocolName, chainId, collateral: collateral?.symbol ?? "unknown", debt: debt?.symbol ?? "unknown", marginAmount, leverage, flashLoanProvider: selectedProvider?.name ?? "unknown", swapRouter });
        await handleConfirm(marginAmount);
        track("multiply_tx_complete", { status: "success" });
      }
    } catch (e) {
      const status = executionType === "limit" ? "multiply_limit_order_complete" : "multiply_tx_complete";
      track(status, { status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally { setIsSubmitting(false); }
  };

  const hasQuote = swapRouter === "1inch" ? !!oneInchQuote : !!pendleQuote;
  const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;
  
  // For market orders: need quote and adapter
  // For limit orders: need CoW contract available (quote optional - just for preview) and dev environment
  const canSubmitMarket = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && hasQuote && hasAdapter && !isSwapQuoteLoading;
  const canSubmitLimit = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && cowContractAvailable && !isCowCreating && isDevEnvironment;
  const canSubmit = executionType === "limit" ? canSubmitLimit : canSubmitMarket;
  
  const isSubmittingAny = isSubmitting || isCowCreating;
  // In zap mode, margin is in debt terms; otherwise collateral terms
  const marginUsd = depositToken && marginAmount 
    ? Number(marginAmount) * Number(formatUnits(depositToken.price ?? 0n, 8)) 
    : 0;
  const walletBalanceFormatted = depositToken ? Number(formatUnits(walletBalance, depositDecimals)) : 0;
  const collateralPrice = collateral ? Number(formatUnits(collateral.price ?? 0n, 8)) : 0;
  const shortAmount = debt ? Number(formatUnits(flashLoanAmountRaw, debt.decimals)) : 0;
  const debtPrice = debt ? Number(formatUnits(debt.price ?? 0n, 8)) : 0;

  // Calculate fees breakdown
  const fees = useMemo(() => {
    const flashLoanAmountUsd = shortAmount * debtPrice;
    
    // Flash loan fee: Aave = 0.05%, Balancer = 0%
    const isBalancer = selectedProvider?.name.includes("Balancer");
    const flashLoanFeePercent = isBalancer ? 0 : 0.05;
    const flashLoanFeeUsd = flashLoanAmountUsd * (flashLoanFeePercent / 100);
    
    // Swap price impact from Pendle (already a decimal like -0.0001)
    const priceImpact = swapRouter === "pendle" ? (pendleQuote?.data?.priceImpact ?? 0) : 0;
    const priceImpactPercent = Math.abs(priceImpact * 100); // Convert to positive percentage
    const priceImpactUsd = flashLoanAmountUsd * Math.abs(priceImpact);
    
    // Total fee
    const totalFeePercent = flashLoanFeePercent + priceImpactPercent;
    const totalFeeUsd = flashLoanFeeUsd + priceImpactUsd;
    
    // Fee as percentage of total position
    const totalPositionUsd = metrics.totalCollateralUsd;
    const feeOfPositionPercent = totalPositionUsd > 0 ? (totalFeeUsd / totalPositionUsd) * 100 : 0;
    
    return {
      flashLoanFeePercent,
      flashLoanFeeUsd,
      priceImpactPercent,
      priceImpactUsd,
      totalFeePercent,
      totalFeeUsd,
      flashLoanAmountUsd,
      feeOfPositionPercent,
    };
  }, [shortAmount, debtPrice, selectedProvider, swapRouter, pendleQuote, metrics.totalCollateralUsd]);

  // Slider tick marks (simplified)
  const ticks = [1, (1 + maxLeverage) / 2, maxLeverage];

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-box relative bg-base-100 max-w-2xl p-0 rounded-2xl border border-base-300/30">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-300/30">
          <h3 className="text-lg font-semibold">Loop Position</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-base-content/50">{protocolName}</span>
            <button className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="p-5">
          {/* Two Column Layout: Collateral | Borrow */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Deposit section */}
            <div className="bg-base-200/40 rounded-xl p-4 border border-base-300/20">
              <div className="flex items-center justify-between text-sm text-base-content/60 mb-2">
                <span>Deposit</span>
                <button
                  className="hover:text-primary transition-colors text-xs"
                  onClick={() => depositToken && setMarginAmount(formatUnits(walletBalance, depositDecimals))}
                >
                  Bal: {walletBalanceFormatted.toFixed(2)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={marginAmount}
                  onChange={e => setMarginAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-xl font-medium outline-none min-w-0 placeholder:text-base-content/30"
                />
                {/* In zap mode, show debt token selector (deposit = debt); otherwise show collateral selector */}
                {zapMode ? (
                  disableAssetSelection ? (
                    <div className="flex items-center gap-1.5 bg-primary/10 rounded-lg px-2 py-1">
                      {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="font-medium text-xs">{debt?.symbol || "?"}</span>
                    </div>
                  ) : (
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-xs gap-1.5 bg-primary/10 border-0 hover:bg-primary/20 rounded-lg px-2">
                        {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                        <span className="font-medium text-xs">{debt?.symbol || "?"}</span>
                        <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                        {debtWithWalletBalance.map(d => {
                          const bal = Number(formatUnits(d.walletBalance, d.decimals));
                          return (
                            <li key={d.address}>
                              <a onClick={() => setDebt(d)} className={`flex items-center justify-between text-sm ${debt?.address === d.address ? "active" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <Image src={d.icon} alt="" width={18} height={18} className="rounded-full" />
                                  {d.symbol}
                                </div>
                                <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )
                ) : (
                  disableAssetSelection ? (
                    <div className="flex items-center gap-1.5 bg-primary/10 rounded-lg px-2 py-1">
                      {collateral && <Image src={collateral.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="font-medium text-xs">{collateral?.symbol || "?"}</span>
                    </div>
                  ) : (
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-xs gap-1.5 bg-primary/10 border-0 hover:bg-primary/20 rounded-lg px-2">
                        {collateral && <Image src={collateral.icon} alt="" width={16} height={16} className="rounded-full" />}
                        <span className="font-medium text-xs">{collateral?.symbol || "?"}</span>
                        <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                        {collateralsWithWalletBalance.map(c => {
                          const bal = Number(formatUnits(c.walletBalance, c.decimals));
                          return (
                            <li key={c.address}>
                              <a onClick={() => setCollateral(c)} className={`flex items-center justify-between text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <Image src={c.icon} alt="" width={18} height={18} className="rounded-full" />
                                  {c.symbol}
                                </div>
                                <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )
                )}
              </div>
              {/* In zap mode, show collateral selector and swap arrow */}
              {zapMode && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                  <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                    <span>↓ swap to</span>
                  </div>
                  {disableAssetSelection ? (
                    <div className="flex items-center gap-1.5 bg-success/10 rounded-lg px-2 py-1">
                      {collateral && <Image src={collateral.icon} alt="" width={14} height={14} className="rounded-full" />}
                      <span className="font-medium text-xs">{collateral?.symbol || "?"}</span>
                    </div>
                  ) : (
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-xs gap-1.5 bg-success/10 border-0 hover:bg-success/20 rounded-lg px-2">
                        {collateral && <Image src={collateral.icon} alt="" width={14} height={14} className="rounded-full" />}
                        <span className="font-medium text-xs">{collateral?.symbol || "?"}</span>
                        <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                        {collateralsWithWalletBalance.map(c => {
                          const bal = Number(formatUnits(c.walletBalance, c.decimals));
                          return (
                            <li key={c.address}>
                              <a onClick={() => setCollateral(c)} className={`flex items-center justify-between text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <Image src={c.icon} alt="" width={18} height={18} className="rounded-full" />
                                  {c.symbol}
                                </div>
                                <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {/* Show total after leverage inline */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                <span className="text-xs text-base-content/50">≈ ${marginUsd.toFixed(2)}</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-base-content/40">→</span>
                  <span className="text-success font-medium">{metrics.totalCollateralTokens.toFixed(4)} {collateral?.symbol}</span>
                  <span className="text-base-content/50">(${metrics.totalCollateralUsd.toFixed(2)})</span>
                </div>
              </div>
            </div>

            {/* Borrow */}
            <div className="bg-base-200/40 rounded-xl p-4 border border-base-300/20">
              <div className="text-sm text-base-content/60 mb-2">Borrow</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-xl font-medium text-error truncate">
                  {shortAmount > 0 ? shortAmount.toFixed(4) : "0"}
                </div>
                {disableAssetSelection ? (
                  <div className="flex items-center gap-1.5 bg-base-300/30 rounded-lg px-2 py-1">
                    {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                    <span className="font-medium text-xs">{debt?.symbol || "?"}</span>
                  </div>
                ) : (
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-xs gap-1.5 bg-base-300/30 border-0 hover:bg-base-300/50 rounded-lg px-2 cursor-pointer">
                      {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="font-medium text-xs">{debt?.symbol || "?"}</span>
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-xl bg-base-100 rounded-xl w-52 border border-base-300/30 mt-2">
                      {debtWithWalletBalance.map(d => {
                        const bal = Number(formatUnits(d.walletBalance, d.decimals));
                        return (
                          <li key={d.address}>
                            <a onClick={() => setDebt(d)} className={`flex items-center justify-between text-sm ${debt?.address === d.address ? "active" : ""}`}>
                              <div className="flex items-center gap-2">
                                <Image src={d.icon} alt="" width={18} height={18} className="rounded-full" />
                                {d.symbol}
                              </div>
                              <span className="text-xs text-base-content/50">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              <div className="text-xs text-base-content/50 mt-2 pt-2 border-t border-base-300/30">≈ ${metrics.debtUsd.toFixed(2)}</div>
            </div>
          </div>

          {/* Multiplier Slider */}
          <div className="bg-base-200/40 rounded-xl p-4 border border-base-300/20 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Leverage</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={leverageInput}
                  onChange={e => { setLeverageInput(e.target.value); const val = parseFloat(e.target.value); if (!isNaN(val)) updateLeverage(val); }}
                  onBlur={() => setLeverageInput(leverage.toFixed(2))}
                  className="w-14 bg-base-300/50 rounded-lg px-2 py-1 text-sm text-right outline-none font-medium"
                />
                <span className="text-base-content/50 text-sm">×</span>
              </div>
            </div>
            <input
              type="range" min="1" max={maxLeverage} step="0.01" value={leverage}
              onChange={e => updateLeverage(parseFloat(e.target.value))}
              className="range range-primary range-sm w-full"
            />
            <div className="flex justify-between text-xs text-base-content/40 mt-1.5">
              {ticks.map((t, i) => (
                <span key={i}>{i === ticks.length - 1 ? `Max ${t.toFixed(1)}×` : `${t.toFixed(1)}×`}</span>
              ))}
            </div>

            {/* Execution Type Toggle - Market vs Limit */}
            {cowAvailable && (
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-base-300/30">
                <button
                  onClick={() => setExecutionType("market")}
                  className={`flex-1 btn btn-xs ${executionType === "market" ? "btn-primary" : "btn-ghost"}`}
                >
                  <span className="mr-1">⚡</span> Market
                </button>
                <button
                  onClick={() => setExecutionType("limit")}
                  className={`flex-1 btn btn-xs ${executionType === "limit" ? "btn-primary" : "btn-ghost"}`}
                  disabled={!cowContractAvailable || !isDevEnvironment}
                  title={
                    !isDevEnvironment 
                      ? "Limit orders are only available in development environment" 
                      : !cowContractAvailable 
                        ? "CoW contracts not deployed on this chain" 
                        : "Execute via CoW Protocol limit order"
                  }
                >
                  <ClockIcon className="w-3 h-3 mr-1" /> Limit
                </button>
              </div>
            )}

            {/* Limit Order Pricing */}
            {executionType === "limit" && (
              <div className="bg-base-200/60 rounded-lg p-3 mt-3 text-xs border border-base-300/30">
                {/* Market Rate Display */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base-content/60">Market Rate</span>
                  <div className="flex items-center gap-1.5">
                    {isSwapQuoteLoading ? (
                      <span className="loading loading-dots loading-xs" />
                    ) : marketRate ? (
                      <>
                        <span className="font-medium">1 {debt?.symbol} = {marketRate.toFixed(6)} {collateral?.symbol}</span>
                        <span className="text-base-content/40 text-[10px]">({bestQuote?.source})</span>
                      </>
                    ) : (
                      <span className="text-base-content/40">-</span>
                    )}
                  </div>
                </div>

                {/* Slippage Slider for Limit Orders */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base-content/60">Max Slippage</span>
                    <span className="font-medium text-warning">
                      {limitSlippage < 0.1 ? limitSlippage.toFixed(2) : limitSlippage.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.01"
                    value={limitSlippage}
                    onChange={e => {
                      setLimitSlippage(parseFloat(e.target.value));
                      setCustomMinPrice(""); // Reset custom price when using slider
                      setHasAutoSetLimitSlippage(true); // Mark as manually adjusted
                    }}
                    className="range range-warning range-xs w-full"
                  />
                  <div className="flex justify-between text-[10px] text-base-content/40 mt-0.5">
                    <span>0%</span>
                    <span>0.1%</span>
                    <span>1%</span>
                    <span>5%</span>
                  </div>
                  {limitSlippage === 0 && (
                    <div className="text-warning text-[10px] mt-1">
                      0% slippage - order may not fill if price moves
                    </div>
                  )}
                </div>

                {/* Computed Min Output */}
                <div className="flex items-center justify-between py-2 border-t border-base-300/30">
                  <span className="text-base-content/60">Min Output</span>
                  <span className="font-medium text-success">
                    {minCollateralOut.raw > 0n ? (
                      `${Number(minCollateralOut.formatted).toFixed(6)} ${collateral?.symbol}`
                    ) : (
                      "-"
                    )}
                  </span>
                </div>

                {/* Advanced: Custom Min Price Override */}
                <button
                  onClick={() => setShowAdvancedPricing(!showAdvancedPricing)}
                  className="text-[10px] text-base-content/50 hover:text-base-content/70 flex items-center gap-1 mt-1"
                >
                  <svg 
                    className={`w-3 h-3 transition-transform ${showAdvancedPricing ? "rotate-90" : ""}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Set custom min output
                </button>
                
                {showAdvancedPricing && (
                  <div className="mt-2 pt-2 border-t border-base-300/30">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={customMinPrice}
                        onChange={e => setCustomMinPrice(e.target.value)}
                        placeholder={minCollateralOut.formatted}
                        className="flex-1 bg-base-300/50 rounded px-2 py-1 text-xs outline-none"
                      />
                      <span className="text-base-content/50">{collateral?.symbol}</span>
                    </div>
                    {customMinPrice && (
                      <p className="text-[10px] text-warning mt-1">
                        Using custom min output. Order will only fill if you receive at least this amount.
                      </p>
                    )}
                  </div>
                )}

                {/* Flash Loan Toggle for Limit Orders */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-300/30">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base-content/60">Flash Loan</span>
                    <span className="text-[10px] text-base-content/40">(single tx)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {chunkParams.useFlashLoan && chunkParams.flashLoanFee !== undefined && chunkParams.flashLoanFee > 0n && (
                      <span className="text-[10px] text-warning">
                        +{formatUnits(chunkParams.flashLoanFee, debt?.decimals ?? 18)} {debt?.symbol} fee
                      </span>
                    )}
                    <input
                      type="checkbox"
                      checked={useFlashLoan}
                      onChange={e => setUseFlashLoan(e.target.checked)}
                      className="toggle toggle-primary toggle-xs"
                    />
                  </div>
                </div>

                {/* Flash Loan Info */}
                {chunkParams.useFlashLoan && (
                  <div className="flex items-start gap-1.5 mt-2 text-[10px]">
                    <svg className="w-3 h-3 shrink-0 mt-0.5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <div>
                      <span className="text-success font-medium">Single transaction execution</span>
                      <p className="text-base-content/50 mt-0.5">
                        Solver takes flash loan → swaps → you borrow to repay. All in one tx.
                        {chunkParams.flashLoanFee === 0n && " No flash loan fee (Balancer V2)."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Chunk Info - shown when multi-chunk execution needed (flash loan OFF) */}
                {!chunkParams.useFlashLoan && chunkParams.needsChunking && (
                  <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-base-300/30 text-[10px]">
                    <svg className="w-3 h-3 shrink-0 mt-0.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <div>
                      <span className="text-info font-medium">Multi-chunk execution: {chunkParams.numChunks} iterations</span>
                      <p className="text-base-content/50 mt-0.5">
                        {chunkParams.explanation}
                      </p>
                    </div>
                  </div>
                )}

                {/* Info note */}
                <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-base-300/30 text-[10px] text-base-content/50">
                  <ClockIcon className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    {chunkParams.useFlashLoan
                      ? "Single transaction via CoW flash loan. MEV protected."
                      : chunkParams.needsChunking 
                        ? `Each chunk executes when solvers find a good price. Est. ${chunkParams.numChunks * 2}-${chunkParams.numChunks * 5} min total.`
                        : "Order executes only when solvers find a price at or above your minimum."
                    }
                    {!chunkParams.useFlashLoan && " No flash loan fees."}
                    {" "}MEV protected.
                  </span>
                </div>
              </div>
            )}

            {/* Config Grid - compact 2x2 layout with dropdowns */}
            <div className={`grid grid-cols-2 gap-x-4 gap-y-2 ${executionType === "limit" && cowAvailable ? "mt-3" : "mt-4 pt-3 border-t border-base-300/30"} text-xs`}>
              {/* Zap Mode - only for market orders */}
              {executionType === "market" && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Zap Mode</span>
                  <input
                    type="checkbox"
                    checked={zapMode}
                    onChange={e => setZapMode(e.target.checked)}
                    className="toggle toggle-primary toggle-xs"
                  />
                </div>
              )}

              {/* Swap Router Dropdown - only for market orders */}
              {executionType === "market" && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Swap Router</span>
                  {oneInchAvailable && pendleAvailable ? (
                    <select
                      value={swapRouter}
                      onChange={e => setSwapRouter(e.target.value as SwapRouter)}
                      className="select select-xs bg-base-300/50 border-0 text-xs min-h-0 h-6 pr-6"
                    >
                      {SWAP_ROUTER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-medium">{swapRouter === "pendle" ? "Pendle" : "1inch"}</span>
                  )}
                </div>
              )}

              {/* Slippage Dropdown - only for market orders (limit orders use price improvement) */}
              {executionType === "market" && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Slippage</span>
                  <select
                    value={slippage}
                    onChange={e => setSlippage(parseFloat(e.target.value))}
                    className="select select-xs bg-base-300/50 border-0 text-xs min-h-0 h-6 pr-6"
                  >
                    {[0.1, 0.3, 0.5, 1, 2, 3].map(s => (
                      <option key={s} value={s}>{s}%</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Flash Loan Dropdown - only for market orders */}
              {executionType === "market" && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Flash Loan</span>
                  <select
                    value={selectedProvider?.name || ""}
                    onChange={e => {
                      const p = providerOptions.find(p => p.name === e.target.value);
                      if (p) setSelectedProvider(p);
                    }}
                    className="select select-xs bg-base-300/50 border-0 text-xs min-h-0 h-6 pr-6"
                  >
                    {providerOptions.map(p => {
                      const liq = liquidityData.find(l => l.provider === p.providerEnum);
                      const hasLiquidity = liq?.hasLiquidity ?? true;
                      return (
                        <option key={p.name} value={p.name}>
                          {p.name} {liq && (hasLiquidity ? "✓" : "⚠")}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Metrics - Compact horizontal layout */}
          <div className="flex justify-between items-center gap-2 mb-3 text-xs bg-base-200/40 rounded-lg p-2 border border-base-300/20">
            <div className="text-center flex-1">
              <div className="text-base-content/50 mb-0.5">LTV</div>
              <div className="font-medium">{metrics.ltv > 0 ? `${metrics.ltv.toFixed(1)}%` : "-"} / {formatBps(effectiveLltvBps)}%</div>
            </div>
            <div className="w-px h-6 bg-base-300/50" />
            <div className="text-center flex-1">
              <div className="text-base-content/50 mb-0.5">{collateral?.symbol}</div>
              <div className="font-medium">${collateralPrice > 0 ? collateralPrice.toFixed(2) : "-"}</div>
            </div>
            <div className="w-px h-6 bg-base-300/50" />
            <div className="text-center flex-1">
              <div className="text-base-content/50 mb-0.5">{debt?.symbol}</div>
              <div className="font-medium">${debt ? Number(formatUnits(debt.price ?? 0n, 8)).toFixed(2) : "-"}</div>
            </div>
            <div className="w-px h-6 bg-base-300/50" />
            <div className="text-center flex-1">
              <div className="text-base-content/50 mb-0.5">Net APY</div>
              <div className={`font-medium ${netApy !== null && netApy > 0 ? "text-success" : netApy !== null && netApy < 0 ? "text-error" : ""}`}>
                {netApy !== null ? `${netApy > 0 ? "+" : ""}${netApy.toFixed(2)}%` : "-"}
              </div>
            </div>
            <div className="w-px h-6 bg-base-300/50" />
            <div className="text-center flex-1">
              <div className="text-base-content/50 mb-0.5">30D Yield</div>
              <div className={`font-medium ${netYield30d !== null && netYield30d > 0 ? "text-success" : netYield30d !== null && netYield30d < 0 ? "text-error" : ""}`}>
                {netYield30d !== null ? `${netYield30d >= 0 ? "+" : ""}$${Math.abs(netYield30d).toFixed(2)}` : "-"}
              </div>
            </div>
          </div>

          {/* Details - Compact 2-column grid */}
          <div className="bg-base-200/40 rounded-lg p-2.5 border border-base-300/20 mb-3 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between">
                <span className="text-base-content/50">Swap</span>
                <span className="truncate ml-2 text-right">
                  {executionType === "market" && isSwapQuoteLoading ? (
                    <span className="loading loading-dots loading-xs" />
                  ) : flashLoanAmountRaw > 0n ? (
                    `${shortAmount.toFixed(2)} → ${Number(minCollateralOut.formatted).toFixed(2)}`
                  ) : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/50">
                  {executionType === "limit" ? "Order Fee" : "Loop Fee"}
                </span>
                <span className={executionType === "limit" ? "text-success" : fees.totalFeeUsd > 0 ? "text-warning" : ""}>
                  {executionType === "limit" ? (
                    "No flash loan fee"
                  ) : fees.totalFeeUsd > 0.01 ? (
                    `$${fees.totalFeeUsd.toFixed(2)} (${fees.feeOfPositionPercent.toFixed(3)}%)`
                  ) : fees.totalFeePercent > 0 ? (
                    `${fees.totalFeePercent.toFixed(3)}%`
                  ) : (
                    "free"
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/50">Supply APY</span>
                <span className="text-success">+{(supplyApyMap[collateral?.address.toLowerCase() ?? ""] ?? 0).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/50">Borrow APY</span>
                <span className="text-error">-{(borrowApyMap[debt?.address.toLowerCase() ?? ""] ?? 0).toFixed(2)}%</span>
              </div>
            </div>
            {/* Fee breakdown tooltip - only for market orders */}
            {executionType === "market" && fees.totalFeeUsd > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-base-300/30 text-[10px] text-base-content/40">
                <span>FL: {fees.flashLoanFeePercent > 0 ? `${fees.flashLoanFeePercent}%` : "free"}</span>
                {fees.priceImpactPercent > 0.001 && (
                  <span className="ml-2">Impact: {fees.priceImpactPercent.toFixed(3)}%</span>
                )}
              </div>
            )}
            {/* Limit order info */}
            {executionType === "limit" && (
              <div className="mt-1.5 pt-1.5 border-t border-base-300/30 text-[10px] text-base-content/40">
                <span>CoW solver fee included in price • MEV protected</span>
              </div>
            )}
            <div className="flex justify-between mt-1.5 pt-1.5 border-t border-base-300/30">
              <span className="text-base-content/50">Total Position</span>
              <span className="font-medium">${metrics.totalCollateralUsd.toFixed(2)} ({leverage.toFixed(2)}×)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {/* Left side: batch toggle for market, info for limit */}
            {executionType === "market" ? (
              <button
                type="button"
                onClick={() => setPreferBatching(!preferBatching)}
                className={`text-xs inline-flex items-center gap-1 cursor-pointer hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"}`}
              >
                <CheckIcon className={`w-4 h-4 ${preferBatching ? "" : "opacity-40"}`} />
                Batch transactions
              </button>
            ) : (
              <span className="text-xs text-base-content/50 inline-flex items-center gap-1">
                <ClockIcon className="w-3.5 h-3.5" />
                Executes via CoW Protocol
              </span>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmittingAny}
              className="btn btn-ghost btn-sm text-primary disabled:text-base-content/30"
            >
              {isSubmittingAny ? (
                <span className="loading loading-spinner loading-sm" />
              ) : executionType === "market" && isSwapQuoteLoading ? (
                "Loading..."
              ) : executionType === "limit" ? (
                <>
                  <ClockIcon className="w-4 h-4 mr-1" />
                  Create Order
                </>
              ) : (
                "Loop it"
              )}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default MultiplyEvmModal;
