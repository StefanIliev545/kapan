import { FC, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { track } from "@vercel/analytics";
import Image from "next/image";
import { Address, formatUnits, parseUnits, encodeFunctionData, type Hex } from "viem";
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
import { useCowLimitOrder, type ChunkInstructions } from "~~/hooks/useCowLimitOrder";
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
import { CompletionType, getCowExplorerAddressUrl, calculateChunkParams, calculateSwapRate, type ChunkCalculationResult, getFlashLoanLender, calculateFlashLoanFee, COW_PROTOCOL, getPreferredFlashLoanLender, mapFlashLoanProviderToCow } from "~~/utils/cow";
import { calculateSuggestedSlippage } from "~~/utils/slippage";
import { formatBps } from "~~/utils/risk";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isAaveV3Supported, isBalancerV2Supported, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useSendCalls, useCallsStatus } from "wagmi/experimental";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { LimitOrderConfig, type LimitOrderResult } from "~~/components/LimitOrderConfig";
import { saveOrderNote, createLeverageUpNote } from "~~/utils/orderNotes";
import { executeSequentialTransactions, type TransactionCall } from "~~/utils/transactionSimulation";

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
  // Number of chunks for flash loan orders (each chunk is independent flash loan settlement)
  const [flashLoanChunks, setFlashLoanChunks] = useState<number>(1);
  // Limit order config result from LimitOrderConfig component
  const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
  // Batched TX mode: when ON, uses EIP-5792 sendCalls (may not work with all wallets like MetaMask)
  // When OFF, executes each call sequentially (more compatible but slower)
  const [useBatchedTx, setUseBatchedTx] = useState<boolean>(false); // Default OFF for compatibility
  
  // Get user address for CoW order creation
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  
  // CoW order hooks
  // useCowOrder: used for status tracking (isCowCreating) and availability check
  const { isCreating: isCowCreating, isAvailable: cowContractAvailable } = useCowOrder();
  // useCowLimitOrder: cleaner API for building limit orders with lending integration
  const { buildOrderCalls: buildLimitOrderCalls, buildRouterCall, isReady: limitOrderReady, orderManagerAddress } = useCowLimitOrder();
  
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
      return [{ name: "Aave", icon: "/logos/aave.svg", version: "aave" as const, providerEnum: FlashLoanProvider.Aave, feeBps: 5 }];
    }
    return [{ name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2" as const, providerEnum: FlashLoanProvider.BalancerV2, feeBps: 0 }];
  }, [defaultFlashLoanProvider, flashLoanProviders, chainId]);

  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders: providerOptions, defaultProvider: defaultFlashLoanProvider ?? providerOptions[0],
    tokenAddress: debt?.address as Address, amount: flashLoanAmountRaw, chainId,
  });

  // Callback for when LimitOrderConfig reports changes
  const handleLimitOrderConfigChange = useCallback((config: LimitOrderResult) => {
    setLimitOrderConfig(config);
  }, []);

  // Memoize sellToken for LimitOrderConfig to prevent infinite re-renders
  const limitOrderSellToken = useMemo(() => 
    debt ? {
      symbol: debt.symbol,
      decimals: debt.decimals,
      address: debt.address,
    } : null,
  [debt?.symbol, debt?.decimals, debt?.address]);

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

  const { buildMultiplyFlow, executeFlowBatchedIfPossible, executeFlowWithApprovals, buildFlowCalls, sendCallsAsync, setBatchId, setSuppressBatchNotifications, batchStatus, isBatchConfirmed, routerContract } = useKapanRouterV2();

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
  const chunkParams = useMemo((): ChunkCalculationResult & { useFlashLoan?: boolean; flashLoanFee?: bigint; flashLoanLender?: string } => {
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

    // If flash loan is enabled, use the config from LimitOrderConfig component
    // KapanCowAdapter supports Morpho (0% fee), Balancer V2 (0% fee), and Aave V3 (0.05% fee)
    if (useFlashLoan) {
      // Use limit order config from LimitOrderConfig component if available
      // Otherwise fall back to calculating based on selectedProvider
      const flashLoanLender = limitOrderConfig?.flashLoanLender 
        ?? getPreferredFlashLoanLender(chainId, limitOrderConfig?.selectedProvider?.provider)?.address;
      const providerType = limitOrderConfig?.selectedProvider?.provider ?? "morpho";
      
      if (!flashLoanLender) {
        console.warn("[Limit Order] Flash loans not available on this chain for CoW orders");
        return { numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw], needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0, recommendFlashLoan: false, explanation: "Flash loans not available for limit orders on this chain" };
      }
      
      // Use user-specified chunk count
      const numChunks = flashLoanChunks;
      const baseChunkSize = flashLoanAmountRaw / BigInt(numChunks);
      const remainder = flashLoanAmountRaw % BigInt(numChunks);
      
      // Build chunk sizes array - last chunk gets remainder
      const chunkSizes = Array(numChunks).fill(baseChunkSize).map((size, i) => 
        i === numChunks - 1 ? size + remainder : size
      ) as bigint[];
      
      // Calculate fee per chunk (based on base chunk size)
      const flashLoanFeePerChunk = limitOrderConfig?.flashLoanFee 
        ?? calculateFlashLoanFee(baseChunkSize, providerType);
      
      console.log(`[Limit Order] Flash loan mode (CoW/${providerType}):`, {
        totalDebt: formatUnits(flashLoanAmountRaw, debt.decimals),
        numChunks,
        chunkSize: formatUnits(baseChunkSize, debt.decimals),
        flashLoanFeePerChunk: formatUnits(flashLoanFeePerChunk, debt.decimals),
        lender: flashLoanLender,
        lenderType: providerType,
      });
      
      return {
        numChunks,
        chunkSize: baseChunkSize,
        chunkSizes,
        needsChunking: numChunks > 1,
        initialBorrowCapacityUsd: 0n,
        geometricRatio: 0,
        recommendFlashLoan: true,
        useFlashLoan: true,
        flashLoanFee: flashLoanFeePerChunk, // Fee per chunk
        flashLoanLender,
        explanation: numChunks === 1
          ? (flashLoanFeePerChunk > 0n 
              ? `Flash loan: single tx execution (fee: ${formatUnits(flashLoanFeePerChunk, debt.decimals)} ${debt.symbol})`
              : `Flash loan: single tx execution (no fee)`)
          : `Flash loan: ${numChunks} chunks of ~${formatUnits(baseChunkSize, debt.decimals)} ${debt.symbol}`,
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
  }, [executionType, collateral, debt, flashLoanAmountRaw, marginAmountRaw, collateralConfig, isEModeActive, eMode, maxLtvBps, bestQuote, swapQuoteAmount, useFlashLoan, flashLoanChunks, chainId, limitOrderConfig]);

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
  const buildCowInstructions = useMemo((): ChunkInstructions[] => {
    if (!collateral || !debt || !userAddress || flashLoanAmountRaw === 0n || !orderManagerAddress) {
      return [{ preInstructions: [], postInstructions: [] }];
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
    // ========== FLASH LOAN MODE ==========
    // CoW Protocol flash loan flow:
    // 1. Solver takes flash loan via FlashLoanRouter → funds at ERC3156Borrower (or AaveBorrower)
    // 2. Pre-hooks in appData: 
    //    a. Borrower.approve(token, OrderManager, amount)
    //    b. token.transferFrom(Borrower, OrderManager, amount)
    //    c. OrderManager.executePreHookBySalt() - empty, just marks execution
    // 3. Swap executes: OrderManager sells debt tokens for collateral
    // 4. Post-hooks:
    //    a. OrderManager.executePostHookBySalt() - runs instructions below
    // 5. Flash loan repaid from Borrower contract
    //
    // Post-hook receives swap output as Output[0] (prepended by OrderManager)
    // We then:
    // 1. Pull user's initial margin collateral → UTXO[1]
    // 2. Add swap output + margin → UTXO[2] (total collateral)
    // 3. Approve & Deposit total collateral
    // 4. Borrow debt tokens to repay flash loan
    // 5. PushToken is appended by useCowLimitOrder hook (via flashLoanRepaymentUtxoIndex)
    if (chunkParams.useFlashLoan && chunkParams.flashLoanLender) {
      const numChunks = chunkParams.numChunks;
      const lenderInfo = getPreferredFlashLoanLender(chainId);
      
      // Split margin across chunks (last chunk gets remainder)
      const baseMarginPerChunk = marginAmountRaw / BigInt(numChunks);
      const marginRemainder = marginAmountRaw % BigInt(numChunks);
      
      const chunks: ChunkInstructions[] = [];
      
      for (let i = 0; i < numChunks; i++) {
        // Calculate this chunk's amounts
        const isLastChunk = i === numChunks - 1;
        const marginThisChunk = isLastChunk ? baseMarginPerChunk + marginRemainder : baseMarginPerChunk;
        const chunkSize = chunkParams.chunkSizes[i];
        const feeThisChunk = lenderInfo ? calculateFlashLoanFee(chunkSize, lenderInfo.provider) : 0n;
        const chunkRepayAmount = chunkSize + feeThisChunk;
        
        // Post-hook: Pull margin → Add → Approve → Deposit → Borrow
        // PushToken is appended automatically by the hook
        // 
        // UTXO Tracking:
        // - OrderManager prepends: ToOutput(receivedAmount, collateralToken) → UTXO[0]
        // - [0] PullToken(marginThisChunk) → UTXO[1]
        // - [1] Add(0, 1) → UTXO[2] (total collateral)
        // - [2] Approve(2) → UTXO[3] (empty, for index sync)
        // - [3] Deposit(input=2) → (no UTXO, consumed)
        // - [4] Borrow(chunkRepayAmount) → UTXO[4] (borrowed debt tokens)
        // - Hook appends: PushToken(4, borrowerAddress) → flash loan repayment
        const postInstructions: ProtocolInstruction[] = [
          // 1. Pull this chunk's margin → UTXO[1]
          createRouterInstruction(encodePullToken(marginThisChunk, collateral.address, userAddress)),
          
          // 2. Add swap output + margin → UTXO[2] (total collateral for this chunk)
          createRouterInstruction(encodeAdd(0, 1)),
          
          // 3. Approve total collateral for lending protocol → UTXO[3] (empty)
          createRouterInstruction(encodeApprove(2, normalizedProtocol)),
          
          // 4. Deposit all collateral (single deposit) - no UTXO created
          createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 2)
          ),
          
          // 5. Borrow to repay this chunk's flash loan → UTXO[4]
          createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, chunkRepayAmount, context, 999)
          ),
        ];
        
        chunks.push({
          preInstructions: [], // Empty - flash loan transfer hooks are added in appData.ts
          postInstructions,
          flashLoanRepaymentUtxoIndex: 4, // UTXO[4] = Borrow output
        });
      }
      
      console.log("[buildCowInstructions] Flash loan mode:", {
        totalFlashLoan: formatUnits(flashLoanAmountRaw, debt.decimals),
        numChunks,
        chunkSize: formatUnits(chunkParams.chunkSize, debt.decimals),
        flashLoanFeePerChunk: formatUnits(chunkParams.flashLoanFee ?? 0n, debt.decimals),
        marginPerChunk: formatUnits(baseMarginPerChunk, collateral.decimals),
        totalMargin: formatUnits(marginAmountRaw, collateral.decimals),
        lender: chunkParams.flashLoanLender,
        flow: "swap[0] + pull[1] → add[2] → approve[3] → deposit → borrow[4] → (hook appends push)",
      });

      return chunks;
    }

    // ========== MULTI-CHUNK MODE (no flash loan) ==========
    // Pre-hook instructions: Empty for all iterations
    // Tokens are already at OrderManager from:
    // - Chunk 0: seedAmount transferred during createOrder
    // - Chunk 1+: borrowed and pushed during previous post-hook
    
    // Post-hook for final chunk: Deposit only (no borrow needed)
    const postInstructionsFinal: ProtocolInstruction[] = [...depositInstructions];
    
    // Build per-iteration chunks
    const numChunks = chunkParams.numChunks;
    const chunkSize = chunkParams.chunkSize;
    const chunks: ChunkInstructions[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      if (i === numChunks - 1) {
        // Last chunk - deposit only
        chunks.push({
          preInstructions: [],
          postInstructions: postInstructionsFinal,
        });
      } else {
        // Non-final chunk - deposit + borrow + push to OrderManager for next chunk
        const postInstructionsWithBorrow: ProtocolInstruction[] = [
          ...depositInstructions,
          createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, chunkSize, context, 999)
          ),
          createRouterInstruction(encodePushToken(2, orderManagerAddress)),
        ];
        chunks.push({
          preInstructions: [],
          postInstructions: postInstructionsWithBorrow,
        });
      }
    }
    
    if (chunks.length === 0) {
      chunks.push({
        preInstructions: [],
        postInstructions: postInstructionsFinal,
      });
    }

    console.log("[buildCowInstructions] Multi-chunk mode:", numChunks, "chunks");

    return chunks;
  }, [collateral, debt, userAddress, flashLoanAmountRaw, protocolName, morphoContext, market, orderManagerAddress, chunkParams, chainId, marginAmountRaw]);

  // cowChunks is now directly returned by buildCowInstructions
  const cowChunks = buildCowInstructions;

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
          chunksCount: cowChunks.length,
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

        // 1. Build pre-order instructions list for authorization
        // These are instructions that need user authorization (ERC20 approve, credit delegation)
        // The useCowLimitOrder hook will handle getting authorizations for ALL instructions
        const preOrderInstructions: ProtocolInstruction[] = [];
        
        if (isFlashLoanMode) {
          // Flash loan mode: collateral is pulled in post-hook, so we need approval for that
          if (marginAmountRaw > 0n && collateral) {
            const pullForAuth = createRouterInstruction(
              encodePullToken(marginAmountRaw, collateral.address, userAddress)
            );
            preOrderInstructions.push(pullForAuth);
          }
          
          // Credit delegation for flash loan repayment borrow
          const totalFlashLoanFee = (chunkParams.flashLoanFee ?? 0n) * BigInt(chunkParams.numChunks);
          const flashLoanRepayAmount = flashLoanAmountRaw + totalFlashLoanFee;
          const borrowForAuth = createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(
              LendingOp.Borrow,
              debt.address,
              userAddress,
              flashLoanRepayAmount,
              context,
              999
            )
          );
          preOrderInstructions.push(borrowForAuth);
        } else {
          // Multi-chunk mode: initial deposit before order creation
          if (marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
            preOrderInstructions.push(buildInitialDepositFlow[0]);
          }
          
          // Seed borrow (covers post-hook borrows too)
          if (seedBorrowInstruction) {
            preOrderInstructions.push(seedBorrowInstruction);
          }
        }

        // 2. Build initial deposit router call (ONLY for multi-chunk mode)
        // Flash loan mode does the deposit in the post-hook after the swap
        if (!isFlashLoanMode && marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
          const depositCall = buildRouterCall(buildInitialDepositFlow);
          if (depositCall) {
            allCalls.push(depositCall);
            console.log("[Limit Order] Added deposit router call");
          }
        }

        // 3. Build seed borrow router call (ONLY for multi-chunk mode)
        // Flash loan mode skips this - solver provides funds via flash loan
        if (!isFlashLoanMode && seedBorrowInstruction) {
          const pushTokenInstruction = createRouterInstruction(encodePushToken(0, userAddress));
          const seedBorrowCall = buildRouterCall([seedBorrowInstruction, pushTokenInstruction]);
          if (seedBorrowCall) {
            allCalls.push(seedBorrowCall);
            console.log("[Limit Order] Added seed borrow + push router call");
          }
        }

        // 4. Build CoW order calls using the new useCowLimitOrder hook
        // This hook handles: delegation, authorization, appData registration, order creation
        // The hook returns all calls in correct order, ready for batching
        const limitOrderResult = await buildLimitOrderCalls({
          sellToken: debt.address as Address,
          buyToken: collateral.address as Address,
          chunkSize: chunkParams.chunkSize,
          minBuyPerChunk: minBuyPerChunkRaw,
          totalAmount: flashLoanAmountRaw,
          chunks: cowChunks,
          completion: CompletionType.Iterations,
          targetValue: chunkParams.numChunks,
          minHealthFactor: "1.1",
          seedAmount: seedAmount,
          flashLoan: isFlashLoanMode && chunkParams.flashLoanLender ? {
            lender: chunkParams.flashLoanLender as Address,
            token: debt.address as Address,
            amount: chunkParams.chunkSize, // Per-chunk amount
          } : undefined,
          // Include pre-order instructions for auth checking
          preOrderInstructions: preOrderInstructions,
          isKindBuy: false, // KIND_SELL: exact sell amount, min buy amount
        });

        if (!limitOrderResult) {
          throw new Error("Failed to build CoW order calls");
        }

        // Check for AppData registration errors
        if (!limitOrderResult.success) {
          const errorMsg = limitOrderResult.error || "Unknown error building order";
          const fullError = limitOrderResult.errorDetails?.apiResponse 
            ? `${errorMsg}\n\nAPI Response: ${limitOrderResult.errorDetails.apiResponse}`
            : errorMsg;
          console.error("[Limit Order] Build failed:", fullError, limitOrderResult.errorDetails);
          notification.error(
            <TransactionToast 
              step="failed" 
              message={`CoW API Error: ${errorMsg}`}
            />
          );
          throw new Error(errorMsg);
        }

        // Add all order-related calls (already in correct order: delegation -> auth -> seed approve -> order)
        allCalls.push(...limitOrderResult.calls);
        console.log("[Limit Order] Added order calls:", limitOrderResult.calls.length);

        // Store salt and appDataHash for later reference
        const cowCalls = {
          salt: limitOrderResult.salt,
          appDataHash: limitOrderResult.appDataHash,
        };

        // Save order note for display on orders page
        if (cowCalls.salt && debt && collateral) {
          saveOrderNote(createLeverageUpNote(
            cowCalls.salt,
            protocolName,
            debt.symbol,       // debt being borrowed
            collateral.symbol, // collateral being deposited
            chainId
          ));
        }

        console.log("[Limit Order] Total calls:", allCalls.length);

        let notificationId: string | number = notification.loading(
          <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
        );

        try {
          if (useBatchedTx && sendCallsAsync) {
            // EIP-5792 Batched execution (may not work with all wallets)
            console.log("[Limit Order] Using batched TX mode (EIP-5792)");
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
          } else {
            // Sequential execution (more compatible with wallets like MetaMask)
            console.log("[Limit Order] Using sequential TX mode");
            if (!walletClient || !publicClient) {
              throw new Error("Wallet not connected");
            }

            const result = await executeSequentialTransactions(
              publicClient,
              walletClient,
              allCalls as TransactionCall[],
              userAddress!,
              {
                simulateFirst: true,
                onProgress: (step, total, phase) => {
                  notification.remove(notificationId);
                  const message = phase === "simulating"
                    ? `Simulating step ${step}/${total}...`
                    : phase === "executing"
                      ? `Executing step ${step}/${total}...`
                      : `Step ${step}/${total} confirmed`;
                  notificationId = notification.loading(
                    <TransactionToast step="pending" message={message} />
                  );
                  if (phase === "confirmed") {
                    console.log(`[Limit Order] Step ${step} confirmed`);
                  }
                },
                onError: (step, error) => {
                  console.error(`[Limit Order] Step ${step} FAILED:`, error);
                  notification.remove(notificationId);
                  notification.error(`Step ${step} would fail: ${error}`);
                },
              }
            );

            if (!result.success) {
              throw new Error(result.error || "Transaction failed");
            }

            notification.remove(notificationId);

            // Store salt for CoW Explorer link
            setLastOrderSalt(cowCalls.salt);

            // Show success notification
            const explorerUrl = getCowExplorerAddressUrl(chainId, userAddress!);
            notification.success(
              <TransactionToast
                step="confirmed"
                message="Limit order created!"
                blockExplorerLink={explorerUrl}
              />
            );

            console.log("[Limit Order] All steps completed");
            console.log("[Limit Order] Salt:", cowCalls.salt);
            console.log("[Limit Order] AppData Hash:", cowCalls.appDataHash);

            track("multiply_limit_order_complete", { status: "submitted", mode: "sequential" });

            // Close modal after success
            onClose();
          }
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
      <div className="modal-box bg-base-100 border-base-300/30 relative max-w-2xl rounded-2xl border p-0">
        {/* Header */}
        <div className="border-base-300/30 flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold">Loop Position</h3>
          <div className="flex items-center gap-3">
            <span className="text-base-content/50 text-sm">{protocolName}</span>
            <button className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="p-5">
          {/* Two Column Layout: Collateral | Borrow */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            {/* Deposit section */}
            <div className="bg-base-200/40 border-base-300/20 rounded-xl border p-4">
              <div className="text-base-content/60 mb-2 flex items-center justify-between text-sm">
                <span>Deposit</span>
                <button
                  className="hover:text-primary text-xs transition-colors"
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
                  className="placeholder:text-base-content/30 min-w-0 flex-1 bg-transparent text-xl font-medium outline-none"
                />
                {/* In zap mode, show debt token selector (deposit = debt); otherwise show collateral selector */}
                {zapMode ? (
                  disableAssetSelection ? (
                    <div className="bg-primary/10 flex items-center gap-1.5 rounded-lg px-2 py-1">
                      {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="text-xs font-medium">{debt?.symbol || "?"}</span>
                    </div>
                  ) : (
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-xs bg-primary/10 hover:bg-primary/20 gap-1.5 rounded-lg border-0 px-2">
                        {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                        <span className="text-xs font-medium">{debt?.symbol || "?"}</span>
                        <svg className="size-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content menu bg-base-100 border-base-300/30 z-50 mt-2 w-52 rounded-xl border p-2 shadow-xl">
                        {debtWithWalletBalance.map(d => {
                          const bal = Number(formatUnits(d.walletBalance, d.decimals));
                          return (
                            <li key={d.address}>
                              <a onClick={() => setDebt(d)} className={`flex items-center justify-between text-sm ${debt?.address === d.address ? "active" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <Image src={d.icon} alt="" width={18} height={18} className="rounded-full" />
                                  {d.symbol}
                                </div>
                                <span className="text-base-content/50 text-xs">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )
                ) : (
                  disableAssetSelection ? (
                    <div className="bg-primary/10 flex items-center gap-1.5 rounded-lg px-2 py-1">
                      {collateral && <Image src={collateral.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="text-xs font-medium">{collateral?.symbol || "?"}</span>
                    </div>
                  ) : (
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-xs bg-primary/10 hover:bg-primary/20 gap-1.5 rounded-lg border-0 px-2">
                        {collateral && <Image src={collateral.icon} alt="" width={16} height={16} className="rounded-full" />}
                        <span className="text-xs font-medium">{collateral?.symbol || "?"}</span>
                        <svg className="size-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content menu bg-base-100 border-base-300/30 z-50 mt-2 w-52 rounded-xl border p-2 shadow-xl">
                        {collateralsWithWalletBalance.map(c => {
                          const bal = Number(formatUnits(c.walletBalance, c.decimals));
                          return (
                            <li key={c.address}>
                              <a onClick={() => setCollateral(c)} className={`flex items-center justify-between text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <Image src={c.icon} alt="" width={18} height={18} className="rounded-full" />
                                  {c.symbol}
                                </div>
                                <span className="text-base-content/50 text-xs">{bal > 0 ? bal.toFixed(4) : "-"}</span>
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
                <div className="border-base-300/30 mt-2 flex items-center justify-between border-t pt-2">
                  <div className="text-base-content/60 flex items-center gap-1.5 text-xs">
                    <span>↓ swap to</span>
                  </div>
                  {disableAssetSelection ? (
                    <div className="bg-success/10 flex items-center gap-1.5 rounded-lg px-2 py-1">
                      {collateral && <Image src={collateral.icon} alt="" width={14} height={14} className="rounded-full" />}
                      <span className="text-xs font-medium">{collateral?.symbol || "?"}</span>
                    </div>
                  ) : (
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-xs bg-success/10 hover:bg-success/20 gap-1.5 rounded-lg border-0 px-2">
                        {collateral && <Image src={collateral.icon} alt="" width={14} height={14} className="rounded-full" />}
                        <span className="text-xs font-medium">{collateral?.symbol || "?"}</span>
                        <svg className="size-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </label>
                      <ul tabIndex={0} className="dropdown-content menu bg-base-100 border-base-300/30 z-50 mt-2 w-52 rounded-xl border p-2 shadow-xl">
                        {collateralsWithWalletBalance.map(c => {
                          const bal = Number(formatUnits(c.walletBalance, c.decimals));
                          return (
                            <li key={c.address}>
                              <a onClick={() => setCollateral(c)} className={`flex items-center justify-between text-sm ${collateral?.address === c.address ? "active" : ""}`}>
                                <div className="flex items-center gap-2">
                                  <Image src={c.icon} alt="" width={18} height={18} className="rounded-full" />
                                  {c.symbol}
                                </div>
                                <span className="text-base-content/50 text-xs">{bal > 0 ? bal.toFixed(4) : "-"}</span>
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
              <div className="border-base-300/30 mt-2 flex items-center justify-between border-t pt-2">
                <span className="text-base-content/50 text-xs">≈ ${marginUsd.toFixed(2)}</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-base-content/40">→</span>
                  <span className="text-success font-medium">{metrics.totalCollateralTokens.toFixed(4)} {collateral?.symbol}</span>
                  <span className="text-base-content/50">(${metrics.totalCollateralUsd.toFixed(2)})</span>
                </div>
              </div>
            </div>

            {/* Borrow */}
            <div className="bg-base-200/40 border-base-300/20 rounded-xl border p-4">
              <div className="text-base-content/60 mb-2 text-sm">Borrow</div>
              <div className="flex items-center gap-2">
                <div className="text-error flex-1 truncate text-xl font-medium">
                  {shortAmount > 0 ? shortAmount.toFixed(4) : "0"}
                </div>
                {disableAssetSelection ? (
                  <div className="bg-base-300/30 flex items-center gap-1.5 rounded-lg px-2 py-1">
                    {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                    <span className="text-xs font-medium">{debt?.symbol || "?"}</span>
                  </div>
                ) : (
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-xs bg-base-300/30 hover:bg-base-300/50 cursor-pointer gap-1.5 rounded-lg border-0 px-2">
                      {debt && <Image src={debt.icon} alt="" width={16} height={16} className="rounded-full" />}
                      <span className="text-xs font-medium">{debt?.symbol || "?"}</span>
                      <svg className="size-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </label>
                    <ul tabIndex={0} className="dropdown-content menu bg-base-100 border-base-300/30 z-50 mt-2 w-52 rounded-xl border p-2 shadow-xl">
                      {debtWithWalletBalance.map(d => {
                        const bal = Number(formatUnits(d.walletBalance, d.decimals));
                        return (
                          <li key={d.address}>
                            <a onClick={() => setDebt(d)} className={`flex items-center justify-between text-sm ${debt?.address === d.address ? "active" : ""}`}>
                              <div className="flex items-center gap-2">
                                <Image src={d.icon} alt="" width={18} height={18} className="rounded-full" />
                                {d.symbol}
                              </div>
                              <span className="text-base-content/50 text-xs">{bal > 0 ? bal.toFixed(4) : "-"}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              <div className="text-base-content/50 border-base-300/30 mt-2 border-t pt-2 text-xs">≈ ${metrics.debtUsd.toFixed(2)}</div>
            </div>
          </div>

          {/* Multiplier Slider */}
          <div className="bg-base-200/40 border-base-300/20 mb-4 rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Leverage</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={leverageInput}
                  onChange={e => { setLeverageInput(e.target.value); const val = parseFloat(e.target.value); if (!isNaN(val)) updateLeverage(val); }}
                  onBlur={() => setLeverageInput(leverage.toFixed(2))}
                  className="bg-base-300/50 w-14 rounded-lg px-2 py-1 text-right text-sm font-medium outline-none"
                />
                <span className="text-base-content/50 text-sm">×</span>
              </div>
            </div>
            <input
              type="range" min="1" max={maxLeverage} step="0.01" value={leverage}
              onChange={e => updateLeverage(parseFloat(e.target.value))}
              className="range range-primary range-sm w-full"
            />
            <div className="text-base-content/40 mt-1.5 flex justify-between text-xs">
              {ticks.map((t, i) => (
                <span key={i}>{i === ticks.length - 1 ? `Max ${t.toFixed(1)}×` : `${t.toFixed(1)}×`}</span>
              ))}
            </div>

            {/* Execution Type Toggle - Market vs Limit */}
            {cowAvailable && (
              <div className="border-base-300/30 mt-4 flex items-center gap-2 border-t pt-3">
                <button
                  onClick={() => setExecutionType("market")}
                  className={`btn btn-xs flex-1 ${executionType === "market" ? "btn-primary" : "btn-ghost"}`}
                >
                  <span className="mr-1">⚡</span> Market
                </button>
                <button
                  onClick={() => setExecutionType("limit")}
                  className={`btn btn-xs flex-1 ${executionType === "limit" ? "btn-primary" : "btn-ghost"}`}
                  disabled={!cowContractAvailable || !isDevEnvironment}
                  title={
                    !isDevEnvironment 
                      ? "Limit orders are only available in development environment" 
                      : !cowContractAvailable 
                        ? "CoW contracts not deployed on this chain" 
                        : "Execute via CoW Protocol limit order"
                  }
                >
                  <ClockIcon className="mr-1 size-3" /> Limit
                </button>
              </div>
            )}

            {/* Limit Order Pricing */}
            {executionType === "limit" && (
              <div className="bg-base-200/60 border-base-300/30 mt-3 rounded-lg border p-3 text-xs">
                {/* Market Rate Display */}
                <div className="mb-2 flex items-center justify-between">
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
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-base-content/60">Max Slippage</span>
                    <span className="text-warning font-medium">
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
                  <div className="text-base-content/40 mt-0.5 flex justify-between text-[10px]">
                    <span>0%</span>
                    <span>0.1%</span>
                    <span>1%</span>
                    <span>5%</span>
                  </div>
                  {limitSlippage === 0 && (
                    <div className="text-warning mt-1 text-[10px]">
                      0% slippage - order may not fill if price moves
                    </div>
                  )}
                </div>

                {/* Computed Min Output */}
                <div className="border-base-300/30 flex items-center justify-between border-t py-2">
                  <span className="text-base-content/60">Min Output</span>
                  <span className="text-success font-medium">
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
                  className="text-base-content/50 hover:text-base-content/70 mt-1 flex items-center gap-1 text-[10px]"
                >
                  <svg 
                    className={`size-3 transition-transform${showAdvancedPricing ? "rotate-90" : ""}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Set custom min output
                </button>
                
                {showAdvancedPricing && (
                  <div className="border-base-300/30 mt-2 border-t pt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={customMinPrice}
                        onChange={e => setCustomMinPrice(e.target.value)}
                        placeholder={minCollateralOut.formatted}
                        className="bg-base-300/50 flex-1 rounded px-2 py-1 text-xs outline-none"
                      />
                      <span className="text-base-content/50">{collateral?.symbol}</span>
                    </div>
                    {customMinPrice && (
                      <p className="text-warning mt-1 text-[10px]">
                        Using custom min output. Order will only fill if you receive at least this amount.
                      </p>
                    )}
                  </div>
                )}

                {/* Flash Loan Config - Provider selection, chunks, etc. */}
                {debt && limitOrderSellToken && (
                  <div className="border-base-300/30 mt-2 border-t pt-2">
                    <LimitOrderConfig
                      chainId={chainId}
                      sellToken={limitOrderSellToken}
                      totalAmount={flashLoanAmountRaw}
                      onConfigChange={handleLimitOrderConfigChange}
                      useFlashLoan={useFlashLoan}
                      setUseFlashLoan={setUseFlashLoan}
                      numChunks={flashLoanChunks}
                      setNumChunks={setFlashLoanChunks}
                      compact
                    />
                  </div>
                )}

                {/* Chunk Info - shown when multi-chunk execution needed (flash loan OFF) */}
                {!chunkParams.useFlashLoan && chunkParams.needsChunking && (
                  <div className="border-base-300/30 mt-2 flex items-start gap-1.5 border-t pt-2 text-[10px]">
                    <svg className="text-info mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                {/* Batched TX Toggle - for wallet compatibility */}
                <div className="border-base-300/30 mt-2 flex items-center justify-between border-t pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base-content/60">Batched TX</span>
                    <span className="text-base-content/40 text-[10px]">(EIP-5792)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base-content/40 text-[10px]">
                      {useBatchedTx ? "faster" : "compatible"}
                    </span>
                    <input
                      type="checkbox"
                      checked={useBatchedTx}
                      onChange={e => setUseBatchedTx(e.target.checked)}
                      className="toggle toggle-primary toggle-xs"
                    />
                  </div>
                </div>
                {!useBatchedTx && (
                  <div className="mt-1 flex items-start gap-1.5 text-[10px]">
                    <svg className="text-warning mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-warning/80">
                      Sequential mode: each step requires separate wallet confirmation. More compatible with MetaMask.
                    </span>
                  </div>
                )}

                {/* Info note */}
                <div className="border-base-300/30 text-base-content/50 mt-2 flex items-start gap-1.5 border-t pt-2 text-[10px]">
                  <ClockIcon className="mt-0.5 size-3 shrink-0" />
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
            <div className={`grid grid-cols-2 gap-x-4 gap-y-2 ${executionType === "limit" && cowAvailable ? "mt-3" : "border-base-300/30 mt-4 border-t pt-3"} text-xs`}>
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
                      className="select select-xs bg-base-300/50 h-6 min-h-0 border-0 pr-6 text-xs"
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
                    className="select select-xs bg-base-300/50 h-6 min-h-0 border-0 pr-6 text-xs"
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
                    className="select select-xs bg-base-300/50 h-6 min-h-0 border-0 pr-6 text-xs"
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
          <div className="bg-base-200/40 border-base-300/20 mb-3 flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
            <div className="flex-1 text-center">
              <div className="text-base-content/50 mb-0.5">LTV</div>
              <div className="font-medium">{metrics.ltv > 0 ? `${metrics.ltv.toFixed(1)}%` : "-"} / {formatBps(effectiveLltvBps)}%</div>
            </div>
            <div className="bg-base-300/50 h-6 w-px" />
            <div className="flex-1 text-center">
              <div className="text-base-content/50 mb-0.5">{collateral?.symbol}</div>
              <div className="font-medium">${collateralPrice > 0 ? collateralPrice.toFixed(2) : "-"}</div>
            </div>
            <div className="bg-base-300/50 h-6 w-px" />
            <div className="flex-1 text-center">
              <div className="text-base-content/50 mb-0.5">{debt?.symbol}</div>
              <div className="font-medium">${debt ? Number(formatUnits(debt.price ?? 0n, 8)).toFixed(2) : "-"}</div>
            </div>
            <div className="bg-base-300/50 h-6 w-px" />
            <div className="flex-1 text-center">
              <div className="text-base-content/50 mb-0.5">Net APY</div>
              <div className={`font-medium ${netApy !== null && netApy > 0 ? "text-success" : netApy !== null && netApy < 0 ? "text-error" : ""}`}>
                {netApy !== null ? `${netApy > 0 ? "+" : ""}${netApy.toFixed(2)}%` : "-"}
              </div>
            </div>
            <div className="bg-base-300/50 h-6 w-px" />
            <div className="flex-1 text-center">
              <div className="text-base-content/50 mb-0.5">30D Yield</div>
              <div className={`font-medium ${netYield30d !== null && netYield30d > 0 ? "text-success" : netYield30d !== null && netYield30d < 0 ? "text-error" : ""}`}>
                {netYield30d !== null ? `${netYield30d >= 0 ? "+" : ""}$${Math.abs(netYield30d).toFixed(2)}` : "-"}
              </div>
            </div>
          </div>

          {/* Details - Compact 2-column grid */}
          <div className="bg-base-200/40 border-base-300/20 mb-3 rounded-lg border p-2.5 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between">
                <span className="text-base-content/50">Swap</span>
                <span className="ml-2 truncate text-right">
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
              <div className="border-base-300/30 text-base-content/40 mt-1.5 border-t pt-1.5 text-[10px]">
                <span>FL: {fees.flashLoanFeePercent > 0 ? `${fees.flashLoanFeePercent}%` : "free"}</span>
                {fees.priceImpactPercent > 0.001 && (
                  <span className="ml-2">Impact: {fees.priceImpactPercent.toFixed(3)}%</span>
                )}
              </div>
            )}
            {/* Limit order info */}
            {executionType === "limit" && (
              <div className="border-base-300/30 text-base-content/40 mt-1.5 border-t pt-1.5 text-[10px]">
                <span>CoW solver fee included in price • MEV protected</span>
              </div>
            )}
            <div className="border-base-300/30 mt-1.5 flex justify-between border-t pt-1.5">
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
                className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"}`}
              >
                <CheckIcon className={`size-4 ${preferBatching ? "" : "opacity-40"}`} />
                Batch transactions
              </button>
            ) : (
              <span className="text-base-content/50 inline-flex items-center gap-1 text-xs">
                <ClockIcon className="size-3.5" />
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
                  <ClockIcon className="mr-1 size-4" />
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
