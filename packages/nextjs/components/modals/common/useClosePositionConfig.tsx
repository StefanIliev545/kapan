/**
 * Configuration hook for ClosePositionModal.
 *
 * This hook encapsulates all the state and logic for closing debt positions
 * by selling collateral, providing a clean interface that can be used with SwapModalShell.
 *
 * Close position flow:
 * 1. User enters debt amount to repay
 * 2. System calculates required collateral based on exchange rate
 * 3. Flash loan provides the collateral
 * 4. Collateral is swapped for debt token
 * 5. Debt is repaid
 * 6. Remaining collateral is withdrawn to repay flash loan
 *
 * Supports both market orders (instant via flash loans) and limit orders (via CoW Protocol).
 */

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { formatUnits, parseUnits, type Address, encodeAbiParameters, type Hex, type TransactionReceipt } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useDebounceValue } from "usehooks-ts";
import { track } from "@vercel/analytics";
import { Tooltip } from "@radix-ui/themes";
import { InformationCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import {
  useCowConditionalOrder,
  encodeLimitPriceTriggerParams,
  getProtocolId,
  type ConditionalOrderInstructions,
} from "~~/hooks/useCowConditionalOrder";
import { useCowQuote } from "~~/hooks/useCowQuote";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useSaveOrder } from "~~/hooks/useOrderHistory";

import { parseAmount } from "~~/utils/validation";
import { getCowFlashLoanProviders, getPreferredFlashLoanLender, calculateFlashLoanFee, storeOrderQuoteRate, getCowExplorerAddressUrl, getKapanCowAdapter } from "~~/utils/cow";
import {
  is1inchSupported,
  isKyberSupported,
  isPendleSupported,
  getDefaultSwapRouter,
  getOneInchAdapterInfo,
  getKyberAdapterInfo,
  getPendleAdapterInfo,
  isPendleToken,
  isCowProtocolSupported,
} from "~~/utils/chainFeatures";
import {
  FlashLoanProvider,
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodeApprove,
  encodeFlashLoan,
  encodeLendingInstruction,
  encodePushToken,
  encodeToOutput,
  LendingOp,
  encodeEulerContext,
  normalizeProtocolName,
  calculateLimitPrice,
} from "~~/utils/v2/instructionHelpers";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { extractOrderHash } from "~~/utils/orderHashExtractor";

import {
  trackModalOpen,
  createLimitOrderAnalyticsProps,
  buildCowFlashLoanInfo,
  logLimitOrderBuildStart,
  saveLimitOrderNote,
  calculateRequiredCollateral,
  calculateLimitOrderCollateral,
} from "../closeWithCollateralEvmHelpers";

import type { SwapAsset, SwapRouter } from "../SwapModalShell";
import type { LimitOrderResult } from "~~/components/LimitOrderConfig";
import type { SwapOperationConfig, UseClosePositionConfigProps, ExecutionType } from "./swapConfigTypes";
import { hasEnoughCollateral as checkCollateralSufficiency } from "./useClosePositionQuote";
import { ExecutionTypeToggle } from "./ExecutionTypeToggle";

// Aave flash loan fee: 5 bps (0.05%)
// We add a small buffer (10 bps total) to ensure swap covers repayment
const AAVE_FLASH_LOAN_FEE_BPS = 10n;

// Expected execution times for buffer calculation
const MARKET_ORDER_MINUTES = 2; // Market orders execute in ~2 minutes
const LIMIT_ORDER_HOURS = 24; // Limit orders may take up to 24 hours

// Fallback rates if borrowRateApy is not provided
const FALLBACK_BORROW_RATE_APY = 10; // 10% APY as conservative fallback

// Default slippage for swaps
const DEFAULT_SLIPPAGE = 0.5; // 0.5%

/**
 * Calculate interest buffer in basis points based on actual borrow rate and time
 * @param borrowRateApy - Annual percentage yield (e.g., 5.5 for 5.5%)
 * @param minutes - Expected execution time in minutes
 * @returns Buffer in basis points (1 bp = 0.01%)
 */
function calculateInterestBufferBps(borrowRateApy: number, minutes: number): bigint {
  // APY to per-minute rate: rate% * minutes / (365 * 24 * 60)
  // Convert to basis points: * 100
  const minutesPerYear = 365 * 24 * 60;
  const bufferPercent = (borrowRateApy * minutes) / minutesPerYear;
  const bufferBps = Math.ceil(bufferPercent * 100); // Round up to be safe
  return BigInt(Math.max(1, bufferBps)); // Minimum 1 bp
}

/**
 * Hook that provides all configuration for a close position operation.
 *
 * Returns a SwapOperationConfig that can be spread into SwapModalShell.
 */
