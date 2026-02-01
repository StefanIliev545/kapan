import { FC, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { track } from "@vercel/analytics";
import Image from "next/image";
import { Address, formatUnits, parseUnits, type TransactionReceipt } from "viem";
import { CheckIcon, ClockIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { usePredictiveMaxLeverage, EModeCategory } from "~~/hooks/usePredictiveLtv";
import { useCowOrder } from "~~/hooks/useCowOrder";
import {
  useCowConditionalOrder,
  encodeLimitPriceTriggerParams,
  getProtocolId,
  type ConditionalOrderInstructions,
} from "~~/hooks/useCowConditionalOrder";
import { useCowQuote } from "~~/hooks/useCowQuote";
import { SwapAsset, SwapRouter, SWAP_ROUTER_OPTIONS } from "./SwapModalShell";
import {
  FlashLoanProvider,
  MorphoMarketContextForEncoding,
  encodeMorphoContext,
  calculateLimitPrice,
} from "~~/utils/v2/instructionHelpers";
import { getCowExplorerAddressUrl, calculateChunkParams, calculateSwapRate, storeOrderQuoteRate, getKapanCowAdapter } from "~~/utils/cow";
import { calculateSuggestedSlippage, SLIPPAGE_OPTIONS } from "~~/utils/slippage";
import { formatBps } from "~~/utils/risk";
import { is1inchSupported, isKyberSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getKyberAdapterInfo, getPendleAdapterInfo, isAaveV3Supported, isBalancerV2Supported, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";
import { saveOrderNote, createLeverageUpNote } from "~~/utils/orderNotes";
import { extractOrderHash } from "~~/utils/orderHashExtractor";
import { useSaveOrder } from "~~/hooks/useOrderHistory";

// Import helper functions to reduce cognitive complexity
import {
  getBestQuote,
  calculateQuotesPriceImpact,
  calculatePositionMetrics,
  calculateNetApyAndYield,
  calculateFeeBreakdown,
  calculateMinCollateralOut,
  calculateFlashLoanChunkParams,
  buildCowChunkInstructions,
  addWalletBalancesAndSort,
  calculateMaxLeverageFromLtv,
  adjustMaxLeverageForSlippage,
  calculateFlashLoanAmount,
  getDefaultFlashLoanProviders,
  formatLtvDisplay,
  formatPriceDisplay,
  getApyColorClass,
  formatApyDisplay,
  formatYield30dDisplay,
  type QuoteData,
  type ChunkParamsResult,
} from "./multiplyEvmHelpers";

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

// Static empty objects for default props - extracted to avoid creating new objects on each render
const EMPTY_APY_MAP: Record<string, number> = {};

export const MultiplyEvmModal: FC<MultiplyEvmModalProps> = ({
  isOpen, onClose, protocolName, chainId, collaterals, debtOptions, market, morphoContext,
  maxLtvBps = 8000n, lltvBps = 8500n, supplyApyMap = EMPTY_APY_MAP, borrowApyMap = EMPTY_APY_MAP, eMode, disableAssetSelection = false,
}) => {
  const wasOpenRef = useRef(false);
  // Refs to avoid stale closure issues in handleSubmit
  const handleLimitOrderSubmitRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleMarketOrderSubmitRef = useRef<() => Promise<void>>(() => Promise.resolve());
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
  const [limitSlippage, setLimitSlippage] = useState<number>(0.1);
  const [hasAutoSetLimitSlippage, setHasAutoSetLimitSlippage] = useState(false);
  // Market order auto-slippage
  const [hasAutoSetMarketSlippage, setHasAutoSetMarketSlippage] = useState(false);
  // customMinPrice: user-specified exchange rate for limit orders
  const [customMinPrice, setCustomMinPrice] = useState<string>("");
  // priceInputInverted: false = "1 DEBT = X COLL", true = "1 COLL = X DEBT"
  const [priceInputInverted, setPriceInputInverted] = useState<boolean>(false);
  const cowAvailable = isCowProtocolSupported(chainId);


  // Flash loan toggle for limit orders
  const [useFlashLoan] = useState<boolean>(true);
  const [chunksInput, setChunksInput] = useState<string>("1");
  const [limitOrderConfig] = useState<LimitOrderResult | null>(null);

  // Derive flashLoanChunks directly from chunksInput (synchronous, no delay)
  const flashLoanChunks = useMemo(() => {
    const parsed = parseInt(chunksInput) || 1;
    return Math.max(1, Math.min(100, parsed));
  }, [chunksInput]);

  // Get user address for CoW order creation
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // CoW order hooks
  const { isCreating: isCowCreating, isAvailable: cowContractAvailable } = useCowOrder();
  // Conditional order hook (new system)
  const {
    buildOrderCalls: buildConditionalOrderCalls,
    isReady: conditionalOrderReady,
    managerAddress: conditionalOrderManagerAddress,
    limitPriceTriggerAddress,
  } = useCowConditionalOrder();
  const saveOrder = useSaveOrder();

  // Check swap router availability for this chain
  const oneInchAvailable = is1inchSupported(chainId);
  const kyberAvailable = isKyberSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const defaultRouter = getDefaultSwapRouter(chainId);

  // Swap router selection - default based on chain availability (Kyber preferred)
  const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "kyber");

  // Zap mode: deposit debt token instead of collateral
  const [zapMode, setZapMode] = useState(false);

  // ==================== Effects for Router/Token Changes ====================

  useEffect(() => {
    if (swapRouter === "kyber" && !kyberAvailable) {
      setSwapRouter(oneInchAvailable ? "1inch" : pendleAvailable ? "pendle" : "kyber");
    } else if (swapRouter === "1inch" && !oneInchAvailable) {
      setSwapRouter(kyberAvailable ? "kyber" : pendleAvailable ? "pendle" : "1inch");
    } else if (swapRouter === "pendle" && !pendleAvailable) {
      setSwapRouter(kyberAvailable ? "kyber" : oneInchAvailable ? "1inch" : "pendle");
    }
  }, [chainId, oneInchAvailable, kyberAvailable, pendleAvailable, swapRouter]);

  useEffect(() => {
    const collateralIsPT = collateral && isPendleToken(collateral.symbol);
    const debtIsPT = debt && isPendleToken(debt.symbol);
    if ((collateralIsPT || debtIsPT) && pendleAvailable) {
      setSwapRouter("pendle");
    }
  }, [collateral, debt, pendleAvailable]);

  // ==================== Predictive LTV Data ====================

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

  // ==================== Computed Values Using Helpers ====================

  const maxLeverage = useMemo(() => {
    let baseLeverage: number;
    if (predictiveMaxLeverage > 1 && (collateralConfig || isEModeActive)) {
      baseLeverage = predictiveMaxLeverage;
    } else {
      baseLeverage = calculateMaxLeverageFromLtv(maxLtvBps, protocolName);
    }
    return adjustMaxLeverageForSlippage(baseLeverage, slippage);
  }, [predictiveMaxLeverage, collateralConfig, isEModeActive, maxLtvBps, protocolName, slippage]);

  const effectiveLltvBps = useMemo(() => {
    if (predictiveLiqThreshold > 0 && (collateralConfig || isEModeActive)) {
      return BigInt(Math.round(predictiveLiqThreshold * 100));
    }
    return lltvBps;
  }, [predictiveLiqThreshold, collateralConfig, isEModeActive, lltvBps]);

  const updateLeverage = useCallback((val: number) => {
    const clamped = Math.min(Math.max(1, val), maxLeverage);
    setLeverage(clamped);
    setLeverageInput(clamped.toFixed(2));
  }, [maxLeverage]);

  // ==================== Wallet Balances ====================

  const allTokens = useMemo(() => {
    const tokens = collaterals.map(c => ({ address: c.address, decimals: c.decimals }));
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

  const collateralsWithWalletBalance = useMemo(() =>
    addWalletBalancesAndSort(collaterals, walletBalances),
    [collaterals, walletBalances]
  );

  const debtWithWalletBalance = useMemo(() =>
    addWalletBalancesAndSort(debtOptions, walletBalances),
    [debtOptions, walletBalances]
  );

  const currentCollateral = useMemo(() =>
    collateral ? collateralsWithWalletBalance.find(c => c.address === collateral.address) : undefined,
    [collateral, collateralsWithWalletBalance]);

  const currentDebt = useMemo(() =>
    debt ? debtWithWalletBalance.find(d => d.address === debt.address) : undefined,
    [debt, debtWithWalletBalance]);

  const walletBalance = zapMode ? (currentDebt?.walletBalance ?? 0n) : (currentCollateral?.walletBalance ?? 0n);
  const depositToken = zapMode ? debt : collateral;
  const depositDecimals = depositToken?.decimals ?? 18;

  // ==================== Modal Open/Close Effects ====================

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setMarginAmount(""); setLeverage(1); setLeverageInput("1.00");
      track("multiply_modal_open", { protocol: protocolName, chainId });
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, protocolName, chainId]);

  useEffect(() => {
    if (collateralsWithWalletBalance.length > 0 && !collateral) {
      setCollateral(collateralsWithWalletBalance[0]);
    }
    if (debtWithWalletBalance.length > 0 && !debt) {
      setDebt(debtWithWalletBalance[0]);
    }
  }, [collateralsWithWalletBalance, debtWithWalletBalance, collateral, debt]);

  // ==================== Adapter Info ====================

  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const kyberAdapter = getKyberAdapterInfo(chainId);
  const pendleAdapter = getPendleAdapterInfo(chainId);

  // Select the correct adapter based on swap router
  const activeAdapter = swapRouter === "kyber" ? kyberAdapter : swapRouter === "pendle" ? pendleAdapter : oneInchAdapter;

  // ==================== Amount Calculations ====================

  const marginAmountRaw = useMemo(() => {
    try {
      if (!depositToken) return 0n;
      const parsed = parseUnits(marginAmount || "0", depositDecimals);
      return parsed > 0n ? parsed : 0n;
    }
    catch { return 0n; }
  }, [depositToken, depositDecimals, marginAmount]);

  const flashLoanAmountRaw = useMemo(() => {
    if (!collateral || !debt || leverage <= 1 || marginAmountRaw === 0n) return 0n;

    if (zapMode) {
      const leverageMultiplier = Math.round((leverage - 1) * 10000);
      return (marginAmountRaw * BigInt(leverageMultiplier)) / 10000n;
    }

    return calculateFlashLoanAmount(
      marginAmountRaw, leverage,
      collateral.price ?? 0n, debt.price ?? 0n,
      collateral.decimals, debt.decimals
    );
  }, [collateral, debt, leverage, marginAmountRaw, zapMode]);

  const totalSwapAmount = useMemo(() => {
    if (!zapMode) return flashLoanAmountRaw;
    return marginAmountRaw + flashLoanAmountRaw;
  }, [zapMode, marginAmountRaw, flashLoanAmountRaw]);

  // ==================== Flash Loan Providers ====================

  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen, networkType: "evm", fromProtocol: protocolName, chainId,
    position: collateral ? { name: collateral.symbol, tokenAddress: collateral.address, decimals: collateral.decimals, type: "supply" }
      : { name: "", tokenAddress: "0x0000000000000000000000000000000000000000", decimals: 18, type: "supply" },
  });

  const providerOptions = useMemo(() => {
    if (flashLoanProviders?.length) return flashLoanProviders;
    if (defaultFlashLoanProvider) return [defaultFlashLoanProvider];
    return getDefaultFlashLoanProviders(chainId, isAaveV3Supported, isBalancerV2Supported);
  }, [defaultFlashLoanProvider, flashLoanProviders, chainId]);

  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders: providerOptions, defaultProvider: defaultFlashLoanProvider ?? providerOptions[0],
    tokenAddress: debt?.address as Address, amount: flashLoanAmountRaw, chainId,
  });


  // ==================== Swap Quotes ====================

  const swapQuoteAmount = zapMode ? totalSwapAmount : flashLoanAmountRaw;

  const kyberOrOneInchEnabled = (kyberAvailable && swapRouter === "kyber" || oneInchAvailable && swapRouter === "1inch") && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!activeAdapter;

  const { data: oneInchQuote, isLoading: is1inchLoading } = use1inchQuote({
    chainId, src: (debt?.address as Address) || "0x0000000000000000000000000000000000000000",
    dst: (collateral?.address as Address) || "0x0000000000000000000000000000000000000000",
    amount: swapQuoteAmount.toString(), from: (activeAdapter?.address as Address) || "0x0000000000000000000000000000000000000000",
    slippage, enabled: kyberOrOneInchEnabled,
    preferredRouter: swapRouter === "kyber" ? "kyber" : "1inch",
  });

  const pendleConvertResult = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    tokensIn: debt?.address as Address,
    tokensOut: collateral?.address as Address,
    amountsIn: swapQuoteAmount.toString(),
    slippage: slippage / 100,
    enabled: pendleAvailable && swapRouter === "pendle" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!pendleAdapter,
  });
  const { data: pendleQuote, isLoading: isPendleLoading } = pendleConvertResult;

  // Ref to store latest quote values to avoid stale closures in submit handlers
  // This fixes the issue where handleSubmit's useCallback captures old quote references
  const quotesRef = useRef<{
    oneInchQuote: typeof oneInchQuote;
    pendleQuote: typeof pendleQuote;
    activeAdapter: typeof activeAdapter;
    pendleAdapter: typeof pendleAdapter;
  }>({ oneInchQuote: undefined, pendleQuote: undefined, activeAdapter, pendleAdapter });

  // Keep ref in sync with latest values
  useEffect(() => {
    quotesRef.current = { oneInchQuote, pendleQuote, activeAdapter, pendleAdapter };
  }, [oneInchQuote, pendleQuote, activeAdapter, pendleAdapter]);

  const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
    sellToken: debt?.address || "",
    buyToken: collateral?.address || "",
    sellAmount: swapQuoteAmount.toString(),
    from: userAddress || "",
    enabled: cowAvailable && executionType === "limit" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!userAddress,
  });

  const isSwapQuoteLoading = executionType === "limit"
    ? isCowQuoteLoading
    : (swapRouter === "pendle" ? isPendleLoading : is1inchLoading);

  // ==================== Quote Processing Using Helpers ====================

  const quoteData: QuoteData = useMemo(() => ({
    oneInchQuote: oneInchQuote ? {
      dstAmount: oneInchQuote.dstAmount,
      srcUSD: oneInchQuote.srcUSD,
      dstUSD: oneInchQuote.dstUSD,
      tx: oneInchQuote.tx,
    } : null,
    pendleQuote: pendleQuote ? {
      data: pendleQuote.data,
      transaction: pendleQuote.transaction,
    } : null,
    cowQuote: cowQuote ? {
      quote: cowQuote.quote,
    } : null,
  }), [oneInchQuote, pendleQuote, cowQuote]);

  const bestQuote = useMemo(() => getBestQuote(quoteData), [quoteData]);

  // Calculate market exchange rate (collateral per 1 unit of debt) from quote
  // This rate stays constant regardless of swap amount/leverage
  const marketRate = useMemo(() => {
    if (!bestQuote || !collateral || !debt || swapQuoteAmount === 0n) return null;
    // rate = collateralOut / debtIn (normalized to collateral decimals for 1 unit of debt)
    const rateRaw = (bestQuote.amount * BigInt(10 ** debt.decimals)) / swapQuoteAmount;
    const rateFormatted = formatUnits(rateRaw, collateral.decimals);
    return { raw: rateRaw, formatted: rateFormatted };
  }, [bestQuote, collateral, debt, swapQuoteAmount]);

  const quotesPriceImpact = useMemo(() =>
    calculateQuotesPriceImpact(swapRouter, quoteData.pendleQuote, quoteData.oneInchQuote),
    [swapRouter, quoteData.pendleQuote, quoteData.oneInchQuote]
  );

  // ==================== Auto-estimate Slippage ====================

  // Auto-estimate slippage for market orders based on quote price impact
  useEffect(() => {
    if (executionType !== "market" || hasAutoSetMarketSlippage) return;
    if (quotesPriceImpact === null) return;

    const suggested = calculateSuggestedSlippage(quotesPriceImpact);
    setSlippage(suggested);
    setHasAutoSetMarketSlippage(true);
  }, [executionType, quotesPriceImpact, hasAutoSetMarketSlippage]);

  // Auto-estimate slippage for limit orders
  useEffect(() => {
    if (executionType !== "limit" || hasAutoSetLimitSlippage) return;
    if (quotesPriceImpact === null) return;

    const suggested = calculateSuggestedSlippage(quotesPriceImpact);
    setLimitSlippage(suggested);
    setHasAutoSetLimitSlippage(true);
  }, [executionType, quotesPriceImpact, hasAutoSetLimitSlippage]);

  // Reset auto-slippage flags when tokens change
  useEffect(() => {
    setHasAutoSetLimitSlippage(false);
    setLimitSlippage(0.1);
    setHasAutoSetMarketSlippage(false);
    setSlippage(1); // Reset to default
  }, [collateral?.address, debt?.address]);

  // ==================== Min Collateral Calculation ====================

  const minCollateralOut = useMemo(() => {
    // For limit orders, calculate from rate * amount
    if (executionType === "limit" && collateral && debt) {
      // Use custom rate if set, otherwise use market rate
      let rateToUse: bigint; // This is always "collateral per 1 debt"
      if (customMinPrice && customMinPrice !== "") {
        try {
          if (priceInputInverted) {
            // User input is "1 COLL = X DEBT", need to invert to "1 DEBT = Y COLL"
            // Y = 1/X, but we work in raw units
            const inputRate = parseUnits(customMinPrice, debt.decimals);
            if (inputRate === 0n) {
              rateToUse = marketRate?.raw ?? 0n;
            } else {
              // Invert: collPerDebt = 10^collDecimals * 10^debtDecimals / inputRate
              rateToUse = (BigInt(10 ** collateral.decimals) * BigInt(10 ** debt.decimals)) / inputRate;
            }
          } else {
            // User input is "1 DEBT = X COLL" (normal mode)
            rateToUse = parseUnits(customMinPrice, collateral.decimals);
          }
        } catch {
          rateToUse = marketRate?.raw ?? 0n;
        }
      } else {
        rateToUse = marketRate?.raw ?? 0n;
      }

      if (rateToUse === 0n || swapQuoteAmount === 0n) {
        return { raw: 0n, formatted: "0" };
      }

      // Apply slippage to the rate
      const slippageBps = BigInt(Math.round(limitSlippage * 100));
      const rateWithSlippage = (rateToUse * (10000n - slippageBps)) / 10000n;

      // Calculate total: rate * swapAmount / 10^debtDecimals
      const totalRaw = (rateWithSlippage * swapQuoteAmount) / BigInt(10 ** debt.decimals);
      const totalFormatted = formatUnits(totalRaw, collateral.decimals);
      return { raw: totalRaw, formatted: totalFormatted };
    }

    // For market orders, use the original calculation
    return calculateMinCollateralOut(
      collateral,
      executionType,
      customMinPrice,
      bestQuote,
      swapRouter,
      quoteData.oneInchQuote,
      quoteData.pendleQuote,
      limitSlippage,
      slippage
    );
  }, [collateral, debt, executionType, customMinPrice, priceInputInverted, marketRate, swapQuoteAmount, limitSlippage, bestQuote, swapRouter, quoteData.oneInchQuote, quoteData.pendleQuote, slippage]);

  // ==================== Position Metrics ====================

  const metrics = useMemo(() =>
    calculatePositionMetrics({
      collateral,
      debt,
      marginAmountRaw,
      minCollateralFormatted: minCollateralOut.formatted,
      flashLoanAmountRaw,
      effectiveLltvBps,
      zapMode,
    }),
    [collateral, debt, marginAmountRaw, minCollateralOut.formatted, flashLoanAmountRaw, effectiveLltvBps, zapMode]
  );

  const { netApy, netYield30d } = useMemo(() =>
    calculateNetApyAndYield(collateral, debt, metrics, supplyApyMap, borrowApyMap),
    [collateral, debt, metrics, supplyApyMap, borrowApyMap]
  );

  // ==================== Router and Transaction Flow ====================

  const { buildMultiplyFlow } = useKapanRouterV2();

  // ==================== Build Flow for Market Orders ====================

  const buildFlow = () => {
    if (!collateral || !debt || flashLoanAmountRaw === 0n) {
      console.warn("[buildFlow] Early exit:", { collateral: !!collateral, debt: !!debt, flashLoanAmountRaw: flashLoanAmountRaw.toString() });
      return [];
    }

    // Use ref to get latest quote values (avoids stale closure issues)
    const { oneInchQuote: currentOneInchQuote, pendleQuote: currentPendleQuote, activeAdapter: currentActiveAdapter, pendleAdapter: currentPendleAdapter } = quotesRef.current;

    let swapData: string;
    let minOut: string;

    if (swapRouter === "1inch" || swapRouter === "kyber") {
      if (!currentOneInchQuote || !currentActiveAdapter) {
        console.warn("[buildFlow] Swap not ready:", { oneInchQuote: !!currentOneInchQuote, activeAdapter: !!currentActiveAdapter, swapRouter });
        return [];
      }
      swapData = currentOneInchQuote.tx.data;
      minOut = minCollateralOut.formatted;
      console.log("[buildFlow] Kyber/1inch swap params:", {
        swapRouter,
        adapterAddress: currentActiveAdapter.address,
        swapDataLength: swapData?.length || 0,
        swapDataPrefix: swapData?.slice(0, 20) || "empty",
        minOut,
        dstAmount: currentOneInchQuote.dstAmount,
        txTo: currentOneInchQuote.tx?.to,
        txFrom: currentOneInchQuote.tx?.from,
      });
    } else {
      if (!currentPendleQuote || !currentPendleAdapter) {
        console.warn("[buildFlow] Pendle not ready:", { pendleQuote: !!currentPendleQuote, pendleAdapter: !!currentPendleAdapter });
        return [];
      }
      swapData = currentPendleQuote.transaction.data;
      minOut = currentPendleQuote.data.minPtOut || currentPendleQuote.data.minTokenOut || minCollateralOut.formatted;
    }

    const flowParams = {
      protocolName, collateralToken: collateral.address as Address, debtToken: debt.address as Address,
      initialCollateral: zapMode ? "0" : (marginAmount || "0"),
      flashLoanAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
      minCollateralOut: minOut, swapData,
      collateralDecimals: collateral.decimals, debtDecimals: debt.decimals,
      flashLoanProvider: selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2, market,
      morphoContext: morphoContext ? encodeMorphoContext(morphoContext) : undefined,
      swapRouter: (swapRouter === "1inch" ? "oneinch" : swapRouter === "kyber" ? "kyber" : "pendle") as "oneinch" | "kyber" | "pendle",
      zapMode,
      depositAmount: zapMode ? marginAmount : undefined,
    };

    const flow = buildMultiplyFlow(flowParams);
    console.log("[MultiplyEvmModal] buildFlow result:", flow.length, "instructions");
    return flow;
  };

  // ==================== Chunk Parameters for Limit Orders ====================

  const chunkParams = useMemo((): ChunkParamsResult => {
    if (executionType !== "limit" || !collateral || !debt || flashLoanAmountRaw === 0n || marginAmountRaw === 0n) {
      return {
        numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw],
        needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0,
        recommendFlashLoan: false, explanation: ""
      };
    }

    const ltvBps = collateralConfig?.ltv
      ? Number(collateralConfig.ltv)
      : (isEModeActive && eMode ? eMode.ltv : Number(maxLtvBps));

    const collateralPrice = collateral.price ?? 0n;
    const debtPrice = debt.price ?? 0n;

    if (collateralPrice === 0n || debtPrice === 0n) {
      return {
        numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw],
        needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0,
        recommendFlashLoan: false, explanation: "Missing price data"
      };
    }

    // Flash loan mode calculation
    if (useFlashLoan) {
      const result = calculateFlashLoanChunkParams(flashLoanAmountRaw, debt, {
        useFlashLoan,
        flashLoanChunks,
        limitOrderConfig,
        chainId,
      });
      console.log("[ChunkParams] Flash loan mode:", {
        flashLoanChunks,
        chunksInput,
        resultNumChunks: result.numChunks,
        flashLoanLender: result.flashLoanLender,
      });
      return result;
    }

    // Multi-chunk mode calculation
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
      safetyBuffer: 0.90,
    });

    console.log("[Limit Order] Chunk calculation:", {
      initialCollateral: formatUnits(marginAmountRaw, collateral.decimals),
      totalDebt: formatUnits(flashLoanAmountRaw, debt.decimals),
      ltvBps,
      result,
    });

    return result;
  }, [executionType, collateral, debt, flashLoanAmountRaw, marginAmountRaw, collateralConfig, isEModeActive, eMode, maxLtvBps, bestQuote, swapQuoteAmount, useFlashLoan, flashLoanChunks, chainId, limitOrderConfig, chunksInput]);

  // Conditional order trigger params for LimitPriceTrigger
  const conditionalOrderTriggerParams = useMemo(() => {
    if (!collateral || !debt || !limitPriceTriggerAddress || !userAddress) return null;
    if (flashLoanAmountRaw === 0n || minCollateralOut.raw === 0n) return null;

    // Normalize protocol name for getProtocolId
    const normalizedProtocol = protocolName.toLowerCase().includes("aave")
      ? "aave"
      : protocolName.toLowerCase().includes("compound")
        ? "compound"
        : protocolName.toLowerCase().includes("venus")
          ? "venus"
          : protocolName.toLowerCase().includes("morpho")
            ? "morpho"
            : "aave";

    // Calculate limit price (8 decimals, like Chainlink)
    // For leverage-up: we sell debt to buy collateral
    // LimitPriceTrigger expects: limitPrice = (buyAmount / sellAmount) * 1e8
    const limitPrice = calculateLimitPrice(
      flashLoanAmountRaw, debt.decimals,
      minCollateralOut.raw, collateral.decimals
    );

    // Leverage-up is a SELL order: we sell exact borrowed debt to get collateral
    // totalSellAmount = exact debt to sell, totalBuyAmount = min collateral to receive
    return encodeLimitPriceTriggerParams({
      protocolId: getProtocolId(normalizedProtocol),
      protocolContext: (market || "0x") as `0x${string}`,
      sellToken: debt.address as Address,
      buyToken: collateral.address as Address,
      sellDecimals: debt.decimals,
      buyDecimals: collateral.decimals,
      limitPrice,
      triggerAbovePrice: false, // Execute when price <= limit (we want good rates for buying)
      totalSellAmount: flashLoanAmountRaw, // Exact amount to sell (debt)
      totalBuyAmount: minCollateralOut.raw, // Min amount to buy (collateral) - used for slippage protection
      numChunks: flashLoanChunks,
      maxSlippageBps: Math.round(limitSlippage * 100), // Use limit slippage for limit orders
      isKindBuy: false, // SELL order: exact sellAmount, min buyAmount
    });
  }, [collateral, debt, limitPriceTriggerAddress, userAddress, flashLoanAmountRaw, minCollateralOut.raw, protocolName, market, flashLoanChunks, limitSlippage]);

  // Build conditional order instructions for the new system
  const buildConditionalOrderInstructionsData = useMemo((): ConditionalOrderInstructions => {
    if (!collateral || !debt || !userAddress || flashLoanAmountRaw === 0n || !conditionalOrderManagerAddress) {
      return { preInstructions: [], postInstructions: [] };
    }

    // For leverage-up, we use the buildCowChunkInstructions helper but need to adapt it
    // The new system expects a single instructions object per order, not an array
    const chunks = buildCowChunkInstructions({
      collateral,
      debt,
      userAddress,
      flashLoanAmountRaw,
      marginAmountRaw,
      protocolName,
      morphoContext,
      market,
      orderManagerAddress: conditionalOrderManagerAddress,
      chunkParams,
      chainId,
    });

    // Return the first chunk's instructions (for single-iteration orders)
    return chunks[0] || { preInstructions: [], postInstructions: [] };
  }, [collateral, debt, userAddress, flashLoanAmountRaw, marginAmountRaw, protocolName, morphoContext, market, conditionalOrderManagerAddress, chunkParams, chainId]);

  // ==================== Transaction Flow Hook ====================

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen, chainId, onClose, buildFlow, successMessage: "Loop position opened!",
    emptyFlowErrorMessage: "Unable to build loop instructions", simulateWhenBatching: false,
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

  // ==================== Memoized Event Handlers ====================

  const handleSetMaxMargin = useCallback(() => {
    if (depositToken) {
      setMarginAmount(formatUnits(walletBalance, depositDecimals));
    }
  }, [depositToken, walletBalance, depositDecimals]);

  const handleMarginChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMarginAmount(e.target.value);
  }, []);

  const handleLeverageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLeverageInput(e.target.value);
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) updateLeverage(val);
  }, [updateLeverage]);

  const handleLeverageInputBlur = useCallback(() => {
    setLeverageInput(leverage.toFixed(2));
  }, [leverage]);

  const handleLeverageSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateLeverage(parseFloat(e.target.value));
  }, [updateLeverage]);

  const handleSetExecutionMarket = useCallback(() => setExecutionType("market"), []);
  const handleSetExecutionLimit = useCallback(() => setExecutionType("limit"), []);

  const handleZapModeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setZapMode(e.target.checked), []);
  const handleSwapRouterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => setSwapRouter(e.target.value as SwapRouter), []);
  const handleSlippageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => setSlippage(parseFloat(e.target.value)), []);

  const handleFlashLoanProviderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = providerOptions.find(provider => provider.name === e.target.value);
    if (p) setSelectedProvider(p);
  }, [providerOptions, setSelectedProvider]);

  const handleToggleBatching = useCallback(() => setPreferBatching(!preferBatching), [setPreferBatching, preferBatching]);

  const handleSelectDebt = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const address = e.currentTarget.dataset.address;
    const d = debtWithWalletBalance.find(debtItem => debtItem.address === address);
    if (d) setDebt(d);
  }, [debtWithWalletBalance]);

  const handleSelectCollateral = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const address = e.currentTarget.dataset.address;
    const c = collateralsWithWalletBalance.find(col => col.address === address);
    if (c) setCollateral(c);
  }, [collateralsWithWalletBalance]);

  // ==================== Submit Handler ====================

  const handleSubmit = useCallback(async () => {
    try {
      setIsSubmitting(true);

      if (executionType === "limit") {
        await handleLimitOrderSubmitRef.current();
      } else {
        await handleMarketOrderSubmitRef.current();
      }
    } catch (e) {
      const status = executionType === "limit" ? "multiply_limit_order_complete" : "multiply_tx_complete";
      track(status, { status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }, [executionType]);

  // ==================== Limit Order Submit Logic ====================

  const handleLimitOrderSubmit = async () => {
    track("multiply_limit_order_begin", {
      protocol: protocolName, chainId,
      collateral: collateral?.symbol ?? "unknown",
      debt: debt?.symbol ?? "unknown",
      marginAmount, leverage
    });

    if (!collateral || !debt || !userAddress || !conditionalOrderManagerAddress || !walletClient || !publicClient) {
      throw new Error("Missing required data for conditional order");
    }
    if (!limitPriceTriggerAddress || !conditionalOrderTriggerParams) {
      console.error("[Conditional Order] Missing config:", {
        limitPriceTriggerAddress,
        conditionalOrderTriggerParams: !!conditionalOrderTriggerParams,
        flashLoanAmountRaw: flashLoanAmountRaw.toString(),
        minCollateralOut: minCollateralOut.raw.toString(),
      });
      throw new Error(`Missing trigger configuration: ${!limitPriceTriggerAddress ? "trigger not deployed" : "params not ready (check amounts)"}`);
    }

    const isFlashLoanMode = chunkParams.useFlashLoan === true;

    console.log("[Conditional Order] Building order:", {
      sellToken: debt.address,
      buyToken: collateral.address,
      sellAmount: formatUnits(flashLoanAmountRaw / BigInt(flashLoanChunks), debt.decimals),
      buyAmount: formatUnits(minCollateralOut.raw / BigInt(flashLoanChunks), collateral.decimals),
      numChunks: flashLoanChunks,
      isFlashLoanMode,
    });

    try {
      const result = await buildConditionalOrderCalls({
        triggerAddress: limitPriceTriggerAddress,
        triggerStaticData: conditionalOrderTriggerParams,
        sellToken: debt.address as Address,
        buyToken: collateral.address as Address,
        preInstructions: buildConditionalOrderInstructionsData.preInstructions,
        postInstructions: buildConditionalOrderInstructionsData.postInstructions,
        maxIterations: flashLoanChunks,
        flashLoan: isFlashLoanMode && chunkParams.flashLoanLender ? {
          lender: chunkParams.flashLoanLender as Address,
          token: debt.address as Address,
          amount: chunkParams.chunkSize,
        } : undefined,
        sellTokenRefundAddress: isFlashLoanMode && chunkParams.flashLoanLender ? getKapanCowAdapter(chainId) as Address : userAddress,
        operationType: "leverage-up",
        protocolName,
        isKindBuy: false, // SELL order: exact sellAmount, min buyAmount
      });

      if (!result || !result.success) {
        const errorMsg = result?.error || "Failed to build conditional order calls";
        notification.error(<TransactionToast step="failed" message={`CoW API Error: ${errorMsg}`} />);
        throw new Error(errorMsg);
      }

      // Save order note
      if (result.salt) {
        saveLimitOrderNote(result.salt, debt.symbol, collateral.symbol);
      }

      const notificationId = notification.loading(
        <TransactionToast step="pending" message={`Creating conditional order (${result.calls.length} operations)...`} />
      );

      const receipts: TransactionReceipt[] = [];
      for (let i = 0; i < result.calls.length; i++) {
        const call = result.calls[i];
        notification.remove(notificationId as string);

        const stepNotificationId = notification.loading(
          <TransactionToast step="pending" message={`Executing step ${i + 1}/${result.calls.length}...`} />
        );

        const txHash = await walletClient.sendTransaction({
          account: userAddress,
          to: call.to,
          data: call.data,
          chain: null,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        receipts.push(receipt);
        notification.remove(stepNotificationId as string);
      }

      const explorerUrl = getCowExplorerAddressUrl(chainId, conditionalOrderManagerAddress);
      notification.success(
        <TransactionToast
          step="confirmed"
          message="Conditional order created!"
          blockExplorerLink={explorerUrl}
        />
      );

      const orderHash = extractOrderHash(receipts, conditionalOrderManagerAddress) ?? undefined;

      // Save order to database
      if (result.salt && debt && collateral && userAddress) {
        saveOrder.mutate({
          orderUid: result.salt,
          orderHash,
          salt: result.salt,
          userAddress,
          chainId,
          orderType: "leverage_up",
          protocol: protocolName,
          sellToken: debt.address,
          buyToken: collateral.address,
          sellTokenSymbol: debt.symbol,
          buyTokenSymbol: collateral.symbol,
          sellAmount: flashLoanAmountRaw.toString(),
          buyAmount: minCollateralOut.raw.toString(),
        });

        if (orderHash && flashLoanAmountRaw > 0n && minCollateralOut.raw > 0n) {
          const quoteRate = Number(flashLoanAmountRaw) / Number(minCollateralOut.raw);
          storeOrderQuoteRate(chainId, orderHash, quoteRate);
        }
      }

      track("multiply_limit_order_complete", { status: "submitted", mode: "conditional" });
      onClose();
    } catch (e) {
      track("multiply_limit_order_complete", {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  };

  // ==================== Helper Functions for Limit Order ====================

  const saveLimitOrderNote = (salt: string, debtSymbol: string, collateralSymbol: string) => {
    if (salt) {
      saveOrderNote(createLeverageUpNote(salt, protocolName, debtSymbol, collateralSymbol, chainId));
    }
  };

  // ==================== Market Order Submit Logic ====================

  const handleMarketOrderSubmit = async () => {
    // Use ref to get latest quote values for logging (same ref used in buildFlow)
    const { oneInchQuote: currentOneInchQuote, pendleQuote: currentPendleQuote, activeAdapter: currentActiveAdapter, pendleAdapter: currentPendleAdapter } = quotesRef.current;
    console.log("[handleMarketOrderSubmit] State at submit (from ref):", {
      swapRouter,
      hasOneInchQuote: !!currentOneInchQuote,
      hasActiveAdapter: !!currentActiveAdapter,
      hasPendleQuote: !!currentPendleQuote,
      hasPendleAdapter: !!currentPendleAdapter,
      flashLoanAmountRaw: flashLoanAmountRaw.toString(),
      collateral: collateral?.symbol,
      debt: debt?.symbol,
    });
    track("multiply_tx_begin", {
      protocol: protocolName, chainId,
      collateral: collateral?.symbol ?? "unknown",
      debt: debt?.symbol ?? "unknown",
      marginAmount, leverage,
      flashLoanProvider: selectedProvider?.name ?? "unknown",
      swapRouter
    });
    await handleConfirm(marginAmount);
    track("multiply_tx_complete", { status: "success" });
  };

  // Update refs to always have latest handlers (fixes stale closure in handleSubmit)
  handleLimitOrderSubmitRef.current = handleLimitOrderSubmit;
  handleMarketOrderSubmitRef.current = handleMarketOrderSubmit;

  // ==================== Derived State for UI ====================

  const hasQuote = swapRouter === "pendle" ? !!pendleQuote : !!oneInchQuote;
  const hasAdapter = swapRouter === "kyber" ? !!kyberAdapter : swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;

  const canSubmitMarket = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && hasQuote && hasAdapter && !isSwapQuoteLoading;
  const canSubmitLimit = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && conditionalOrderReady && !!conditionalOrderTriggerParams;
  const canSubmit = executionType === "limit" ? canSubmitLimit : canSubmitMarket;

  const isSubmittingAny = isSubmitting || isCowCreating;
  const marginUsd = depositToken && marginAmount
    ? Number(marginAmount) * Number(formatUnits(depositToken.price ?? 0n, 8))
    : 0;
  const walletBalanceFormatted = depositToken ? Number(formatUnits(walletBalance, depositDecimals)) : 0;
  const collateralPrice = collateral ? Number(formatUnits(collateral.price ?? 0n, 8)) : 0;
  const shortAmount = debt ? Number(formatUnits(flashLoanAmountRaw, debt.decimals)) : 0;
  const debtPrice = debt ? Number(formatUnits(debt.price ?? 0n, 8)) : 0;

  // ==================== Fee Breakdown ====================

  const fees = useMemo(() =>
    calculateFeeBreakdown(
      shortAmount,
      debtPrice,
      selectedProvider?.name,
      swapRouter,
      pendleQuote?.data?.priceImpact,
      metrics.totalCollateralUsd
    ),
    [shortAmount, debtPrice, selectedProvider, swapRouter, pendleQuote, metrics.totalCollateralUsd]
  );

  const ticks = useMemo(() => [1, (1 + maxLeverage) / 2, maxLeverage], [maxLeverage]);

  // ==================== Render ====================

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-box bg-base-100 border-base-300/30 relative max-w-2xl rounded-2xl border p-0">
        {/* Header */}
        <div className="border-base-300/30 flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold">Loop Position</h3>
          <div className="flex items-center gap-3">
            <span className="text-base-content/50 text-sm">{protocolName}</span>
            <button className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content" onClick={onClose}>x</button>
          </div>
        </div>

        <div className="p-5">
          {/* Two Column Layout: Collateral | Borrow */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            {/* Deposit section */}
            <DepositSection
              zapMode={zapMode}
              disableAssetSelection={disableAssetSelection}
              debt={debt}
              collateral={collateral}
              marginAmount={marginAmount}
              handleMarginChange={handleMarginChange}
              handleSetMaxMargin={handleSetMaxMargin}
              walletBalanceFormatted={walletBalanceFormatted}
              marginUsd={marginUsd}
              metrics={metrics}
              debtWithWalletBalance={debtWithWalletBalance}
              collateralsWithWalletBalance={collateralsWithWalletBalance}
              handleSelectDebt={handleSelectDebt}
              handleSelectCollateral={handleSelectCollateral}
            />

            {/* Borrow section */}
            <BorrowSection
              debt={debt}
              shortAmount={shortAmount}
              disableAssetSelection={disableAssetSelection}
              debtWithWalletBalance={debtWithWalletBalance}
              handleSelectDebt={handleSelectDebt}
              metrics={metrics}
            />
          </div>

          {/* Multiplier Slider */}
          <LeverageSection
            leverage={leverage}
            leverageInput={leverageInput}
            maxLeverage={maxLeverage}
            ticks={ticks}
            handleLeverageInputChange={handleLeverageInputChange}
            handleLeverageInputBlur={handleLeverageInputBlur}
            handleLeverageSliderChange={handleLeverageSliderChange}
            cowAvailable={cowAvailable}
            executionType={executionType}
            handleSetExecutionMarket={handleSetExecutionMarket}
            handleSetExecutionLimit={handleSetExecutionLimit}
            cowContractAvailable={cowContractAvailable}
            debt={debt}
            collateral={collateral}
            marketRate={marketRate}
            customMinPrice={customMinPrice}
            setCustomMinPrice={setCustomMinPrice}
            priceInputInverted={priceInputInverted}
            setPriceInputInverted={setPriceInputInverted}
            chunkParams={chunkParams}
            chunksInput={chunksInput}
            setChunksInput={setChunksInput}
            zapMode={zapMode}
            handleZapModeChange={handleZapModeChange}
            swapRouter={swapRouter}
            handleSwapRouterChange={handleSwapRouterChange}
            oneInchAvailable={oneInchAvailable}
            pendleAvailable={pendleAvailable}
            slippage={slippage}
            handleSlippageChange={handleSlippageChange}
            selectedProvider={selectedProvider}
            handleFlashLoanProviderChange={handleFlashLoanProviderChange}
            providerOptions={providerOptions}
            liquidityData={liquidityData}
          />

          {/* Metrics */}
          <MetricsDisplay
            metrics={metrics}
            effectiveLltvBps={effectiveLltvBps}
            collateral={collateral}
            debt={debt}
            collateralPrice={collateralPrice}
            netApy={netApy}
            netYield30d={netYield30d}
          />

          {/* Details */}
          <DetailsSection
            executionType={executionType}
            isSwapQuoteLoading={isSwapQuoteLoading}
            flashLoanAmountRaw={flashLoanAmountRaw}
            shortAmount={shortAmount}
            minCollateralOut={minCollateralOut}
            fees={fees}
            collateral={collateral}
            debt={debt}
            supplyApyMap={supplyApyMap}
            borrowApyMap={borrowApyMap}
            metrics={metrics}
            leverage={leverage}
          />

          {/* Actions */}
          <ActionsSection
            executionType={executionType}
            preferBatching={preferBatching}
            handleToggleBatching={handleToggleBatching}
            canSubmit={canSubmit}
            isSubmittingAny={isSubmittingAny}
            isSwapQuoteLoading={isSwapQuoteLoading}
            handleSubmit={handleSubmit}
          />
        </div>
      </div>
    </dialog>
  );
};

// ==================== Sub-Components ====================

interface DepositSectionProps {
  zapMode: boolean;
  disableAssetSelection: boolean;
  debt: SwapAsset | undefined;
  collateral: SwapAsset | undefined;
  marginAmount: string;
  handleMarginChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSetMaxMargin: () => void;
  walletBalanceFormatted: number;
  marginUsd: number;
  metrics: { totalCollateralTokens: number; totalCollateralUsd: number };
  debtWithWalletBalance: (SwapAsset & { walletBalance: bigint })[];
  collateralsWithWalletBalance: (SwapAsset & { walletBalance: bigint })[];
  handleSelectDebt: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  handleSelectCollateral: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

const DepositSection: FC<DepositSectionProps> = ({
  zapMode, disableAssetSelection, debt, collateral, marginAmount, handleMarginChange,
  handleSetMaxMargin, walletBalanceFormatted, marginUsd, metrics,
  debtWithWalletBalance, collateralsWithWalletBalance, handleSelectDebt, handleSelectCollateral,
}) => (
  <div className="bg-base-200/40 border-base-300/20 rounded-xl border p-4">
    <div className="text-base-content/60 mb-2 flex items-center justify-between text-sm">
      <span>Deposit</span>
      <button className="hover:text-primary text-xs transition-colors" onClick={handleSetMaxMargin}>
        Bal: {walletBalanceFormatted.toFixed(2)}
      </button>
    </div>
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={marginAmount}
        onChange={handleMarginChange}
        placeholder="0"
        className="placeholder:text-base-content/30 min-w-0 flex-1 bg-transparent text-xl font-medium outline-none"
      />
      {zapMode ? (
        <TokenSelector
          token={debt}
          disabled={disableAssetSelection}
          options={debtWithWalletBalance}
          onSelect={handleSelectDebt}
          bgClass="bg-primary/10"
          hoverClass="hover:bg-primary/20"
        />
      ) : (
        <TokenSelector
          token={collateral}
          disabled={disableAssetSelection}
          options={collateralsWithWalletBalance}
          onSelect={handleSelectCollateral}
          bgClass="bg-primary/10"
          hoverClass="hover:bg-primary/20"
        />
      )}
    </div>
    {zapMode && (
      <div className="border-base-300/30 mt-2 flex items-center justify-between border-t pt-2">
        <div className="text-base-content/60 flex items-center gap-1.5 text-xs">
          <span>arrow-down swap to</span>
        </div>
        <TokenSelector
          token={collateral}
          disabled={disableAssetSelection}
          options={collateralsWithWalletBalance}
          onSelect={handleSelectCollateral}
          bgClass="bg-success/10"
          hoverClass="hover:bg-success/20"
          small
        />
      </div>
    )}
    <div className="border-base-300/30 mt-2 flex items-center justify-between border-t pt-2">
      <span className="text-base-content/50 text-xs">approx ${marginUsd.toFixed(2)}</span>
      <div className="flex items-center gap-1.5 text-xs">
        <ArrowRightIcon className="text-base-content/40 size-3" />
        <span className="text-success font-medium">{metrics.totalCollateralTokens.toFixed(4)} {collateral?.symbol}</span>
        <span className="text-base-content/50">(${metrics.totalCollateralUsd.toFixed(2)})</span>
      </div>
    </div>
  </div>
);

interface TokenSelectorProps {
  token: SwapAsset | undefined;
  disabled: boolean;
  options: (SwapAsset & { walletBalance: bigint })[];
  onSelect: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  bgClass: string;
  hoverClass: string;
  small?: boolean;
}

const TokenSelector: FC<TokenSelectorProps> = ({ token, disabled, options, onSelect, bgClass, hoverClass, small }) => {
  if (disabled) {
    return (
      <div className={`${bgClass} flex items-center gap-1.5 rounded-lg px-2 py-1`}>
        {token && <Image src={token.icon} alt="" width={small ? 14 : 16} height={small ? 14 : 16} className="rounded-full" />}
        <span className="text-xs font-medium">{token?.symbol || "?"}</span>
      </div>
    );
  }

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className={`btn btn-xs ${bgClass} ${hoverClass} gap-1.5 rounded-lg border-0 px-2`}>
        {token && <Image src={token.icon} alt="" width={small ? 14 : 16} height={small ? 14 : 16} className="rounded-full" />}
        <span className="text-xs font-medium">{token?.symbol || "?"}</span>
        <svg className="size-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </label>
      <ul tabIndex={0} className="dropdown-content menu bg-base-100 border-base-300/30 z-50 mt-2 w-52 rounded-xl border p-2 shadow-xl">
        {options.map(opt => {
          const bal = Number(formatUnits(opt.walletBalance, opt.decimals));
          return (
            <li key={opt.address}>
              <a data-address={opt.address} onClick={onSelect} className={`flex items-center justify-between text-sm ${token?.address === opt.address ? "active" : ""}`}>
                <div className="flex items-center gap-2">
                  <Image src={opt.icon} alt="" width={18} height={18} className="rounded-full" />
                  {opt.symbol}
                </div>
                <span className="text-base-content/50 text-xs">{bal > 0 ? bal.toFixed(4) : "-"}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

interface BorrowSectionProps {
  debt: SwapAsset | undefined;
  shortAmount: number;
  disableAssetSelection: boolean;
  debtWithWalletBalance: (SwapAsset & { walletBalance: bigint })[];
  handleSelectDebt: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  metrics: { debtUsd: number };
}

const BorrowSection: FC<BorrowSectionProps> = ({
  debt, shortAmount, disableAssetSelection, debtWithWalletBalance, handleSelectDebt, metrics,
}) => (
  <div className="bg-base-200/40 border-base-300/20 rounded-xl border p-4">
    <div className="text-base-content/60 mb-2 text-sm">Borrow</div>
    <div className="flex items-center gap-2">
      <div className="text-error flex-1 truncate text-xl font-medium">
        {shortAmount > 0 ? shortAmount.toFixed(4) : "0"}
      </div>
      <TokenSelector
        token={debt}
        disabled={disableAssetSelection}
        options={debtWithWalletBalance}
        onSelect={handleSelectDebt}
        bgClass="bg-base-300/30"
        hoverClass="hover:bg-base-300/50"
      />
    </div>
    <div className="text-base-content/50 border-base-300/30 mt-2 border-t pt-2 text-xs">approx ${metrics.debtUsd.toFixed(2)}</div>
  </div>
);

interface LeverageSectionProps {
  leverage: number;
  leverageInput: string;
  maxLeverage: number;
  ticks: number[];
  handleLeverageInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLeverageInputBlur: () => void;
  handleLeverageSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  cowAvailable: boolean;
  executionType: "market" | "limit";
  handleSetExecutionMarket: () => void;
  handleSetExecutionLimit: () => void;
  cowContractAvailable: boolean;
  debt: SwapAsset | undefined;
  collateral: SwapAsset | undefined;
  marketRate: { raw: bigint; formatted: string } | null;
  customMinPrice: string;
  setCustomMinPrice: (v: string) => void;
  priceInputInverted: boolean;
  setPriceInputInverted: (v: boolean) => void;
  chunkParams: ChunkParamsResult;
  chunksInput: string;
  setChunksInput: (v: string) => void;
  zapMode: boolean;
  handleZapModeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  swapRouter: SwapRouter;
  handleSwapRouterChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  oneInchAvailable: boolean;
  pendleAvailable: boolean;
  slippage: number;
  handleSlippageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  selectedProvider: { name: string; providerEnum: FlashLoanProvider } | null | undefined;
  handleFlashLoanProviderChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  providerOptions: { name: string; providerEnum: FlashLoanProvider }[];
  liquidityData: { provider: number; hasLiquidity: boolean }[];
}

const LeverageSection: FC<LeverageSectionProps> = (props) => {
  const {
    leverage, leverageInput, maxLeverage, ticks, handleLeverageInputChange, handleLeverageInputBlur,
    handleLeverageSliderChange, cowAvailable, executionType, handleSetExecutionMarket, handleSetExecutionLimit,
    cowContractAvailable,
    debt, collateral, marketRate,
    customMinPrice, setCustomMinPrice, priceInputInverted, setPriceInputInverted,
    chunkParams, chunksInput, setChunksInput,
    zapMode, handleZapModeChange, swapRouter,
    handleSwapRouterChange, oneInchAvailable, pendleAvailable, slippage, handleSlippageChange,
    selectedProvider, handleFlashLoanProviderChange, providerOptions, liquidityData,
  } = props;

  return (
    <div className="bg-base-200/40 border-base-300/20 mb-4 rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Leverage</span>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={leverageInput}
            onChange={handleLeverageInputChange}
            onBlur={handleLeverageInputBlur}
            className="bg-base-300/50 w-14 rounded-lg px-2 py-1 text-right text-sm font-medium outline-none"
          />
          <span className="text-base-content/50 text-sm">x</span>
        </div>
      </div>
      <input
        type="range" min="1" max={maxLeverage} step="0.01" value={leverage}
        onChange={handleLeverageSliderChange}
        className="range range-primary range-sm w-full"
      />
      <div className="text-base-content/40 mt-1.5 flex justify-between text-xs">
        {ticks.map((t, i) => (
          <span key={i}>{i === ticks.length - 1 ? `Max ${t.toFixed(1)}x` : `${t.toFixed(1)}x`}</span>
        ))}
      </div>

      {/* Execution Type Toggle */}
      {cowAvailable && (
        <div className="border-base-300/30 mt-4 flex items-center gap-2 border-t pt-3">
          <button
            onClick={handleSetExecutionMarket}
            className={`btn btn-xs flex-1 ${executionType === "market" ? "btn-primary" : "btn-ghost"}`}
          >
            <span className="mr-1">zap</span> Market
          </button>
          <button
            onClick={handleSetExecutionLimit}
            className={`btn btn-xs flex-1 ${executionType === "limit" ? "btn-primary" : "btn-ghost"}`}
            disabled={!cowContractAvailable}
            title={
              !cowContractAvailable
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
        <LimitOrderPricingSection
          debt={debt}
          collateral={collateral}
          marketRate={marketRate}
          customMinPrice={customMinPrice}
          setCustomMinPrice={setCustomMinPrice}
          priceInputInverted={priceInputInverted}
          setPriceInputInverted={setPriceInputInverted}
          chunkParams={chunkParams}
          chunksInput={chunksInput}
          setChunksInput={setChunksInput}
        />
      )}

      {/* Config Grid */}
      <div className={`grid grid-cols-2 gap-x-4 gap-y-2 ${executionType === "limit" && cowAvailable ? "mt-3" : "border-base-300/30 mt-4 border-t pt-3"} text-xs`}>
        {executionType === "market" && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Zap Mode</span>
              <input type="checkbox" checked={zapMode} onChange={handleZapModeChange} className="toggle toggle-primary toggle-xs" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Swap Router</span>
              {oneInchAvailable && pendleAvailable ? (
                <select value={swapRouter} onChange={handleSwapRouterChange} className="select select-xs bg-base-300/50 h-6 min-h-0 border-0 pr-6 text-xs">
                  {SWAP_ROUTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              ) : (
                <span className="font-medium">{swapRouter === "pendle" ? "Pendle" : "1inch"}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Slippage</span>
              <select value={slippage} onChange={handleSlippageChange} className="select select-xs bg-base-300/50 h-6 min-h-0 border-0 pr-6 text-xs">
                {SLIPPAGE_OPTIONS.map(s => <option key={s} value={s}>{s}%</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base-content/60">Flash Loan</span>
              <select value={selectedProvider?.name || ""} onChange={handleFlashLoanProviderChange} className="select select-xs bg-base-300/50 h-6 min-h-0 border-0 pr-6 text-xs">
                {providerOptions.map(p => {
                  const liq = liquidityData.find(l => l.provider === p.providerEnum);
                  const hasLiquidity = liq?.hasLiquidity ?? true;
                  return <option key={p.name} value={p.name}>{p.name} {liq && (hasLiquidity ? "check" : "warning")}</option>;
                })}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface LimitOrderPricingSectionProps {
  debt: SwapAsset | undefined;
  collateral: SwapAsset | undefined;
  marketRate: { raw: bigint; formatted: string } | null;
  customMinPrice: string;
  setCustomMinPrice: (v: string) => void;
  priceInputInverted: boolean;
  setPriceInputInverted: (v: boolean) => void;
  chunkParams: ChunkParamsResult;
  chunksInput: string;
  setChunksInput: (v: string) => void;
}

const LimitOrderPricingSection: FC<LimitOrderPricingSectionProps> = (props) => {
  const {
    debt, collateral, marketRate,
    customMinPrice, setCustomMinPrice, priceInputInverted, setPriceInputInverted,
    chunkParams, chunksInput, setChunksInput,
  } = props;

  // Calculate inverted market rate for display
  const invertedMarketRate = useMemo(() => {
    if (!marketRate || !collateral || !debt) return null;
    const rate = Number(marketRate.formatted);
    if (rate === 0) return null;
    return 1 / rate;
  }, [marketRate, collateral, debt]);

  // Format price with appropriate precision (preserve significant digits)
  const formatPrice = (value: number, decimals: number): string => {
    if (value === 0) return "0";
    const precision = Math.min(decimals, 18);
    const magnitude = Math.floor(Math.log10(Math.abs(value)));
    const displayDecimals = Math.max(2, Math.min(precision, 6 - magnitude));
    return value.toFixed(Math.max(0, displayDecimals));
  };

  // Get the current display value and market rate based on inversion mode
  const { displayValue, displayMarketRate, leftToken, rightToken, displayDecimals } = useMemo(() => {
    if (!collateral || !debt) {
      return { displayValue: "0", displayMarketRate: "0", leftToken: "?", rightToken: "?", displayDecimals: 18 };
    }
    if (priceInputInverted) {
      // "1 COLL = X DEBT"
      return {
        displayValue: customMinPrice || (invertedMarketRate ? formatPrice(invertedMarketRate, debt.decimals) : "0"),
        displayMarketRate: invertedMarketRate ? formatPrice(invertedMarketRate, debt.decimals) : "0",
        leftToken: collateral.symbol,
        rightToken: debt.symbol,
        displayDecimals: debt.decimals,
      };
    } else {
      // "1 DEBT = X COLL"
      return {
        displayValue: customMinPrice || marketRate?.formatted || "0",
        displayMarketRate: marketRate?.formatted || "0",
        leftToken: debt.symbol,
        rightToken: collateral.symbol,
        displayDecimals: collateral.decimals,
      };
    }
  }, [collateral, debt, priceInputInverted, customMinPrice, marketRate, invertedMarketRate]);

  // Adjust rate by percentage
  const adjustByPercent = (delta: number) => {
    const currentRate = parseFloat(displayValue) || parseFloat(displayMarketRate);
    if (!currentRate || currentRate === 0) return;
    const newRate = currentRate * (1 + delta / 100);
    setCustomMinPrice(formatPrice(newRate, displayDecimals));
  };

  // Reset to market rate
  const resetToMarket = () => {
    setCustomMinPrice(displayMarketRate);
  };

  // Toggle price direction and convert the current value
  const toggleDirection = () => {
    if (!customMinPrice || customMinPrice === "") {
      // No custom price set, just toggle
      setPriceInputInverted(!priceInputInverted);
      return;
    }
    // Convert the current value to the new direction
    const currentValue = parseFloat(customMinPrice);
    if (currentValue > 0) {
      const newDecimals = priceInputInverted ? (collateral?.decimals ?? 18) : (debt?.decimals ?? 18);
      setCustomMinPrice(formatPrice(1 / currentValue, newDecimals));
    }
    setPriceInputInverted(!priceInputInverted);
  };

  return (
    <div className="bg-base-200/60 border-base-300/30 mt-2 space-y-1 rounded border p-1.5 text-xs">
      {/* Row 1: Order type + Flash loan + Chunks */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-primary text-[10px] font-medium">Sell Order</span>
        {chunkParams.useFlashLoan && (
          <span className="text-base-content/50 text-[10px]">Morpho FL</span>
        )}
        <div className="flex items-center gap-1">
          <span className="text-base-content/50 text-[10px]">Chunks:</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="border-base-300 bg-base-100 text-base-content w-8 rounded border px-1 py-0 text-center text-[10px] font-medium"
            value={chunksInput}
            onChange={(e) => setChunksInput(e.target.value)}
            onBlur={() => {
              const parsed = parseInt(chunksInput) || 1;
              setChunksInput(String(Math.max(1, Math.min(100, parsed))));
            }}
          />
        </div>
      </div>

      {/* Row 2: Limit Price Input with toggle */}
      {collateral && debt && (
        <>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleDirection}
              className="text-base-content/50 hover:text-primary shrink-0 text-[10px] transition-colors"
              title="Click to swap price direction"
            >
              1 {leftToken} =
            </button>
            <input
              type="text"
              inputMode="decimal"
              className="border-base-300 bg-base-100 text-base-content min-w-0 flex-1 rounded border px-1 py-0 text-[10px] font-medium"
              value={displayValue}
              onChange={(e) => setCustomMinPrice(e.target.value)}
              placeholder={displayMarketRate}
            />
            <button
              onClick={toggleDirection}
              className="text-base-content/50 hover:text-primary shrink-0 text-[10px] transition-colors"
              title="Click to swap price direction"
            >
              {rightToken}
            </button>
          </div>

          {/* Row 3: Price Adjustment Buttons */}
          <div className="flex items-center justify-center gap-0.5">
            {[-1, -0.5].map(delta => (
              <button
                key={delta}
                onClick={() => adjustByPercent(delta)}
                className="bg-base-300/50 hover:bg-base-300 rounded px-1 py-0 text-[9px]"
              >
                {delta}%
              </button>
            ))}
            <button
              onClick={resetToMarket}
              className="bg-primary/20 text-primary hover:bg-primary/30 rounded px-1 py-0 text-[9px] font-medium"
            >
              Mkt
            </button>
            {[0.5, 1].map(delta => (
              <button
                key={delta}
                onClick={() => adjustByPercent(delta)}
                className="bg-base-300/50 hover:bg-base-300 rounded px-1 py-0 text-[9px]"
              >
                +{delta}%
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

interface MetricsDisplayProps {
  metrics: { ltv: number; totalCollateralUsd: number; debtUsd: number };
  effectiveLltvBps: bigint;
  collateral: SwapAsset | undefined;
  debt: SwapAsset | undefined;
  collateralPrice: number;
  netApy: number | null;
  netYield30d: number | null;
}

const MetricsDisplay: FC<MetricsDisplayProps> = ({
  metrics, effectiveLltvBps, collateral, debt, collateralPrice, netApy, netYield30d,
}) => {
  const debtPriceFormatted = debt ? Number(formatUnits(debt.price ?? 0n, 8)).toFixed(2) : "-";
  const debtPriceDisplay = debt ? `$${debtPriceFormatted}` : "-";

  return (
    <div className="bg-base-200/40 border-base-300/20 mb-3 flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
      <div className="flex-1 text-center">
        <div className="text-base-content/50 mb-0.5">LTV</div>
        <div className="font-medium">{formatLtvDisplay(metrics.ltv)} / {formatBps(effectiveLltvBps)}%</div>
      </div>
      <div className="bg-base-300/50 h-6 w-px" />
      <div className="flex-1 text-center">
        <div className="text-base-content/50 mb-0.5">{collateral?.symbol}</div>
        <div className="font-medium">{formatPriceDisplay(collateralPrice)}</div>
      </div>
      <div className="bg-base-300/50 h-6 w-px" />
      <div className="flex-1 text-center">
        <div className="text-base-content/50 mb-0.5">{debt?.symbol}</div>
        <div className="font-medium">{debtPriceDisplay}</div>
      </div>
      <div className="bg-base-300/50 h-6 w-px" />
      <div className="flex-1 text-center">
        <div className="text-base-content/50 mb-0.5">Net APY</div>
        <div className={`font-medium ${getApyColorClass(netApy)}`}>
          {formatApyDisplay(netApy)}
        </div>
      </div>
      <div className="bg-base-300/50 h-6 w-px" />
      <div className="flex-1 text-center">
        <div className="text-base-content/50 mb-0.5">30D Yield</div>
        <div className={`font-medium ${getApyColorClass(netYield30d)}`}>
          {formatYield30dDisplay(netYield30d)}
        </div>
      </div>
    </div>
  );
};

interface DetailsSectionProps {
  executionType: "market" | "limit";
  isSwapQuoteLoading: boolean;
  flashLoanAmountRaw: bigint;
  shortAmount: number;
  minCollateralOut: { formatted: string };
  fees: { totalFeeUsd: number; feeOfPositionPercent: number; totalFeePercent: number; flashLoanFeePercent: number; priceImpactPercent: number };
  collateral: SwapAsset | undefined;
  debt: SwapAsset | undefined;
  supplyApyMap: Record<string, number>;
  borrowApyMap: Record<string, number>;
  metrics: { totalCollateralUsd: number };
  leverage: number;
}

const DetailsSection: FC<DetailsSectionProps> = ({
  executionType, isSwapQuoteLoading, flashLoanAmountRaw, shortAmount, minCollateralOut, fees,
  collateral, debt, supplyApyMap, borrowApyMap, metrics, leverage,
}) => (
  <div className="bg-base-200/40 border-base-300/20 mb-3 rounded-lg border p-2.5 text-xs">
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      <div className="flex justify-between">
        <span className="text-base-content/50">Swap</span>
        <span className="ml-2 truncate text-right">
          {executionType === "market" && isSwapQuoteLoading ? (
            <span className="loading loading-dots loading-xs" />
          ) : flashLoanAmountRaw > 0n ? (
            <span className="flex items-center gap-1">{shortAmount.toFixed(2)} <ArrowRightIcon className="inline size-3" /> {Number(minCollateralOut.formatted).toFixed(2)}</span>
          ) : "-"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-base-content/50">{executionType === "limit" ? "Order Fee" : "Loop Fee"}</span>
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
    {executionType === "market" && fees.totalFeeUsd > 0 && (
      <div className="border-base-300/30 text-base-content/40 mt-1.5 border-t pt-1.5 text-[10px]">
        <span>FL: {fees.flashLoanFeePercent > 0 ? `${fees.flashLoanFeePercent}%` : "free"}</span>
        {fees.priceImpactPercent > 0.001 && <span className="ml-2">Impact: {fees.priceImpactPercent.toFixed(3)}%</span>}
      </div>
    )}
    {executionType === "limit" && (
      <div className="border-base-300/30 text-base-content/40 mt-1.5 border-t pt-1.5 text-[10px]">
        <span>CoW solver fee included in price - MEV protected</span>
      </div>
    )}
    <div className="border-base-300/30 mt-1.5 flex justify-between border-t pt-1.5">
      <span className="text-base-content/50">Total Position</span>
      <span className="font-medium">${metrics.totalCollateralUsd.toFixed(2)} ({leverage.toFixed(2)}x)</span>
    </div>
  </div>
);

interface ActionsSectionProps {
  executionType: "market" | "limit";
  preferBatching: boolean;
  handleToggleBatching: () => void;
  canSubmit: boolean;
  isSubmittingAny: boolean;
  isSwapQuoteLoading: boolean;
  handleSubmit: () => void;
}

const ActionsSection: FC<ActionsSectionProps> = ({
  executionType, preferBatching, handleToggleBatching, canSubmit, isSubmittingAny, isSwapQuoteLoading, handleSubmit,
}) => (
  <div className="flex items-center justify-between pt-1">
    {executionType === "market" ? (
      <button
        type="button"
        onClick={handleToggleBatching}
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
);

export default MultiplyEvmModal;
