import { FC, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { track } from "@vercel/analytics";
import Image from "next/image";
import { Address, formatUnits, parseUnits, type Hex } from "viem";
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
import { useCowQuote } from "~~/hooks/useCowQuote";
import { SwapAsset, SwapRouter, SWAP_ROUTER_OPTIONS } from "./SwapModalShell";
import {
  FlashLoanProvider,
  MorphoMarketContextForEncoding,
  encodeMorphoContext,
  createRouterInstruction,
  encodePushToken,
} from "~~/utils/v2/instructionHelpers";
import { CompletionType, getCowExplorerAddressUrl, calculateChunkParams, calculateSwapRate } from "~~/utils/cow";
import { calculateSuggestedSlippage } from "~~/utils/slippage";
import { formatBps } from "~~/utils/risk";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isAaveV3Supported, isBalancerV2Supported, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { LimitOrderConfig, type LimitOrderResult } from "~~/components/LimitOrderConfig";
import { saveOrderNote, createLeverageUpNote } from "~~/utils/orderNotes";
import { executeSequentialTransactions, type TransactionCall } from "~~/utils/transactionSimulation";

// Import helper functions to reduce cognitive complexity
import {
  getBestQuote,
  calculateMarketRate,
  calculateQuotesPriceImpact,
  calculatePositionMetrics,
  calculateNetApyAndYield,
  calculateFeeBreakdown,
  calculateMinCollateralOut,
  calculateFlashLoanChunkParams,
  buildCowChunkInstructions,
  buildInitialDepositInstructions,
  addWalletBalancesAndSort,
  calculateMaxLeverageFromLtv,
  adjustMaxLeverageForSlippage,
  calculateFlashLoanAmount,
  getDefaultFlashLoanProviders,
  buildPreOrderInstructions,
  createSeedBorrowInstruction,
  calculateMinBuyPerChunk,
  handleLimitOrderBuildError,
  prepareLimitOrderFlashLoanConfig,
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
  const [limitSlippage, setLimitSlippage] = useState<number>(0.1);
  const [hasAutoSetLimitSlippage, setHasAutoSetLimitSlippage] = useState(false);
  const [customMinPrice, setCustomMinPrice] = useState<string>("");
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false);
  const [lastOrderSalt, setLastOrderSalt] = useState<string | null>(null);
  const [limitOrderNotificationId, setLimitOrderNotificationId] = useState<string | number | null>(null);
  const cowAvailable = isCowProtocolSupported(chainId);

  const isDevEnvironment = process.env.NODE_ENV === 'development';

  // Flash loan toggle for limit orders
  const [useFlashLoan, setUseFlashLoan] = useState<boolean>(true);
  const [flashLoanChunks, setFlashLoanChunks] = useState<number>(1);
  const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
  const [useBatchedTx, setUseBatchedTx] = useState<boolean>(false);

  // Get user address for CoW order creation
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // CoW order hooks
  const { isCreating: isCowCreating, isAvailable: cowContractAvailable } = useCowOrder();
  const { buildOrderCalls: buildLimitOrderCalls, buildRouterCall, orderManagerAddress } = useCowLimitOrder();

  // Check swap router availability for this chain
  const oneInchAvailable = is1inchSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const defaultRouter = getDefaultSwapRouter(chainId);

  // Swap router selection
  const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");

  // Zap mode: deposit debt token instead of collateral
  const [zapMode, setZapMode] = useState(false);

  // ==================== Effects for Router/Token Changes ====================

  useEffect(() => {
    if (swapRouter === "1inch" && !oneInchAvailable) {
      setSwapRouter(pendleAvailable ? "pendle" : "1inch");
    } else if (swapRouter === "pendle" && !pendleAvailable) {
      setSwapRouter(oneInchAvailable ? "1inch" : "pendle");
    }
  }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

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
  const pendleAdapter = getPendleAdapterInfo(chainId);

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

  // ==================== Limit Order Config Callback ====================

  const handleLimitOrderConfigChange = useCallback((config: LimitOrderResult) => {
    setLimitOrderConfig(config);
  }, []);

  const limitOrderSellToken = useMemo(() =>
    debt ? {
      symbol: debt.symbol,
      decimals: debt.decimals,
      address: debt.address,
    } : null,
  [debt]);

  // ==================== Swap Quotes ====================

  const swapQuoteAmount = zapMode ? totalSwapAmount : flashLoanAmountRaw;

  const { data: oneInchQuote, isLoading: is1inchLoading } = use1inchQuote({
    chainId, src: (debt?.address as Address) || "0x0000000000000000000000000000000000000000",
    dst: (collateral?.address as Address) || "0x0000000000000000000000000000000000000000",
    amount: swapQuoteAmount.toString(), from: (oneInchAdapter?.address as Address) || "0x0000000000000000000000000000000000000000",
    slippage, enabled: oneInchAvailable && swapRouter === "1inch" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!oneInchAdapter,
  });

  const { data: pendleQuote, isLoading: isPendleLoading } = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    tokensIn: debt?.address as Address,
    tokensOut: collateral?.address as Address,
    amountsIn: swapQuoteAmount.toString(),
    slippage: slippage / 100,
    enabled: pendleAvailable && swapRouter === "pendle" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!pendleAdapter,
  });

  const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
    sellToken: debt?.address || "",
    buyToken: collateral?.address || "",
    sellAmount: swapQuoteAmount.toString(),
    from: userAddress || "",
    enabled: cowAvailable && executionType === "limit" && isOpen && !!collateral && !!debt && swapQuoteAmount > 0n && !!userAddress,
  });

  const isSwapQuoteLoading = executionType === "limit"
    ? isCowQuoteLoading
    : (swapRouter === "1inch" ? is1inchLoading : isPendleLoading);

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

  const marketRate = useMemo(() =>
    calculateMarketRate(bestQuote, debt, collateral, swapQuoteAmount),
    [bestQuote, debt, collateral, swapQuoteAmount]
  );

  const quotesPriceImpact = useMemo(() =>
    calculateQuotesPriceImpact(swapRouter, quoteData.pendleQuote, quoteData.oneInchQuote),
    [swapRouter, quoteData.pendleQuote, quoteData.oneInchQuote]
  );

  // ==================== Auto-estimate Limit Slippage ====================

  useEffect(() => {
    if (executionType !== "limit" || hasAutoSetLimitSlippage) return;
    if (quotesPriceImpact === null) return;

    const suggested = calculateSuggestedSlippage(quotesPriceImpact);
    setLimitSlippage(suggested);
    setHasAutoSetLimitSlippage(true);
  }, [executionType, quotesPriceImpact, hasAutoSetLimitSlippage]);

  useEffect(() => {
    setHasAutoSetLimitSlippage(false);
    setLimitSlippage(0.1);
  }, [collateral?.address, debt?.address]);

  // ==================== Min Collateral Calculation ====================

  const minCollateralOut = useMemo(() =>
    calculateMinCollateralOut(
      collateral,
      executionType,
      customMinPrice,
      bestQuote,
      swapRouter,
      quoteData.oneInchQuote,
      quoteData.pendleQuote,
      limitSlippage,
      slippage
    ),
    [collateral, executionType, customMinPrice, bestQuote, swapRouter, quoteData.oneInchQuote, quoteData.pendleQuote, limitSlippage, slippage]
  );

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

  const { buildMultiplyFlow, sendCallsAsync, setBatchId, setSuppressBatchNotifications, isBatchConfirmed, routerContract } = useKapanRouterV2();

  useEffect(() => {
    if (isBatchConfirmed && executionType === "limit" && userAddress) {
      console.log("[Limit Order] Batch confirmed, showing success and closing modal");

      if (limitOrderNotificationId) {
        notification.remove(limitOrderNotificationId);
        setLimitOrderNotificationId(null);
      }

      const cowExplorerUrl = orderManagerAddress
        ? getCowExplorerAddressUrl(chainId, orderManagerAddress)
        : undefined;
      const shortSalt = lastOrderSalt ? `${lastOrderSalt.slice(0, 10)}...${lastOrderSalt.slice(-6)}` : "";

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
  }, [isBatchConfirmed, executionType, orderManagerAddress, chainId, lastOrderSalt, limitOrderNotificationId, onClose, userAddress]);

  // ==================== Build Flow for Market Orders ====================

  const buildFlow = () => {
    if (!collateral || !debt || flashLoanAmountRaw === 0n) return [];

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
      initialCollateral: zapMode ? "0" : (marginAmount || "0"),
      flashLoanAmount: formatUnits(flashLoanAmountRaw, debt.decimals),
      minCollateralOut: minOut, swapData,
      collateralDecimals: collateral.decimals, debtDecimals: debt.decimals,
      flashLoanProvider: selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2, market,
      morphoContext: morphoContext ? encodeMorphoContext(morphoContext) : undefined,
      swapRouter: (swapRouter === "1inch" ? "oneinch" : "pendle") as "oneinch" | "pendle",
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
      return calculateFlashLoanChunkParams(flashLoanAmountRaw, debt, {
        useFlashLoan,
        flashLoanChunks,
        limitOrderConfig,
        chainId,
      });
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
  }, [executionType, collateral, debt, flashLoanAmountRaw, marginAmountRaw, collateralConfig, isEModeActive, eMode, maxLtvBps, bestQuote, swapQuoteAmount, useFlashLoan, flashLoanChunks, chainId, limitOrderConfig]);

  // ==================== CoW Instructions Using Helper ====================

  const buildInitialDepositFlow = useMemo(() =>
    buildInitialDepositInstructions(collateral, userAddress, marginAmountRaw, protocolName, morphoContext, market),
    [collateral, userAddress, marginAmountRaw, protocolName, morphoContext, market]
  );

  const cowChunks = useMemo((): ChunkInstructions[] => {
    if (!collateral || !debt || !userAddress || flashLoanAmountRaw === 0n || !orderManagerAddress) {
      return [{ preInstructions: [], postInstructions: [] }];
    }

    return buildCowChunkInstructions({
      collateral,
      debt,
      userAddress,
      flashLoanAmountRaw,
      marginAmountRaw,
      protocolName,
      morphoContext,
      market,
      orderManagerAddress,
      chunkParams,
      chainId,
    });
  }, [collateral, debt, userAddress, flashLoanAmountRaw, marginAmountRaw, protocolName, morphoContext, market, orderManagerAddress, chunkParams, chainId]);

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

  const handleLimitSlippageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLimitSlippage(parseFloat(e.target.value));
    setCustomMinPrice("");
    setHasAutoSetLimitSlippage(true);
  }, []);

  const handleToggleAdvancedPricing = useCallback(() => setShowAdvancedPricing(prev => !prev), []);
  const handleCustomMinPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setCustomMinPrice(e.target.value), []);
  const handleUseBatchedTxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setUseBatchedTx(e.target.checked), []);
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
        await handleLimitOrderSubmit();
      } else {
        await handleMarketOrderSubmit();
      }
    } catch (e) {
      const status = executionType === "limit" ? "multiply_limit_order_complete" : "multiply_tx_complete";
      track(status, { status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionType, collateral, debt, userAddress, marginAmount, leverage, protocolName, chainId]);

  // ==================== Limit Order Submit Logic ====================

  const handleLimitOrderSubmit = async () => {
    track("multiply_limit_order_begin", {
      protocol: protocolName, chainId,
      collateral: collateral?.symbol ?? "unknown",
      debt: debt?.symbol ?? "unknown",
      marginAmount, leverage
    });

    if (!collateral || !debt || !userAddress || !orderManagerAddress || !routerContract || !sendCallsAsync) {
      throw new Error("Missing required data for limit order");
    }

    const minBuyPerChunk = calculateMinBuyPerChunk(minCollateralOut.raw, chunkParams.numChunks, collateral.decimals);
    const isFlashLoanMode = chunkParams.useFlashLoan === true;
    const seedAmount = isFlashLoanMode ? 0n : chunkParams.chunkSize;

    logLimitOrderBuildInfo(debt, collateral, minBuyPerChunk.formatted, isFlashLoanMode);

    const allCalls: { to: Address; data: Hex }[] = [];
    const seedBorrowInstruction = createSeedBorrowForMultiChunk(isFlashLoanMode, seedAmount, debt.address);
    const preOrderInstructions = buildPreOrderInstructionsForLimitOrder(isFlashLoanMode, seedBorrowInstruction);

    addMultiChunkRouterCalls(allCalls, isFlashLoanMode, seedBorrowInstruction);

    const limitOrderResult = await buildLimitOrderCalls({
      sellToken: debt.address as Address,
      buyToken: collateral.address as Address,
      chunkSize: chunkParams.chunkSize,
      minBuyPerChunk: minBuyPerChunk.raw,
      totalAmount: flashLoanAmountRaw,
      chunks: cowChunks,
      completion: CompletionType.Iterations,
      targetValue: chunkParams.numChunks,
      minHealthFactor: "1.1",
      seedAmount,
      flashLoan: prepareLimitOrderFlashLoanConfig(isFlashLoanMode, chunkParams.flashLoanLender, debt.address, chunkParams.chunkSize),
      preOrderInstructions,
      isKindBuy: false,
    });

    const buildError = handleLimitOrderBuildError(limitOrderResult);
    if (buildError) {
      handleLimitOrderBuildFailure(buildError, limitOrderResult);
      throw new Error(buildError);
    }

    if (limitOrderResult && limitOrderResult.calls) {
      allCalls.push(...limitOrderResult.calls);
    }
    console.log("[Limit Order] Total calls:", allCalls.length);

    const cowCalls = {
      salt: limitOrderResult?.salt ?? "",
      appDataHash: limitOrderResult?.appDataHash ?? "",
    };
    saveLimitOrderNote(cowCalls.salt, debt.symbol, collateral.symbol);

    await executeLimitOrderCalls(allCalls, cowCalls);
  };

  // ==================== Helper Functions for Limit Order ====================

  const logLimitOrderBuildInfo = (
    debtToken: SwapAsset,
    collateralToken: SwapAsset,
    minBuyAmountFormatted: string,
    isFlashLoanMode: boolean
  ) => {
    console.log("[Limit Order] Building batched transaction:", {
      hasInitialDeposit: marginAmountRaw > 0n && buildInitialDepositFlow.length > 0,
      sellToken: debtToken.address,
      buyToken: collateralToken.address,
      numChunks: chunkParams.numChunks,
      minBuyPerChunk: minBuyAmountFormatted,
    });
    console.log("[Limit Order] Execution mode:", isFlashLoanMode ? "FLASH_LOAN" : "MULTI_CHUNK");
  };

  const createSeedBorrowForMultiChunk = (isFlashLoanMode: boolean, seedAmount: bigint, debtAddress: Address) => {
    if (isFlashLoanMode || seedAmount <= 0n || !userAddress) return undefined;
    return createSeedBorrowInstruction(protocolName, debtAddress, userAddress, seedAmount, morphoContext, market);
  };

  const buildPreOrderInstructionsForLimitOrder = (
    isFlashLoanMode: boolean,
    seedBorrowInstruction: ReturnType<typeof createSeedBorrowInstruction> | undefined
  ) => {
    if (!collateral || !debt || !userAddress) return [];
    return buildPreOrderInstructions({
      isFlashLoanMode,
      marginAmountRaw,
      collateral,
      debt,
      userAddress,
      flashLoanAmountRaw,
      flashLoanFee: chunkParams.flashLoanFee ?? 0n,
      numChunks: chunkParams.numChunks,
      protocolName,
      morphoContext,
      market,
      buildInitialDepositFlow,
      seedBorrowInstruction,
    });
  };

  const addMultiChunkRouterCalls = (
    allCalls: { to: Address; data: Hex }[],
    isFlashLoanMode: boolean,
    seedBorrowInstruction: ReturnType<typeof createSeedBorrowInstruction> | undefined
  ) => {
    if (isFlashLoanMode || !userAddress) return;

    // Add deposit router call
    if (marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
      const depositCall = buildRouterCall(buildInitialDepositFlow);
      if (depositCall) allCalls.push(depositCall);
    }

    // Add seed borrow router call
    if (seedBorrowInstruction) {
      const pushTokenInstruction = createRouterInstruction(encodePushToken(0, userAddress));
      const seedBorrowCall = buildRouterCall([seedBorrowInstruction, pushTokenInstruction]);
      if (seedBorrowCall) allCalls.push(seedBorrowCall);
    }
  };

  const handleLimitOrderBuildFailure = (
    errorMsg: string,
    result: { errorDetails?: { apiResponse?: string } } | null | undefined
  ) => {
    const fullError = result?.errorDetails?.apiResponse
      ? `${errorMsg}\n\nAPI Response: ${result.errorDetails.apiResponse}`
      : errorMsg;
    console.error("[Limit Order] Build failed:", fullError);
    notification.error(<TransactionToast step="failed" message={`CoW API Error: ${errorMsg}`} />);
  };

  const saveLimitOrderNote = (salt: string, debtSymbol: string, collateralSymbol: string) => {
    if (salt) {
      saveOrderNote(createLeverageUpNote(salt, protocolName, debtSymbol, collateralSymbol, chainId));
    }
  };

  // ==================== Execute Limit Order Calls ====================

  const executeLimitOrderCalls = async (
    allCalls: { to: Address; data: Hex }[],
    cowCalls: { salt: string; appDataHash: string }
  ) => {
    const notificationId: string | number = notification.loading(
      <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
    );

    try {
      if (useBatchedTx && !!sendCallsAsync) {
        await executeBatchedLimitOrder(allCalls, cowCalls, notificationId);
      } else {
        await executeSequentialLimitOrder(allCalls, cowCalls, notificationId);
      }
    } catch (batchError: unknown) {
      notification.remove(notificationId);
      throw batchError;
    }
  };

  // ==================== Batched Limit Order Execution ====================

  const executeBatchedLimitOrder = async (
    allCalls: { to: Address; data: Hex }[],
    cowCalls: { salt: string; appDataHash: string },
    notificationId: string | number
  ) => {
    console.log("[Limit Order] Using batched TX mode (EIP-5792)");

    if (!sendCallsAsync) throw new Error("sendCallsAsync not available");

    const { id: newBatchId } = await sendCallsAsync({
      calls: allCalls,
      experimental_fallback: true,
    });

    setLastOrderSalt(cowCalls.salt);
    setSuppressBatchNotifications(true);
    setBatchId(newBatchId);

    notification.remove(notificationId);

    const loadingId = notification.loading(
      <TransactionToast
        step="sent"
        message="Limit order submitted - waiting for confirmation..."
      />
    );
    setLimitOrderNotificationId(loadingId);

    console.log("[Limit Order] Batch submitted:", newBatchId);
    console.log("[Limit Order] Salt:", cowCalls.salt);
    console.log("[Limit Order] AppData Hash:", cowCalls.appDataHash);

    track("multiply_limit_order_complete", { status: "submitted", batchId: newBatchId });
  };

  // ==================== Sequential Limit Order Execution ====================

  const executeSequentialLimitOrder = async (
    allCalls: { to: Address; data: Hex }[],
    cowCalls: { salt: string; appDataHash: string },
    notificationIdInitial: string | number
  ) => {
    let notificationId = notificationIdInitial;
    console.log("[Limit Order] Using sequential TX mode");

    if (!walletClient || !publicClient || !userAddress) {
      throw new Error("Wallet not connected");
    }

    const result = await executeSequentialTransactions(
      publicClient,
      walletClient,
      allCalls as TransactionCall[],
      userAddress,
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
    setLastOrderSalt(cowCalls.salt);

    const explorerUrl = getCowExplorerAddressUrl(chainId, userAddress);
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
    onClose();
  };

  // ==================== Market Order Submit Logic ====================

  const handleMarketOrderSubmit = async () => {
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

  // ==================== Derived State for UI ====================

  const hasQuote = swapRouter === "1inch" ? !!oneInchQuote : !!pendleQuote;
  const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;

  const canSubmitMarket = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && hasQuote && hasAdapter && !isSwapQuoteLoading;
  const canSubmitLimit = !!collateral && !!debt && marginAmountRaw > 0n && leverage > 1 && cowContractAvailable && !isCowCreating && isDevEnvironment;
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

  const ticks = [1, (1 + maxLeverage) / 2, maxLeverage];

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
            isDevEnvironment={isDevEnvironment}
            limitSlippage={limitSlippage}
            handleLimitSlippageChange={handleLimitSlippageChange}
            isSwapQuoteLoading={isSwapQuoteLoading}
            marketRate={marketRate}
            debt={debt}
            collateral={collateral}
            bestQuote={bestQuote}
            minCollateralOut={minCollateralOut}
            showAdvancedPricing={showAdvancedPricing}
            handleToggleAdvancedPricing={handleToggleAdvancedPricing}
            customMinPrice={customMinPrice}
            handleCustomMinPriceChange={handleCustomMinPriceChange}
            limitOrderSellToken={limitOrderSellToken}
            chainId={chainId}
            flashLoanAmountRaw={flashLoanAmountRaw}
            handleLimitOrderConfigChange={handleLimitOrderConfigChange}
            useFlashLoan={useFlashLoan}
            setUseFlashLoan={setUseFlashLoan}
            flashLoanChunks={flashLoanChunks}
            setFlashLoanChunks={setFlashLoanChunks}
            chunkParams={chunkParams}
            useBatchedTx={useBatchedTx}
            handleUseBatchedTxChange={handleUseBatchedTxChange}
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
        <span className="text-base-content/40">arrow-right</span>
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
  isDevEnvironment: boolean;
  limitSlippage: number;
  handleLimitSlippageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isSwapQuoteLoading: boolean;
  marketRate: number | null;
  debt: SwapAsset | undefined;
  collateral: SwapAsset | undefined;
  bestQuote: { source: string; amount: bigint } | null;
  minCollateralOut: { raw: bigint; formatted: string };
  showAdvancedPricing: boolean;
  handleToggleAdvancedPricing: () => void;
  customMinPrice: string;
  handleCustomMinPriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  limitOrderSellToken: { symbol: string; decimals: number; address: Address } | null;
  chainId: number;
  flashLoanAmountRaw: bigint;
  handleLimitOrderConfigChange: (config: LimitOrderResult) => void;
  useFlashLoan: boolean;
  setUseFlashLoan: (v: boolean) => void;
  flashLoanChunks: number;
  setFlashLoanChunks: (v: number) => void;
  chunkParams: ChunkParamsResult;
  useBatchedTx: boolean;
  handleUseBatchedTxChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
    cowContractAvailable, isDevEnvironment, limitSlippage, handleLimitSlippageChange, isSwapQuoteLoading,
    marketRate, debt, collateral, bestQuote, minCollateralOut, showAdvancedPricing, handleToggleAdvancedPricing,
    customMinPrice, handleCustomMinPriceChange, limitOrderSellToken, chainId, flashLoanAmountRaw,
    handleLimitOrderConfigChange, useFlashLoan, setUseFlashLoan, flashLoanChunks, setFlashLoanChunks,
    chunkParams, useBatchedTx, handleUseBatchedTxChange, zapMode, handleZapModeChange, swapRouter,
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
        <LimitOrderPricingSection
          limitSlippage={limitSlippage}
          handleLimitSlippageChange={handleLimitSlippageChange}
          isSwapQuoteLoading={isSwapQuoteLoading}
          marketRate={marketRate}
          debt={debt}
          collateral={collateral}
          bestQuote={bestQuote}
          minCollateralOut={minCollateralOut}
          showAdvancedPricing={showAdvancedPricing}
          handleToggleAdvancedPricing={handleToggleAdvancedPricing}
          customMinPrice={customMinPrice}
          handleCustomMinPriceChange={handleCustomMinPriceChange}
          limitOrderSellToken={limitOrderSellToken}
          chainId={chainId}
          flashLoanAmountRaw={flashLoanAmountRaw}
          handleLimitOrderConfigChange={handleLimitOrderConfigChange}
          useFlashLoan={useFlashLoan}
          setUseFlashLoan={setUseFlashLoan}
          flashLoanChunks={flashLoanChunks}
          setFlashLoanChunks={setFlashLoanChunks}
          chunkParams={chunkParams}
          useBatchedTx={useBatchedTx}
          handleUseBatchedTxChange={handleUseBatchedTxChange}
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
                {[0.1, 0.3, 0.5, 1, 2, 3].map(s => <option key={s} value={s}>{s}%</option>)}
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
  limitSlippage: number;
  handleLimitSlippageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isSwapQuoteLoading: boolean;
  marketRate: number | null;
  debt: SwapAsset | undefined;
  collateral: SwapAsset | undefined;
  bestQuote: { source: string; amount: bigint } | null;
  minCollateralOut: { raw: bigint; formatted: string };
  showAdvancedPricing: boolean;
  handleToggleAdvancedPricing: () => void;
  customMinPrice: string;
  handleCustomMinPriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  limitOrderSellToken: { symbol: string; decimals: number; address: Address } | null;
  chainId: number;
  flashLoanAmountRaw: bigint;
  handleLimitOrderConfigChange: (config: LimitOrderResult) => void;
  useFlashLoan: boolean;
  setUseFlashLoan: (v: boolean) => void;
  flashLoanChunks: number;
  setFlashLoanChunks: (v: number) => void;
  chunkParams: ChunkParamsResult;
  useBatchedTx: boolean;
  handleUseBatchedTxChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const LimitOrderPricingSection: FC<LimitOrderPricingSectionProps> = (props) => {
  const {
    limitSlippage, handleLimitSlippageChange, isSwapQuoteLoading, marketRate, debt, collateral,
    bestQuote, minCollateralOut, showAdvancedPricing, handleToggleAdvancedPricing, customMinPrice,
    handleCustomMinPriceChange, limitOrderSellToken, chainId, flashLoanAmountRaw,
    handleLimitOrderConfigChange, useFlashLoan, setUseFlashLoan, flashLoanChunks, setFlashLoanChunks,
    chunkParams, useBatchedTx, handleUseBatchedTxChange,
  } = props;

  return (
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

      {/* Slippage Slider */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-base-content/60">Max Slippage</span>
          <span className="text-warning font-medium">
            {limitSlippage < 0.1 ? limitSlippage.toFixed(2) : limitSlippage.toFixed(1)}%
          </span>
        </div>
        <input type="range" min="0" max="5" step="0.01" value={limitSlippage} onChange={handleLimitSlippageChange} className="range range-warning range-xs w-full" />
        <div className="text-base-content/40 mt-0.5 flex justify-between text-[10px]">
          <span>0%</span><span>0.1%</span><span>1%</span><span>5%</span>
        </div>
        {limitSlippage === 0 && (
          <div className="text-warning mt-1 text-[10px]">0% slippage - order may not fill if price moves</div>
        )}
      </div>

      {/* Min Output */}
      <div className="border-base-300/30 flex items-center justify-between border-t py-2">
        <span className="text-base-content/60">Min Output</span>
        <span className="text-success font-medium">
          {minCollateralOut.raw > 0n ? `${Number(minCollateralOut.formatted).toFixed(6)} ${collateral?.symbol}` : "-"}
        </span>
      </div>

      {/* Advanced Pricing */}
      <button onClick={handleToggleAdvancedPricing} className="text-base-content/50 hover:text-base-content/70 mt-1 flex items-center gap-1 text-[10px]">
        <svg className={`size-3 transition-transform${showAdvancedPricing ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Set custom min output
      </button>

      {showAdvancedPricing && (
        <div className="border-base-300/30 mt-2 border-t pt-2">
          <div className="flex items-center gap-2">
            <input type="number" value={customMinPrice} onChange={handleCustomMinPriceChange} placeholder={minCollateralOut.formatted} className="bg-base-300/50 flex-1 rounded px-2 py-1 text-xs outline-none" />
            <span className="text-base-content/50">{collateral?.symbol}</span>
          </div>
          {customMinPrice && (
            <p className="text-warning mt-1 text-[10px]">Using custom min output. Order will only fill if you receive at least this amount.</p>
          )}
        </div>
      )}

      {/* Flash Loan Config */}
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

      {/* Chunk Info */}
      {!chunkParams.useFlashLoan && chunkParams.needsChunking && (
        <div className="border-base-300/30 mt-2 flex items-start gap-1.5 border-t pt-2 text-[10px]">
          <svg className="text-info mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <div>
            <span className="text-info font-medium">Multi-chunk execution: {chunkParams.numChunks} iterations</span>
            <p className="text-base-content/50 mt-0.5">{chunkParams.explanation}</p>
          </div>
        </div>
      )}

      {/* Batched TX Toggle */}
      <div className="border-base-300/30 mt-2 flex items-center justify-between border-t pt-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/60">Batched TX</span>
          <span className="text-base-content/40 text-[10px]">(EIP-5792)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base-content/40 text-[10px]">{useBatchedTx ? "faster" : "compatible"}</span>
          <input type="checkbox" checked={useBatchedTx} onChange={handleUseBatchedTxChange} className="toggle toggle-primary toggle-xs" />
        </div>
      </div>
      {!useBatchedTx && (
        <div className="mt-1 flex items-start gap-1.5 text-[10px]">
          <svg className="text-warning mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-warning/80">Sequential mode: each step requires separate wallet confirmation. More compatible with MetaMask.</span>
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
}) => (
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
);

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
            `${shortAmount.toFixed(2)} arrow-right ${Number(minCollateralOut.formatted).toFixed(2)}`
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