export function useClosePositionConfig(props: UseClosePositionConfigProps): SwapOperationConfig {
  const {
    isOpen,
    onClose,
    chainId,
    protocolName,
    debtToken,
    debtName,
    debtIcon,
    debtDecimals,
    debtPrice,
    debtBalance,
    availableCollaterals,
    context,
    borrowRateApy,
    // Euler-specific
    eulerBorrowVault,
    eulerCollateralVaults,
    eulerSubAccountIndex,
  } = props;

  const { buildCloseWithCollateralFlow } = useKapanRouterV2({ chainId });

  // Protocol detection
  const isEuler = protocolName.toLowerCase().includes("euler");

  // Check swap router availability
  const oneInchAvailable = is1inchSupported(chainId);
  const kyberAvailable = isKyberSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const kyberAdapter = getKyberAdapterInfo(chainId);
  const pendleAdapter = getPendleAdapterInfo(chainId);
  const defaultRouter = getDefaultSwapRouter(chainId);

  // ============ State ============
  const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "kyber");
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);
  const [amountIn, setAmountIn] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Execution type state
  const [executionType, setExecutionType] = useState<ExecutionType>("market");
  const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
  const [numChunks, setNumChunks] = useState(1);
  const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
  const cowAvailable = isCowProtocolSupported(chainId);

  // Custom buy amount for limit orders
  const [customBuyAmount, setCustomBuyAmount] = useState<string>("");
  const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);

  // Debounce amountIn to prevent race conditions
  const [debouncedAmountIn] = useDebounceValue(amountIn, 300);
  const isInputSettling = amountIn !== debouncedAmountIn;

  // Select the correct adapter
  const activeAdapter = swapRouter === "kyber" ? kyberAdapter : swapRouter === "pendle" ? pendleAdapter : oneInchAdapter;

  // Wallet hooks
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });

  // CoW conditional order hook (new system)
  const {
    buildOrderCalls: buildConditionalOrderCalls,
    isReady: conditionalOrderReady,
    managerAddress: conditionalOrderManagerAddress,
    limitPriceTriggerAddress,
  } = useCowConditionalOrder();
  const saveOrder = useSaveOrder();

  // Track modal open
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const modalJustOpened = isOpen && !wasOpenRef.current;
    if (modalJustOpened) {
      trackModalOpen(
        protocolName,
        chainId,
        context,
        debtToken,
        debtName,
        availableCollaterals?.length ?? null
      );
    }
    wasOpenRef.current = isOpen;
  }, [availableCollaterals?.length, chainId, debtName, debtToken, isOpen, context, protocolName]);

  // ============ Asset Setup ============
  // "From" is fixed (debt to repay)
  const fromAsset: SwapAsset = useMemo(
    () => ({
      symbol: debtName,
      address: debtToken,
      decimals: debtDecimals,
      rawBalance: debtBalance,
      balance: parseFloat(formatUnits(debtBalance, debtDecimals)),
      icon: debtIcon,
      price: debtPrice,
    }),
    [debtName, debtToken, debtDecimals, debtBalance, debtIcon, debtPrice]
  );

  const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
  const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);

  // Filter "To" assets (collaterals with balance, exclude debt token)
  const toAssets = useMemo(
    () =>
      (availableCollaterals || []).filter(
        a => a.rawBalance > 0n && a.address.toLowerCase() !== debtToken.toLowerCase()
      ),
    [availableCollaterals, debtToken]
  );

  // Euler context encoding
  const eulerContextEncoded = useMemo(() => {
    if (!isEuler || !eulerBorrowVault || !selectedTo) return undefined;
    const selectedCollateralVault =
      (selectedTo as SwapAsset & { eulerCollateralVault?: string }).eulerCollateralVault ||
      eulerCollateralVaults?.[0];
    if (!selectedCollateralVault) return undefined;
    return encodeEulerContext({
      borrowVault: eulerBorrowVault as Address,
      collateralVault: selectedCollateralVault as Address,
      subAccountIndex: eulerSubAccountIndex,
    });
  }, [isEuler, eulerBorrowVault, eulerCollateralVaults, eulerSubAccountIndex, selectedTo]);

  // ============ Effects ============
  // Update swap router when chain changes
  useEffect(() => {
    if (swapRouter === "kyber" && !kyberAvailable) {
      setSwapRouter(oneInchAvailable ? "1inch" : pendleAvailable ? "pendle" : "kyber");
    } else if (swapRouter === "1inch" && !oneInchAvailable) {
      setSwapRouter(kyberAvailable ? "kyber" : pendleAvailable ? "pendle" : "1inch");
    } else if (swapRouter === "pendle" && !pendleAvailable) {
      setSwapRouter(kyberAvailable ? "kyber" : oneInchAvailable ? "1inch" : "pendle");
    }
  }, [chainId, oneInchAvailable, kyberAvailable, pendleAvailable, swapRouter]);

  // Ensure "From" is always synced with the latest debt token data (address and balance)
  useEffect(() => {
    const addressMismatch = !selectedFrom || selectedFrom.address !== debtToken;
    const balanceMismatch = selectedFrom && selectedFrom.rawBalance !== debtBalance;
    if (addressMismatch || balanceMismatch) {
      setSelectedFrom(fromAsset);
    }
  }, [selectedFrom, debtToken, debtBalance, fromAsset]);

  // Auto-switch to Pendle for PT tokens
  useEffect(() => {
    if (selectedTo && isPendleToken(selectedTo.symbol) && pendleAvailable) {
      setSwapRouter("pendle");
    }
  }, [selectedTo, pendleAvailable]);

  // Initialize limitOrderConfig
  useEffect(() => {
    if (executionType !== "limit" || limitOrderConfig?.selectedProvider) return;

    const providers = getCowFlashLoanProviders(chainId);
    if (providers.length === 0) return;

    const morphoProvider = providers.find(p => p.provider === "morpho");
    const defaultProvider = morphoProvider || providers[0];
    const lenderInfo = getPreferredFlashLoanLender(chainId, defaultProvider.provider);

    setLimitOrderConfig({
      selectedProvider: defaultProvider,
      useFlashLoan: true,
      numChunks: 1,
      chunkSize: 0n,
      chunkSizes: [0n],
      flashLoanLender: lenderInfo?.address || null,
      flashLoanFee: calculateFlashLoanFee(0n, defaultProvider.provider),
      explanation: "Single tx execution",
    });
  }, [executionType, chainId, limitOrderConfig?.selectedProvider]);

  // Sync numChunks
  useEffect(() => {
    if (limitOrderConfig && limitOrderConfig.numChunks !== numChunks) {
      setLimitOrderConfig({ ...limitOrderConfig, numChunks });
    }
  }, [numChunks, limitOrderConfig]);

  // ============ Flash Loan Setup ============
  const positionForFlashLoan = useMemo(
    () => ({
      name: debtName,
      tokenAddress: debtToken,
      decimals: debtDecimals,
      type: "borrow" as const,
    }),
    [debtName, debtToken, debtDecimals]
  );

  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen,
    networkType: "evm",
    fromProtocol: protocolName,
    chainId,
    position: positionForFlashLoan,
  });

  const { selectedProvider, setSelectedProvider } = useFlashLoanSelection({
    flashLoanProviders,
    defaultProvider: defaultFlashLoanProvider,
    tokenAddress: debtToken,
    amount: parseAmount(debouncedAmountIn || "0", debtDecimals).value ?? 0n,
    chainId,
  });

  // ============ Quote Logic ============
  const repayAmountRaw = useMemo(() => {
    const result = parseAmount(debouncedAmountIn || "0", debtDecimals);
    return result.value ?? 0n;
  }, [debouncedAmountIn, debtDecimals]);

  // Add buffer for interest accrual between quote time and execution
  // Calculate based on actual borrow rate and expected execution time
  const bufferedRepayAmount = useMemo(() => {
    if (repayAmountRaw === 0n) return 0n;
    const rate = borrowRateApy ?? FALLBACK_BORROW_RATE_APY;
    const minutes = executionType === "limit"
      ? LIMIT_ORDER_HOURS * 60
      : MARKET_ORDER_MINUTES;
    const bufferBps = calculateInterestBufferBps(rate, minutes);
    return repayAmountRaw + (repayAmountRaw * bufferBps) / 10000n;
  }, [repayAmountRaw, executionType, borrowRateApy]);

  // For limit orders, the buy amount is the debt we want to receive
  const limitOrderBuyAmount = useMemo(() => {
    if (executionType !== "limit") return repayAmountRaw;
    return bufferedRepayAmount; // Already includes limit order buffer
  }, [repayAmountRaw, executionType, bufferedRepayAmount]);

  // Unit quote (1 collateral -> X debt)
  const unitQuoteAmount = useMemo(() => {
    if (!selectedTo) return "0";
    return parseUnits("1", selectedTo.decimals).toString();
  }, [selectedTo]);

  const { data: oneInchUnitQuote, isLoading: isOneInchUnitQuoteLoading } = use1inchQuoteOnly({
    chainId,
    src: selectedTo?.address as Address,
    dst: debtToken,
    amount: unitQuoteAmount,
    enabled:
      (kyberAvailable && swapRouter === "kyber" || oneInchAvailable && swapRouter === "1inch") &&
      !!selectedTo &&
      isOpen,
  });

  const { data: pendleUnitQuote, isLoading: isPendleUnitQuoteLoading } = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    tokensIn: selectedTo?.address as Address,
    tokensOut: debtToken,
    amountsIn: unitQuoteAmount,
    slippage: 0.03,
    enabled:
      pendleAvailable &&
      swapRouter === "pendle" &&
      !!selectedTo &&
      !!pendleAdapter &&
      isOpen &&
      unitQuoteAmount !== "0",
  });

  const isUnitQuoteLoading = swapRouter === "pendle" ? isPendleUnitQuoteLoading : isOneInchUnitQuoteLoading;

  // Calculate required collateral using buffered debt amount
  // This ensures we sell enough collateral to cover debt + interest accrual buffer
  const { requiredCollateral, requiredCollateralFormatted, exchangeRate } = useMemo(() => {
    return calculateRequiredCollateral({
      selectedTo,
      repayAmountRaw: bufferedRepayAmount, // Use buffered amount for collateral calc
      oneInchUnitQuote,
      pendleUnitQuote,
      debtDecimals,
      slippage,
    });
  }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, bufferedRepayAmount, debtDecimals, slippage]);

  const hasEnoughCollateral = selectedTo
    ? checkCollateralSufficiency(requiredCollateral, selectedTo.rawBalance)
    : false;

  // Swap quote
  const minSwapAmount = selectedTo ? parseUnits("0.0001", selectedTo.decimals) : 0n;
  const kyberSwapEnabled = kyberAvailable && swapRouter === "kyber" && requiredCollateral > minSwapAmount && !!selectedTo && !!kyberAdapter && isOpen;
  const oneInchSwapEnabled = oneInchAvailable && swapRouter === "1inch" && requiredCollateral > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen;
  const pendleSwapEnabled = pendleAvailable && swapRouter === "pendle" && requiredCollateral > minSwapAmount && !!selectedTo && !!pendleAdapter && isOpen;

  const { data: oneInchSwapQuote, isLoading: is1inchSwapQuoteLoading, error: oneInchQuoteError } = use1inchQuote({
    chainId,
    src: selectedTo?.address as Address,
    dst: debtToken,
    amount: requiredCollateral.toString(),
    from: activeAdapter?.address || ("" as Address),
    slippage,
    enabled: kyberSwapEnabled || oneInchSwapEnabled,
    preferredRouter: swapRouter === "kyber" ? "kyber" : "1inch",
  });

  const { data: pendleQuoteData, isLoading: isPendleQuoteLoading, error: pendleQuoteError } = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    slippage: slippage / 100,
    tokensIn: selectedTo?.address as Address,
    tokensOut: debtToken,
    amountsIn: requiredCollateral.toString(),
    enableAggregator: true,
    enabled: pendleSwapEnabled,
  });

  const swapQuote = useMemo(() => {
    if (swapRouter === "pendle" && pendleQuoteData) {
      const outAmount = pendleQuoteData.data.amountPtOut || pendleQuoteData.data.amountTokenOut || "0";
      return {
        dstAmount: outAmount,
        tx: { data: pendleQuoteData.transaction.data },
        srcUSD: null,
        dstUSD: null,
      };
    }
    return oneInchSwapQuote;
  }, [swapRouter, pendleQuoteData, oneInchSwapQuote]);

  // Check if actual quote output covers debt - if not, we need more collateral
  // This handles price impact on larger swaps that unit quote doesn't capture
  const quoteShortfall = useMemo(() => {
    if (!swapQuote || repayAmountRaw === 0n) return null;
    const quoteOutput = BigInt(swapQuote.dstAmount);
    if (quoteOutput >= repayAmountRaw) return null; // Quote covers debt
    // Calculate shortfall ratio: how much more collateral we need
    // e.g., if quote gives 98 but we need 100, ratio = 100/98 = 1.0204
    return {
      needed: repayAmountRaw,
      received: quoteOutput,
      ratio: Number(repayAmountRaw) / Number(quoteOutput),
    };
  }, [swapQuote, repayAmountRaw]);

  // Log warning when quote doesn't cover debt
  useEffect(() => {
    if (quoteShortfall && isOpen) {
      console.warn(
        `[Close Position] Quote shortfall detected: need ${formatUnits(quoteShortfall.needed, debtDecimals)}, ` +
        `quote gives ${formatUnits(quoteShortfall.received, debtDecimals)} ` +
        `(${((quoteShortfall.ratio - 1) * 100).toFixed(2)}% short). Consider increasing slippage.`
      );
    }
  }, [quoteShortfall, isOpen, debtDecimals]);

  const isSwapQuoteLoading = swapRouter === "pendle" ? isPendleQuoteLoading : is1inchSwapQuoteLoading;
  const quoteError = swapRouter === "pendle" ? pendleQuoteError : oneInchQuoteError;
  const isQuoteLoading = isUnitQuoteLoading || isSwapQuoteLoading || isInputSettling;

  const hasAdapter = swapRouter === "kyber" ? !!kyberAdapter : swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;

  // CoW quote for limit orders
  const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
    sellToken: selectedTo?.address || "",
    buyToken: debtToken,
    buyAmount: limitOrderBuyAmount.toString(),
    kind: "buy",
    from: userAddress || "",
    enabled:
      cowAvailable &&
      executionType === "limit" &&
      limitOrderBuyAmount > 0n &&
      !!selectedTo &&
      !!userAddress &&
      isOpen,
  });

  // Limit order collateral calculation
  const limitOrderCollateral = useMemo(() => {
    const cowCollateral = calculateLimitOrderCollateral(cowQuote, selectedTo, slippage);
    if (cowCollateral > 0n) return cowCollateral;
    if (requiredCollateral > 0n) {
      console.log("[Limit Order] CoW quote unavailable, using 1inch/Pendle quote as fallback");
      return requiredCollateral;
    }
    return 0n;
  }, [cowQuote, selectedTo, slippage, requiredCollateral]);

  const effectiveLimitOrderCollateral = useMemo(() => {
    if (useCustomBuyAmount && customBuyAmount && selectedTo) {
      const parsed = parseFloat(customBuyAmount);
      if (!isNaN(parsed) && parsed > 0) {
        return BigInt(Math.floor(parsed * 10 ** selectedTo.decimals));
      }
    }
    return limitOrderCollateral;
  }, [useCustomBuyAmount, customBuyAmount, selectedTo, limitOrderCollateral]);

  const hasEnoughCollateralForLimit =
    selectedTo && effectiveLimitOrderCollateral > 0n
      ? checkCollateralSufficiency(effectiveLimitOrderCollateral, selectedTo.rawBalance)
      : hasEnoughCollateral;

  // Conditional order trigger params - encodes parameters for LimitPriceTrigger contract
  const conditionalOrderTriggerParams = useMemo(() => {
    if (!selectedTo || !selectedTo.address || !debtToken || !limitPriceTriggerAddress) return null;
    if (effectiveLimitOrderCollateral === 0n || limitOrderBuyAmount === 0n) return null;

    // Normalize protocol name for getProtocolId
    const normalizedProtocol = normalizeProtocolName(protocolName);

    // Calculate limit price (8 decimals, like Chainlink)
    // limitPrice = (buyAmount / sellAmount) * 1e8
    // For close position: we sell collateral to buy debt
    const limitPrice = calculateLimitPrice(
      effectiveLimitOrderCollateral, selectedTo.decimals,
      limitOrderBuyAmount, debtDecimals
    );

    // Close position is a BUY order: we want exact debt amount (buyAmount) for repayment
    // totalSellAmount = max collateral we're willing to sell, totalBuyAmount = exact debt to buy
    // IMPORTANT: Add slippage buffer to totalSellAmount! The trigger calculates sellAmount with slippage,
    // then caps it to totalSellAmount. Without buffer, the slippage would be negated by the cap.
    const totalSellAmountWithSlippage = (effectiveLimitOrderCollateral * BigInt(10000 + Math.round(slippage * 100))) / 10000n;

    return encodeLimitPriceTriggerParams({
      protocolId: getProtocolId(normalizedProtocol),
      protocolContext: (context || "0x") as `0x${string}`,
      sellToken: selectedTo.address as Address,
      buyToken: debtToken as Address,
      sellDecimals: selectedTo.decimals,
      buyDecimals: debtDecimals,
      limitPrice,
      triggerAbovePrice: false, // Execute when price <= limit (we want good rates for selling)
      totalSellAmount: totalSellAmountWithSlippage, // Max willing to sell (with slippage buffer)
      totalBuyAmount: limitOrderBuyAmount, // Exact amount to buy (debt for repayment)
      numChunks: numChunks,
      maxSlippageBps: Math.round(slippage * 100), // Use actual slippage setting
      isKindBuy: true, // BUY order: exact buyAmount, max sellAmount
    });
  }, [
    selectedTo,
    limitPriceTriggerAddress,
    effectiveLimitOrderCollateral,
    limitOrderBuyAmount,
    protocolName,
    context,
    debtToken,
    debtDecimals,
    numChunks,
    slippage,
  ]);

  // ============ Output Amount ============
  const amountOut = useMemo(() => {
    if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
      return customBuyAmount;
    }
    if (executionType === "limit" && effectiveLimitOrderCollateral > 0n && selectedTo) {
      return formatUnits(effectiveLimitOrderCollateral, selectedTo.decimals);
    }
    return requiredCollateralFormatted;
  }, [executionType, useCustomBuyAmount, customBuyAmount, effectiveLimitOrderCollateral, selectedTo, requiredCollateralFormatted]);

  // Flash loan info for limit orders
  const cowFlashLoanInfo = useMemo(() => {
    return buildCowFlashLoanInfo(chainId, limitOrderConfig, executionType, selectedTo, effectiveLimitOrderCollateral);
  }, [chainId, limitOrderConfig, executionType, effectiveLimitOrderCollateral, selectedTo]);

  // Build conditional order instructions for the new system
  // UTXO layout: [0] = actualSellAmount, [1] = actualBuyAmount
  const buildConditionalOrderInstructionsData = useMemo((): ConditionalOrderInstructions[] => {
    if (!selectedTo || !selectedTo.address || !debtToken || !userAddress || !conditionalOrderManagerAddress || !cowFlashLoanInfo) {
      return [{ preInstructions: [], postInstructions: [] }];
    }

    const numChunksVal = limitOrderConfig?.numChunks ?? 1;

    // Normalize protocol name
    const normalizedProtocol = normalizeProtocolName(protocolName);

    // Euler-specific handling
    if (isEuler && eulerContextEncoded && eulerBorrowVault) {
      const selectedCollateralVault =
        (selectedTo as SwapAsset & { eulerCollateralVault?: string }).eulerCollateralVault ||
        eulerCollateralVaults?.[0];

      if (!selectedCollateralVault) {
        console.error("[Euler Limit Order] No collateral vault found");
        return [{ preInstructions: [], postInstructions: [] }];
      }

      return Array(numChunksVal)
        .fill(null)
        .map(() => {
          const postInstructions: ProtocolInstruction[] = [];
          // UTXO layout after manager injects:
          // [0] = actualSellAmount (collateral sold)
          // [1] = actualBuyAmount (debt received) - already in router, no PullToken needed
          let utxoIndex = 2;

          // [0] Approve UTXO[1] (debt tokens already in router) for repayment
          postInstructions.push(createRouterInstruction(encodeApprove(1, normalizedProtocol)));
          utxoIndex++; // = 2

          // [1] Repay debt using UTXO[1]
          postInstructions.push(
            createProtocolInstruction(
              normalizedProtocol,
              encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, eulerContextEncoded, 1)
            )
          );
          const repayRefundUtxo = utxoIndex++; // = 3

          // [2] Withdraw collateral using UTXO[0] (actualSellAmount)
          postInstructions.push(
            createProtocolInstruction(
              normalizedProtocol,
              encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedTo.address, userAddress, 0n, eulerContextEncoded, 0)
            )
          );
          const withdrawUtxo = utxoIndex++; // = 4

          // [3] Push withdrawn collateral to manager for flash loan repayment
          postInstructions.push(createRouterInstruction(encodePushToken(withdrawUtxo, conditionalOrderManagerAddress)));

          // [4] Return repay refund to user (if closing entire position)
          if (isMax) {
            postInstructions.push(createRouterInstruction(encodePushToken(repayRefundUtxo, userAddress)));
          }

          return {
            preInstructions: [],
            postInstructions,
            flashLoanRepaymentUtxoIndex: withdrawUtxo,
          };
        });
    }

    // Standard flow for other protocols (Aave, Compound, Venus, Morpho)
    return Array(numChunksVal)
      .fill(null)
      .map(() => {
        const postInstructions: ProtocolInstruction[] = [];
        // UTXO layout after manager injects:
        // [0] = actualSellAmount (collateral sold)
        // [1] = actualBuyAmount (debt received) - already in router, no PullToken needed
        let utxoIndex = 2;

        // [0] Approve UTXO[1] (debt tokens already in router) for repayment
        postInstructions.push(createRouterInstruction(encodeApprove(1, normalizedProtocol)));
        utxoIndex++; // = 2

        // [1] Repay debt using UTXO[1]
        postInstructions.push(
          createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, context as Hex || "0x", 1)
          )
        );
        const repayRefundUtxo = utxoIndex++; // = 3

        // [2] Withdraw collateral using UTXO[0] (actualSellAmount)
        postInstructions.push(
          createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedTo.address, userAddress, 0n, context as Hex || "0x", 0)
          )
        );
        const withdrawUtxo = utxoIndex++; // = 4

        // [3] Push withdrawn collateral to manager for flash loan repayment
        postInstructions.push(createRouterInstruction(encodePushToken(withdrawUtxo, conditionalOrderManagerAddress)));

        // [4] Return repay refund to user (if closing entire position)
        if (isMax) {
          postInstructions.push(createRouterInstruction(encodePushToken(repayRefundUtxo, userAddress)));
        }

        return {
          preInstructions: [],
          postInstructions,
          flashLoanRepaymentUtxoIndex: withdrawUtxo,
        };
      });
  }, [
    selectedTo,
    userAddress,
    conditionalOrderManagerAddress,
    cowFlashLoanInfo,
    limitOrderConfig?.numChunks,
    protocolName,
    isEuler,
    eulerContextEncoded,
    eulerBorrowVault,
    eulerCollateralVaults,
    debtToken,
    context,
    isMax,
  ]);

  // ============ Build Flow (Market Orders) ============
  const buildFlow = useCallback((): ProtocolInstruction[] => {
    if (!swapQuote || !selectedTo || !hasAdapter || requiredCollateral === 0n) return [];

    const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;
    const isAave = providerEnum === FlashLoanProvider.Aave || providerEnum === FlashLoanProvider.ZeroLend;
    const swapMinAmountOut = isAave
      ? repayAmountRaw + (repayAmountRaw * AAVE_FLASH_LOAN_FEE_BPS) / 10000n
      : repayAmountRaw;

    // Euler custom flow
    if (isEuler && eulerContextEncoded && userAddress) {
      const swapProtocol = swapRouter === "1inch" ? "oneinch" : swapRouter === "kyber" ? "kyber" : "pendle";
      const swapContext = encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
        [debtToken as Address, swapMinAmountOut, swapQuote.tx.data as Hex]
      );

      const instructions: ProtocolInstruction[] = [];

      instructions.push(createRouterInstruction(encodeToOutput(requiredCollateral, selectedTo.address)));
      instructions.push(createRouterInstruction(encodeFlashLoan(providerEnum, 0)));
      instructions.push(createRouterInstruction(encodeApprove(1, swapProtocol)));
      instructions.push(
        createProtocolInstruction(
          swapProtocol,
          encodeLendingInstruction(LendingOp.Swap, selectedTo.address, userAddress, 0n, swapContext, 1)
        )
      );
      const normalizedProtocol = normalizeProtocolName(protocolName);
      instructions.push(createRouterInstruction(encodeApprove(3, normalizedProtocol)));
      instructions.push(
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, eulerContextEncoded, 3)
        )
      );
      instructions.push(
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedTo.address, userAddress, 0n, eulerContextEncoded, 0)
        )
      );
      instructions.push(createRouterInstruction(encodePushToken(6, userAddress)));
      instructions.push(createRouterInstruction(encodePushToken(4, userAddress)));

      return instructions;
    }

    // Standard flow
    return buildCloseWithCollateralFlow(
      protocolName,
      selectedTo.address,
      debtToken,
      requiredCollateral,
      swapMinAmountOut,
      swapQuote.tx.data,
      providerEnum,
      context,
      isMax,
      swapRouter === "1inch" ? "oneinch" : swapRouter === "kyber" ? "kyber" : "pendle"
    );
  }, [
    swapQuote,
    selectedTo,
    hasAdapter,
    requiredCollateral,
    selectedProvider,
    repayAmountRaw,
    isEuler,
    eulerContextEncoded,
    userAddress,
    swapRouter,
    debtToken,
    buildCloseWithCollateralFlow,
    protocolName,
    context,
    isMax,
  ]);

  // ============ Transaction Handlers ============
  const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Position closed successfully!",
    emptyFlowErrorMessage: "Failed to build close instructions",
    simulateWhenBatching: true,
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

  const handleSwapWrapper = useCallback(async () => {
    const txBeginProps = {
      network: "evm",
      protocol: protocolName,
      chainId,
      debtToken,
      debtName,
      collateralToken: selectedTo?.address ?? null,
      collateralName: selectedTo?.symbol ?? null,
      amountIn,
      isMax,
      slippage,
      preferBatching,
      flashLoanProvider: selectedProvider?.name ?? null,
      swapRouter,
      market: context ?? null,
    } satisfies Record<string, string | number | boolean | null>;

    try {
      setIsSubmitting(true);
      track("close_with_collateral_tx_begin", txBeginProps);
      await handleSwap(amountIn, isMax);
      track("close_with_collateral_tx_complete", { ...txBeginProps, status: "success" });
    } catch (e) {
      track("close_with_collateral_tx_complete", {
        ...txBeginProps,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    protocolName,
    chainId,
    debtToken,
    debtName,
    selectedTo?.address,
    selectedTo?.symbol,
    amountIn,
    isMax,
    slippage,
    preferBatching,
    selectedProvider?.name,
    swapRouter,
    context,
    handleSwap,
  ]);

  // Conditional Order Submit Handler (new system)
  const handleLimitOrderSubmit = useCallback(async () => {
    if (!selectedTo || !userAddress || !conditionalOrderManagerAddress || !walletClient || !publicClient) {
      throw new Error("Missing required data for conditional order");
    }
    if (!cowFlashLoanInfo || !limitPriceTriggerAddress || !conditionalOrderTriggerParams) {
      throw new Error("Missing trigger or flash loan configuration");
    }

    const analyticsProps = createLimitOrderAnalyticsProps({
      protocolName,
      chainId,
      debtToken,
      debtName,
      selectedTo,
      repayAmountRaw,
      debtDecimals,
      limitOrderCollateral: effectiveLimitOrderCollateral,
      requiredCollateral,
      flashLoanProviderName: limitOrderConfig?.selectedProvider?.name ?? "unknown",
    });

    setIsLimitSubmitting(true);

    try {
      track("close_with_collateral_conditional_order_begin", analyticsProps);

      logLimitOrderBuildStart({
        selectedTo,
        debtName,
        limitOrderCollateral: effectiveLimitOrderCollateral,
        repayAmountRaw,
        debtDecimals,
        cowFlashLoanInfo,
        cowQuote,
      });

      // Get the first chunk's instructions (for close position, typically single chunk)
      const instructionsData = buildConditionalOrderInstructionsData[0] || { preInstructions: [], postInstructions: [] };

      const result = await buildConditionalOrderCalls({
        triggerAddress: limitPriceTriggerAddress,
        triggerStaticData: conditionalOrderTriggerParams,
        sellToken: selectedTo.address as Address,
        buyToken: debtToken as Address,
        preInstructions: instructionsData.preInstructions,
        postInstructions: instructionsData.postInstructions,
        maxIterations: numChunks,
        flashLoan: {
          lender: cowFlashLoanInfo.lender as Address,
          token: selectedTo.address as Address,
          // Include slippage buffer to match trigger's totalSellAmount calculation
          // BUY orders have maxSellAmount = collateral * (1 + slippage), so flash loan must cover that
          amount: (effectiveLimitOrderCollateral * BigInt(10000 + Math.round(slippage * 100))) / 10000n / BigInt(numChunks),
        },
        sellTokenRefundAddress: getKapanCowAdapter(chainId) as Address, // KapanCowAdapter for flash loan repayment
        operationType: "close-position",
        protocolName,
        isKindBuy: true, // BUY order: exact buyAmount, max sellAmount
      });

      if (!result || !result.success) {
        const errorMsg = result?.error || "Failed to build conditional order calls";
        notification.error(
          <TransactionToast step="failed" message={`CoW API Error: ${errorMsg}`} />
        );
        throw new Error(errorMsg);
      }

      // Save order note
      if (result.salt) {
        saveLimitOrderNote(result.salt, protocolName, selectedTo.symbol, debtName, chainId);
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

      const explorerUrl = getCowExplorerAddressUrl(chainId, userAddress);
      notification.success(
        <TransactionToast
          step="confirmed"
          message="Conditional order created!"
          blockExplorerLink={explorerUrl}
        />
      );

      const orderHash = extractOrderHash(receipts, conditionalOrderManagerAddress) ?? undefined;

      if (result.salt && selectedTo) {
        saveOrder.mutate({
          orderUid: result.salt,
          orderHash,
          salt: result.salt,
          userAddress,
          chainId,
          orderType: "close_position",
          protocol: protocolName,
          sellToken: selectedTo.address,
          buyToken: debtToken,
          sellTokenSymbol: selectedTo.symbol,
          buyTokenSymbol: debtName,
          sellAmount: effectiveLimitOrderCollateral.toString(),
          buyAmount: repayAmountRaw.toString(),
        });

        if (orderHash && effectiveLimitOrderCollateral > 0n && repayAmountRaw > 0n) {
          const quoteRate = Number(effectiveLimitOrderCollateral) / Number(repayAmountRaw);
          storeOrderQuoteRate(chainId, orderHash, quoteRate);
        }
      }

      track("close_with_collateral_conditional_order_complete", { ...analyticsProps, status: "success" });
      onClose();
    } catch (e) {
      track("close_with_collateral_conditional_order_complete", {
        ...analyticsProps,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      notification.error(
        <TransactionToast step="failed" message={e instanceof Error ? e.message : "Order creation failed"} />
      );
      throw e;
    } finally {
      setIsLimitSubmitting(false);
    }
  }, [
    selectedTo,
    userAddress,
    conditionalOrderManagerAddress,
    walletClient,
    publicClient,
    cowFlashLoanInfo,
    limitPriceTriggerAddress,
    conditionalOrderTriggerParams,
    protocolName,
    chainId,
    debtToken,
    debtName,
    repayAmountRaw,
    debtDecimals,
    effectiveLimitOrderCollateral,
    requiredCollateral,
    limitOrderConfig?.selectedProvider?.name,
    cowQuote,
    buildConditionalOrderInstructionsData,
    buildConditionalOrderCalls,
    numChunks,
    onClose,
    saveOrder,
  ]);

  // ============ Can Submit ============
  // Block submission if quote doesn't cover debt (would revert on-chain)
  const quoteCoversDebt = !quoteShortfall;
  const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && hasEnoughCollateral && hasAdapter && quoteCoversDebt;
  const canSubmitLimit =
    executionType === "limit" &&
    conditionalOrderReady &&
    !!cowFlashLoanInfo &&
    parseFloat(amountIn) > 0 &&
    hasEnoughCollateralForLimit &&
    !!conditionalOrderManagerAddress &&
    !!conditionalOrderTriggerParams &&
    effectiveLimitOrderCollateral > 0n;
  const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

  const submitLabel = executionType === "market" ? "Close Position" : "Create Limit Order";

  // ============ Price Impact ============
  const expectedOutput = swapQuote ? formatUnits(BigInt(swapQuote.dstAmount), debtDecimals) : "0";
  const outputCoversRepay = swapQuote ? BigInt(swapQuote.dstAmount) >= repayAmountRaw : false;

  const srcUsdFallback = useMemo(() => {
    if (!selectedTo?.price || requiredCollateral === 0n) return undefined;
    const amount = parseFloat(formatUnits(requiredCollateral, selectedTo.decimals));
    if (amount <= 0) return undefined;
    return amount * Number(formatUnits(selectedTo.price, 8));
  }, [selectedTo?.price, selectedTo?.decimals, requiredCollateral]);

  const dstUsdFallback = useMemo(() => {
    if (!debtPrice || !expectedOutput) return undefined;
    const parsed = parseFloat(expectedOutput);
    if (isNaN(parsed) || parsed <= 0) return undefined;
    return parsed * Number(formatUnits(debtPrice, 8));
  }, [debtPrice, expectedOutput]);

  const { priceImpact, formattedPriceImpact } = useAutoSlippage({
    slippage,
    setSlippage,
    oneInchQuote: oneInchSwapQuote,
    pendleQuote: pendleQuoteData,
    swapRouter,
    resetDep: selectedTo?.address,
    srcUsdFallback,
    dstUsdFallback,
  });

  // ============ Execution Type Handler ============
  const handleExecutionTypeChange = useCallback(
    (type: ExecutionType) => {
      setExecutionType(type);
      if (type === "limit" && slippage < 1) setSlippage(1);
    },
    [slippage]
  );

  // Prefer Morpho for limit orders
  useEffect(() => {
    if (executionType === "limit" && flashLoanProviders && flashLoanProviders.length > 0) {
      const morphoProvider = flashLoanProviders.find(p => p.name.toLowerCase().includes("morpho"));
      if (morphoProvider && selectedProvider?.name !== morphoProvider.name) {
        setSelectedProvider(morphoProvider);
      }
    }
  }, [executionType, flashLoanProviders, selectedProvider, setSelectedProvider]);

  // ============ Custom Amount Out Handler ============
  const handleAmountOutChange = useCallback((value: string) => {
    setCustomBuyAmount(value);
    setUseCustomBuyAmount(true);
  }, []);

  // ============ UI Components ============
  const rightPanel: ReactNode = useMemo(
    () => (
      <div className="space-y-3">
        <ExecutionTypeToggle
          value={executionType}
          onChange={handleExecutionTypeChange}
          limitAvailable={cowAvailable}
          limitReady={conditionalOrderReady}
        />

        {executionType === "market" && (
          <div className="space-y-2 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-base-content/50">Slippage</span>
                <select
                  className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                  value={slippage}
                  onChange={e => setSlippage(parseFloat(e.target.value))}
                >
                  {[0.1, 0.3, 0.5, 1, 3].map(s => (
                    <option key={s} value={s}>
                      {s}%
                    </option>
                  ))}
                </select>
              </div>
              {flashLoanProviders && flashLoanProviders.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/50">Flash Loan</span>
                  <select
                    className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                    value={selectedProvider?.name || ""}
                    onChange={e => {
                      const p = flashLoanProviders.find(provider => provider.name === e.target.value);
                      if (p) setSelectedProvider(p);
                    }}
                  >
                    {flashLoanProviders.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="border-base-300/30 space-y-1 border-t pt-2">
              {priceImpact !== undefined && priceImpact !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/50">Price Impact</span>
                  <span className={priceImpact > 1 ? "text-warning" : priceImpact > 3 ? "text-error" : "text-base-content/80"}>
                    {formattedPriceImpact || `${priceImpact.toFixed(2)}%`}
                  </span>
                </div>
              )}
              {exchangeRate && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/50">Rate</span>
                  <span className="text-base-content/80">1:{parseFloat(exchangeRate).toFixed(2)}</span>
                </div>
              )}
              {swapQuote && expectedOutput && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/50">Output</span>
                  <span
                    className={
                      outputCoversRepay === false
                        ? "text-warning"
                        : outputCoversRepay === true
                        ? "text-success"
                        : "text-base-content/80"
                    }
                  >
                    {parseFloat(expectedOutput).toFixed(4)} {debtName}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {executionType === "limit" && selectedTo && (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-base-content/50">Order Type</span>
              <Tooltip
                content="You are buying debt tokens to repay your position. The collateral amount you specify is the maximum you're willing to sell. If the market moves in your favor, you may sell less and keep the surplus."
                delayDuration={100}
              >
                <span className="text-info flex cursor-help items-center gap-1 font-medium">
                  Buy Order
                  <InformationCircleIcon className="size-3" />
                </span>
              </Tooltip>
            </div>

            {limitOrderConfig?.selectedProvider && (
              <div className="flex items-center justify-between">
                <span className="text-base-content/50">Flash Loan</span>
                <span className="text-base-content/80 font-medium">{limitOrderConfig.selectedProvider.provider}</span>
              </div>
            )}

            {selectedTo && limitOrderCollateral > 0n && repayAmountRaw > 0n && (
              <div className="bg-base-200/50 space-y-1 rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="text-base-content/50">Limit Price</span>
                  <span className="text-base-content/80 font-medium">
                    {isCowQuoteLoading ? (
                      <span className="loading loading-dots loading-xs" />
                    ) : (
                      `1 ${debtName} = ${(
                        Number(formatUnits(limitOrderCollateral, selectedTo.decimals)) /
                        Number(formatUnits(repayAmountRaw, debtDecimals))
                      ).toFixed(4)} ${selectedTo.symbol}`
                    )}
                  </span>
                </div>
                {exchangeRate && (
                  <div className="text-center text-[10px]">
                    {(() => {
                      const limitRate =
                        Number(formatUnits(limitOrderCollateral, selectedTo.decimals)) /
                        Number(formatUnits(repayAmountRaw, debtDecimals));
                      const marketRate = parseFloat(exchangeRate);
                      const pctDiff = ((limitRate - marketRate) / marketRate) * 100;
                      const isAbove = pctDiff > 0;
                      const absDiff = Math.abs(pctDiff);
                      if (absDiff < 0.01) return <span className="text-base-content/40">at market price</span>;
                      return (
                        <span className={isAbove ? "text-warning" : "text-success"}>
                          {absDiff.toFixed(2)}% {isAbove ? "above" : "below"} market
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {selectedTo && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-base-content/50">Chunks</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="border-base-300 bg-base-200 text-base-content/80 w-14 rounded border px-2 py-0.5 text-right text-xs font-medium"
                    value={numChunks}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 1;
                      setNumChunks(Math.max(1, Math.min(100, val)));
                    }}
                  />
                </div>
                {numChunks > 1 && limitOrderCollateral > 0n && (
                  <div className="text-base-content/50 text-[10px]">
                    Max {formatUnits(limitOrderCollateral / BigInt(numChunks), selectedTo.decimals).slice(0, 8)}{" "}
                    {selectedTo.symbol} per chunk
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    ),
    [
      executionType,
      handleExecutionTypeChange,
      cowAvailable,
      conditionalOrderReady,
      slippage,
      priceImpact,
      formattedPriceImpact,
      exchangeRate,
      debtName,
      swapQuote,
      expectedOutput,
      outputCoversRepay,
      flashLoanProviders,
      selectedProvider,
      setSelectedProvider,
      selectedTo,
      limitOrderConfig,
      numChunks,
      limitOrderCollateral,
      isCowQuoteLoading,
      repayAmountRaw,
      debtDecimals,
    ]
  );

  const infoContent: ReactNode = useMemo(
    () => (
      <div className="space-y-4 py-2">
        <div className="alert alert-info bg-info/10 border-info/20 text-sm">
          <InformationCircleIcon className="size-5 flex-shrink-0" />
          <span>
            <strong>How Close with Collateral Works</strong>
            <br />
            This feature allows you to repay your debt by selling collateral, closing your position in one transaction.
          </span>
        </div>

        <div className="space-y-4 px-2">
          <InfoStep step={1} title="Withdraw Collateral" isLast={false}>
            <p className="text-base-content/70 text-xs">Your collateral is withdrawn from the protocol.</p>
          </InfoStep>

          <InfoStep step={2} title="Swap" isLast={false}>
            <p className="text-base-content/70 text-xs">
              Collateral is swapped for the debt token using{" "}
              {swapRouter === "kyber" ? "Kyber" : swapRouter === "1inch" ? "1inch" : "Pendle"}.
            </p>
          </InfoStep>

          <InfoStep step={3} title="Repay Debt" isLast={true}>
            <p className="text-base-content/70 text-xs">Your debt is repaid with the swapped tokens.</p>
          </InfoStep>
        </div>

        <div className="text-base-content/60 mt-4 text-xs">
          Total debt: {formatUnits(debtBalance, debtDecimals)} {debtName}
        </div>
      </div>
    ),
    [swapRouter, debtBalance, debtDecimals, debtName]
  );

  const warnings: ReactNode = useMemo(() => {
    const showInsufficientCollateralWarning = !hasEnoughCollateral && requiredCollateral > 0n && selectedTo;
    const showFromMismatchWarning =
      (swapRouter === "1inch" || swapRouter === "kyber") &&
      swapQuote &&
      activeAdapter &&
      "from" in swapQuote.tx &&
      swapQuote.tx.from?.toLowerCase() !== activeAdapter.address.toLowerCase();
    const showNoAdapterWarning = !hasAdapter && isOpen;
    // Quote shortfall: swap output doesn't cover debt - need higher slippage
    const showQuoteShortfallWarning = !!quoteShortfall && executionType === "market";
    const hasAnyWarning = showInsufficientCollateralWarning || showFromMismatchWarning || showNoAdapterWarning || showQuoteShortfallWarning;

    return (
      <div className="min-h-[24px]">
        {hasAnyWarning && (
          <div className="text-warning/90 flex items-start gap-1.5 text-xs">
            <ExclamationTriangleIcon className="mt-0.5 size-3.5 flex-shrink-0" />
            <span>
              {showQuoteShortfallWarning && quoteShortfall && (
                <>
                  Quote output ({formatUnits(quoteShortfall.received, debtDecimals).slice(0, 8)} {debtName}) is less than debt.
                  Increase slippage to {Math.ceil(slippage + (quoteShortfall.ratio - 1) * 100 + 0.5)}% or higher.
                </>
              )}
              {showInsufficientCollateralWarning && !showQuoteShortfallWarning && (
                <>
                  Need ~{requiredCollateralFormatted} {selectedTo.symbol}, have{" "}
                  {Number(formatUnits(selectedTo.rawBalance, selectedTo.decimals)).toFixed(4)}
                </>
              )}
              {showFromMismatchWarning && !showQuoteShortfallWarning && "Quote address mismatch"}
              {showNoAdapterWarning && !showQuoteShortfallWarning &&
                `${swapRouter === "kyber" ? "Kyber" : swapRouter === "1inch" ? "1inch" : "Pendle"} adapter unavailable`}
            </span>
          </div>
        )}
      </div>
    );
  }, [
    hasEnoughCollateral,
    requiredCollateral,
    selectedTo,
    requiredCollateralFormatted,
    swapRouter,
    swapQuote,
    activeAdapter,
    hasAdapter,
    isOpen,
    quoteShortfall,
    executionType,
    debtDecimals,
    debtName,
    slippage,
  ]);

  const limitPriceButtons: ReactNode = useMemo(() => {
    if (executionType !== "limit" || !selectedTo || limitOrderCollateral === 0n) return null;

    const adjustByPercent = (delta: number) => {
      const currentAmount =
        useCustomBuyAmount && customBuyAmount
          ? parseFloat(customBuyAmount)
          : Number(formatUnits(limitOrderCollateral, selectedTo.decimals));
      if (isNaN(currentAmount)) return;
      const newAmount = currentAmount * (1 + delta / 100);
      setCustomBuyAmount(newAmount.toFixed(6));
      setUseCustomBuyAmount(true);
    };

    const resetToMarket = () => {
      const exactMarket = formatUnits(limitOrderCollateral, selectedTo.decimals);
      setCustomBuyAmount(exactMarket);
      setUseCustomBuyAmount(true);
    };

    return (
      <div className="flex flex-wrap items-center justify-center gap-1 py-1">
        {[-1, -0.5, -0.1, -0.01].map(delta => (
          <button
            key={delta}
            onClick={() => adjustByPercent(delta)}
            className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]"
          >
            {delta}%
          </button>
        ))}
        <button onClick={resetToMarket} className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]">
          Market
        </button>
        {[0.01, 0.1, 0.5, 1].map(delta => (
          <button
            key={delta}
            onClick={() => adjustByPercent(delta)}
            className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]"
          >
            +{delta}%
          </button>
        ))}
      </div>
    );
  }, [executionType, selectedTo, limitOrderCollateral, useCustomBuyAmount, customBuyAmount]);

  // Hide dropdown when there's only one collateral option
  const singleCollateral = toAssets.length === 1;
  const fromAssetsArray = useMemo(() => [fromAsset], [fromAsset]);

  // Determine which quote loading and submit handler to use
  const isMarketExecution = executionType === "market";
  const quoteLoadingProp = isMarketExecution ? isQuoteLoading : isCowQuoteLoading || isInputSettling;
  const quoteErrorProp = isMarketExecution ? quoteError : null;
  const preferBatchingProp = isMarketExecution ? preferBatching : undefined;
  const setPreferBatchingProp = isMarketExecution ? setPreferBatching : undefined;
  const onSubmitHandler = isMarketExecution ? handleSwapWrapper : handleLimitOrderSubmit;
  const isSubmittingProp = isMarketExecution ? isSubmitting : isLimitSubmitting;

  // ============ Return Config ============
  return {
    // Operation identity
    operationType: "close-position",
    title: "Close with Collateral",
    protocolName,

    // Token configuration
    fromAssets: fromAssetsArray,
    toAssets,
    selectedFrom,
    selectedTo,
    setSelectedFrom,
    setSelectedTo,
    fromReadOnly: true,
    toReadOnly: singleCollateral,
    fromLabel: "Debt to Repay",
    toLabel: "Collateral to Sell",

    // Amount state
    amountIn,
    setAmountIn,
    isMax,
    setIsMax,
    amountOut,

    // Quote state
    isQuoteLoading: quoteLoadingProp,
    quoteError: quoteErrorProp,
    priceImpact,

    // Slippage
    slippage,
    setSlippage,

    // Execution
    executionType,
    setExecutionType: handleExecutionTypeChange,
    isSubmitting: isSubmittingProp,
    canSubmit,
    submitLabel,
    onSubmit: onSubmitHandler,

    // Batching
    preferBatching: preferBatchingProp,
    setPreferBatching: setPreferBatchingProp,

    // UI customization
    infoContent,
    warnings,
    rightPanel,
    hideDefaultStats: true,
    onAmountOutChange: executionType === "limit" ? handleAmountOutChange : undefined,
    limitPriceButtons,
  };
}

// ============ Helper Components ============

interface InfoStepProps {
  step: number;
  title: string;
  isLast: boolean;
  children: React.ReactNode;
}

const InfoStep: React.FC<InfoStepProps> = ({ step, title, isLast, children }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">
        {step}
      </div>
      {!isLast && <div className="bg-base-300 my-1 h-full w-0.5"></div>}
    </div>
    <div className={isLast ? "" : "pb-4"}>
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  </div>
);

export default useClosePositionConfig;
