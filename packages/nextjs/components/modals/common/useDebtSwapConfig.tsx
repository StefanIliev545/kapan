/**
 * Configuration hook for DebtSwapModal.
 *
 * This hook encapsulates all the state and logic for debt swaps,
 * providing a clean interface that can be used with SwapModalShell.
 *
 * Debt swaps are complex operations that:
 * - REQUIRE flash loans to swap debt atomically
 * - Support both market orders (1inch/Kyber/Pendle) and limit orders (CoW)
 * - Handle protocol-specific logic:
 *   - Morpho: Collateral withdrawal/deposit when switching markets
 *   - Euler: Sub-account migration to avoid controller conflicts
 *   - Aave/Compound/Venus: Standard shared-pool model
 */

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { formatUnits, parseUnits, Address, type TransactionReceipt } from "viem";
import { useDebounceValue } from "usehooks-ts";
import { track } from "@vercel/analytics";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";

// Hooks
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData, type FlashLoanProviderOption } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import {
  useCowConditionalOrder,
  encodeLimitPriceTriggerParams,
  getProtocolId,
  type ConditionalOrderInstructions,
} from "~~/hooks/useCowConditionalOrder";
import { useCowQuote } from "~~/hooks/useCowQuote";
import { useMorphoDebtSwapMarkets, marketToContext } from "~~/hooks/useMorphoDebtSwapMarkets";
import { useEulerDebtSwapVaults } from "~~/hooks/useEulerDebtSwapVaults";
import { useSaveOrder } from "~~/hooks/useOrderHistory";

// Utils
import { parseAmount } from "~~/utils/validation";
import {
  FlashLoanProvider,
  ProtocolInstruction,
  normalizeProtocolName,
  encodeMorphoContext,
  encodeEulerContext,
  calculateLimitPrice,
  type MorphoMarketContextForEncoding,
} from "~~/utils/v2/instructionHelpers";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getCowFlashLoanProviders, getPreferredFlashLoanLender, calculateFlashLoanFee, storeOrderQuoteRate, getCowExplorerAddressUrl, getKapanCowAdapter } from "~~/utils/cow";
import { is1inchSupported, isKyberSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getKyberAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { extractOrderHash } from "~~/utils/orderHashExtractor";

// Types
import type { SwapAsset, SwapRouter } from "../SwapModalShell";
import type { LimitOrderResult } from "~~/components/LimitOrderConfig";
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import type { SwapOperationConfig, UseDebtSwapConfigProps, ExecutionType, FlashLoanConfig, LimitOrderConfig } from "./swapConfigTypes";

// Helper imports from debtSwapEvmHelpers
import {
  trackModalOpen,
  buildCowFlashLoanInfo,
  calculateRequiredNewDebt,
  calculateLimitOrderNewDebt,
  calculateDustBuffer,
} from "../debtSwapEvmHelpers";
import { saveOrderNote, createDebtSwapNote, dispatchOrderCreated } from "~~/utils/orderNotes";
import {
  resolveAvailableRouter,
  getRouterDisplayName,
  resolveSwapProtocol,
  resolveTriggerContext,
  buildMorphoMaxConditionalPost,
  buildMorphoChunkConditionalPost,
  buildEulerConditionalPost,
  buildStandardConditionalPost,
  buildMorphoMarketFlow,
  buildEulerMarketFlow,
} from "./debtSwapHelpers";

// ============================================================================
// Extended Props with Protocol-Specific Fields
// ============================================================================

interface ExtendedDebtSwapConfigProps extends UseDebtSwapConfigProps {
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
  /** Success callback */
  onSuccess?: () => void;
}

/** Euler collateral info for debt swap with sub-account migration */
export interface EulerCollateralInfo {
  /** Vault address (where shares are held) */
  vaultAddress: string;
  /** Underlying token address */
  tokenAddress: string;
  /** Underlying token symbol */
  tokenSymbol: string;
  /** Token decimals */
  decimals: number;
  /** User's collateral balance (shares) */
  balance: bigint;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that provides all configuration for a debt swap operation.
 *
 * Returns a SwapOperationConfig that can be spread into SwapModalShell.
 */
export function useDebtSwapConfig(props: ExtendedDebtSwapConfigProps): SwapOperationConfig {
  const {
    isOpen,
    onClose,
    chainId,
    protocolName,
    debtFromToken,
    debtFromName,
    debtFromIcon,
    debtFromDecimals,
    debtFromPrice,
    currentDebtBalance,
    availableAssets,
    context,
    // Morpho-specific
    morphoContext,
    collateralTokenAddress,
    collateralTokenSymbol: _collateralTokenSymbol,
    collateralBalance,
    collateralDecimals: _collateralDecimals,
    // Euler-specific
    eulerBorrowVault,
    eulerCollateralVaults,
    eulerSubAccountIndex,
    eulerUsedSubAccountIndices,
    eulerCollaterals,
    onSuccess,
  } = props;

  // Suppress unused variable warnings for reserved future display
  void _collateralTokenSymbol;
  void _collateralDecimals;

  const { buildDebtSwapFlow } = useKapanRouterV2({ chainId });
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });

  // ============ Protocol Detection ============
  const isMorpho = protocolName.toLowerCase().includes("morpho");
  const isEuler = protocolName.toLowerCase().includes("euler");

  // ============ Morpho Market Discovery ============
  const { targetMarkets: morphoTargetMarkets } = useMorphoDebtSwapMarkets({
    chainId,
    collateralTokenAddress: collateralTokenAddress || "",
    currentDebtAddress: debtFromToken,
    enabled: isMorpho && isOpen && !!collateralTokenAddress,
  });

  const [selectedMorphoMarket, setSelectedMorphoMarket] = useState<MorphoMarket | null>(null);

  const oldMorphoContextEncoded = useMemo(() => {
    if (!isMorpho || !morphoContext) return undefined;
    return encodeMorphoContext(morphoContext as MorphoMarketContextForEncoding);
  }, [isMorpho, morphoContext]);

  const newMorphoContext = useMemo(() => {
    if (!selectedMorphoMarket) return undefined;
    return marketToContext(selectedMorphoMarket);
  }, [selectedMorphoMarket]);

  const newMorphoContextEncoded = useMemo(() => {
    if (!newMorphoContext) return undefined;
    return encodeMorphoContext(newMorphoContext as MorphoMarketContextForEncoding);
  }, [newMorphoContext]);

  // ============ Euler Vault Discovery ============
  const { targetVaultsByAddress: eulerTargetVaults } = useEulerDebtSwapVaults({
    chainId,
    currentDebtTokenAddress: debtFromToken,
    userCollateralVaultAddresses: eulerCollateralVaults || [],
    enabled: isEuler && isOpen && !!eulerBorrowVault && (eulerCollateralVaults?.length ?? 0) > 0,
  });

  // Euler sub-account management
  const oldSubAccountIndex = eulerSubAccountIndex ?? 0;
  const newSubAccountIndex = useMemo(() => {
    const usedSet = new Set(eulerUsedSubAccountIndices ?? [oldSubAccountIndex]);
    for (let i = 1; i < 256; i++) {
      const candidate = (oldSubAccountIndex + i) % 256;
      if (!usedSet.has(candidate)) return candidate;
    }
    return (oldSubAccountIndex + 1) % 256;
  }, [oldSubAccountIndex, eulerUsedSubAccountIndices]);

  const oldEulerContextEncoded = useMemo(() => {
    if (!isEuler || !eulerBorrowVault || !eulerCollateralVaults?.length) return undefined;
    return encodeEulerContext({
      borrowVault: eulerBorrowVault as Address,
      collateralVault: eulerCollateralVaults as Address[],
      subAccountIndex: oldSubAccountIndex,
    });
  }, [isEuler, eulerBorrowVault, eulerCollateralVaults, oldSubAccountIndex]);

  // ============ Swap Router Availability ============
  const oneInchAvailable = is1inchSupported(chainId);
  const kyberAvailable = isKyberSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const cowAvailable = isCowProtocolSupported(chainId);
  const oneInchAdapter = getOneInchAdapterInfo(chainId);
  const kyberAdapter = getKyberAdapterInfo(chainId);
  const pendleAdapter = getPendleAdapterInfo(chainId);
  const defaultRouter = getDefaultSwapRouter(chainId);

  const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "kyber");

  const activeAdapter = swapRouter === "kyber" ? kyberAdapter : swapRouter === "pendle" ? pendleAdapter : oneInchAdapter;
  const hasAdapter = swapRouter === "kyber" ? !!kyberAdapter : swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;

  // Update swap router if current one becomes unavailable (e.g., chain change)
  useEffect(() => {
    const avail: Record<string, boolean> = { kyber: kyberAvailable, "1inch": oneInchAvailable, pendle: pendleAvailable };
    const fallback = resolveAvailableRouter(swapRouter, avail);
    if (fallback) setSwapRouter(fallback);
  }, [chainId, oneInchAvailable, kyberAvailable, pendleAvailable, swapRouter]);

  // ============ State ============
  const [amountIn, setAmountIn] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [slippage, setSlippage] = useState(0.1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executionType, setExecutionType] = useState<ExecutionType>("market");
  const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
  const [numChunks, setNumChunks] = useState(1);
  const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
  const [customBuyAmount, setCustomBuyAmount] = useState("");
  const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);

  // ============ Flash Loan Setup ============
  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen,
    networkType: "evm",
    fromProtocol: protocolName,
    chainId,
    position: { name: debtFromName, tokenAddress: debtFromToken, decimals: debtFromDecimals, type: "borrow" },
  });

  // ============ From Asset (Fixed) ============
  const fromAsset: SwapAsset = useMemo(() => ({
    symbol: debtFromName,
    address: debtFromToken,
    decimals: debtFromDecimals,
    rawBalance: currentDebtBalance,
    balance: parseFloat(formatUnits(currentDebtBalance, debtFromDecimals)),
    icon: debtFromIcon,
    price: debtFromPrice,
  }), [debtFromName, debtFromToken, debtFromDecimals, currentDebtBalance, debtFromIcon, debtFromPrice]);

  const fromAssets = useMemo(() => [fromAsset], [fromAsset]);
  const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
  const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);

  // Ensure from is always the debt token
  useEffect(() => {
    if (!selectedFrom || selectedFrom.address !== debtFromToken) {
      setSelectedFrom(fromAsset);
    }
  }, [selectedFrom, debtFromToken, fromAsset]);

  // ============ To Assets (Target Debts) ============
  const toAssets = useMemo(() => {
    if (isMorpho && morphoTargetMarkets.length > 0) {
      const seenAddresses = new Set<string>();
      return morphoTargetMarkets
        .filter(m => {
          const addr = m.loanAsset?.address?.toLowerCase();
          if (!addr || seenAddresses.has(addr)) return false;
          seenAddresses.add(addr);
          return true;
        })
        .map(m => ({
          symbol: m.loanAsset?.symbol || "???",
          address: (m.loanAsset?.address || "") as Address,
          decimals: m.loanAsset?.decimals || 18,
          rawBalance: 0n,
          balance: 0,
          icon: tokenNameToLogo(m.loanAsset?.symbol?.toLowerCase() || ""),
          price: m.loanAsset?.priceUsd ? BigInt(Math.round(Number(m.loanAsset.priceUsd) * 1e8)) : undefined,
          borrowApy: m.state.borrowApy,
          marketId: m.uniqueKey,
        } as SwapAsset));
    }

    if (isEuler && Object.keys(eulerTargetVaults).length > 0) {
      return Object.values(eulerTargetVaults).map(vault => ({
        symbol: vault.tokenSymbol,
        address: vault.tokenAddress as Address,
        decimals: vault.decimals,
        rawBalance: 0n,
        balance: 0,
        icon: tokenNameToLogo(vault.tokenSymbol.toLowerCase()),
        price: undefined,
        borrowApy: vault.borrowApy,
        eulerBorrowVault: vault.vaultAddress,
      } as SwapAsset));
    }

    return (availableAssets || []).filter(a => a.address.toLowerCase() !== debtFromToken.toLowerCase());
  }, [isMorpho, morphoTargetMarkets, isEuler, eulerTargetVaults, availableAssets, debtFromToken]);

  // Sync selected Morpho market
  useEffect(() => {
    if (!isMorpho || !selectedTo) {
      setSelectedMorphoMarket(null);
      return;
    }
    const market = morphoTargetMarkets.find(
      m => m.loanAsset?.address?.toLowerCase() === selectedTo.address.toLowerCase()
    );
    setSelectedMorphoMarket(market || null);
  }, [isMorpho, selectedTo, morphoTargetMarkets]);

  // Euler new context
  const newEulerContextEncoded = useMemo(() => {
    if (!isEuler || !selectedTo || !eulerCollateralVaults?.length) return undefined;
    const newBorrowVault = (selectedTo as SwapAsset & { eulerBorrowVault?: string }).eulerBorrowVault;
    if (!newBorrowVault) return undefined;
    return encodeEulerContext({
      borrowVault: newBorrowVault as Address,
      collateralVault: eulerCollateralVaults as Address[],
      subAccountIndex: newSubAccountIndex,
    });
  }, [isEuler, selectedTo, eulerCollateralVaults, newSubAccountIndex]);

  // Auto-switch to Pendle for PT tokens
  useEffect(() => {
    const fromIsPT = isPendleToken(debtFromName);
    const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);
    if ((fromIsPT || toIsPT) && pendleAvailable) {
      setSwapRouter("pendle");
    }
  }, [debtFromName, selectedTo, pendleAvailable]);

  // ============ Debounced Amount ============
  const [debouncedAmountIn] = useDebounceValue(amountIn, 300);
  const isInputSettling = amountIn !== debouncedAmountIn;

  const repayAmountRaw = useMemo(() => {
    const result = parseAmount(debouncedAmountIn || "0", debtFromDecimals);
    return result.value ?? 0n;
  }, [debouncedAmountIn, debtFromDecimals]);

  const bufferedRepayAmount = useMemo(() => {
    return isMax ? calculateDustBuffer(repayAmountRaw) : repayAmountRaw;
  }, [isMax, repayAmountRaw]);

  const limitOrderBuyAmount = useMemo(() => {
    return executionType === "limit" && isMax ? calculateDustBuffer(repayAmountRaw) : repayAmountRaw;
  }, [executionType, isMax, repayAmountRaw]);

  // ============ Unit Quote (for exchange rate) ============
  const unitQuoteAmount = useMemo(() => {
    if (!selectedTo) return "0";
    return parseUnits("1", selectedTo.decimals).toString();
  }, [selectedTo]);

  const { data: oneInchUnitQuote, isLoading: isOneInchUnitQuoteLoading } = use1inchQuoteOnly({
    chainId,
    src: selectedTo?.address as Address,
    dst: debtFromToken,
    amount: unitQuoteAmount,
    enabled: (kyberAvailable && swapRouter === "kyber" || oneInchAvailable && swapRouter === "1inch") && !!selectedTo && isOpen && executionType === "market",
  });

  const { data: pendleUnitQuote, isLoading: isPendleUnitQuoteLoading } = usePendleConvert({
    chainId,
    receiver: pendleAdapter?.address as Address,
    tokensIn: selectedTo?.address as Address,
    tokensOut: debtFromToken,
    amountsIn: unitQuoteAmount,
    slippage: 0.03,
    enabled: pendleAvailable && swapRouter === "pendle" && !!selectedTo && !!pendleAdapter && isOpen && unitQuoteAmount !== "0" && executionType === "market",
  });

  const isUnitQuoteLoading = swapRouter === "pendle" ? isPendleUnitQuoteLoading : isOneInchUnitQuoteLoading;

  // Calculate required new debt
  const { requiredNewDebt, requiredNewDebtFormatted, exchangeRate } = useMemo(() => {
    return calculateRequiredNewDebt({
      selectedTo,
      repayAmountRaw: bufferedRepayAmount,
      oneInchUnitQuote,
      pendleUnitQuote,
      debtFromDecimals,
      slippage,
    });
  }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, bufferedRepayAmount, debtFromDecimals, slippage]);

  // ============ Flash Loan Selection ============
  const { selectedProvider, setSelectedProvider } = useFlashLoanSelection({
    flashLoanProviders,
    defaultProvider: defaultFlashLoanProvider,
    tokenAddress: selectedTo?.address,
    amount: requiredNewDebt,
    chainId,
  });

  // ============ Swap Quote ============
  const minSwapAmount = selectedTo ? parseUnits("0.001", selectedTo.decimals) : 0n;
  const kyberSwapEnabled = kyberAvailable && swapRouter === "kyber" && requiredNewDebt > minSwapAmount && !!selectedTo && !!kyberAdapter && isOpen && executionType === "market";
  const oneInchSwapEnabled = oneInchAvailable && swapRouter === "1inch" && requiredNewDebt > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen && executionType === "market";
  const pendleSwapEnabled = pendleAvailable && swapRouter === "pendle" && requiredNewDebt > minSwapAmount && !!selectedTo && !!pendleAdapter && isOpen && executionType === "market";

  const { data: oneInchSwapQuote, isLoading: is1inchSwapQuoteLoading, error: oneInchQuoteError } = use1inchQuote({
    chainId,
    src: selectedTo?.address as Address,
    dst: debtFromToken,
    amount: requiredNewDebt.toString(),
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
    tokensOut: debtFromToken,
    amountsIn: requiredNewDebt.toString(),
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

  const isSwapQuoteLoading = swapRouter === "pendle" ? isPendleQuoteLoading : is1inchSwapQuoteLoading;
  const quoteError = swapRouter === "pendle" ? pendleQuoteError : oneInchQuoteError;
  const isQuoteLoading = isUnitQuoteLoading || isSwapQuoteLoading || isInputSettling;

  const expectedOutput = swapQuote ? formatUnits(BigInt(swapQuote.dstAmount), debtFromDecimals) : "0";
  const outputCoversRepay = swapQuote ? BigInt(swapQuote.dstAmount) >= repayAmountRaw : false;

  // Calculate the actual minAmountOut that matches 1inch/Kyber's slippage protection
  // This ensures our check matches what the aggregator's calldata enforces
  const swapMinAmountOut = useMemo(() => {
    if (!swapQuote) return repayAmountRaw;
    const dstAmount = BigInt(swapQuote.dstAmount);
    // Apply same slippage tolerance as the aggregator (slippage is in %, e.g., 1 = 1%)
    const slippageBps = BigInt(Math.round(slippage * 100));
    return (dstAmount * (10000n - slippageBps)) / 10000n;
  }, [swapQuote, slippage, repayAmountRaw]);

  // ============ CoW Quote for Limit Orders ============
  const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
    sellToken: selectedTo?.address || "",
    buyToken: debtFromToken,
    buyAmount: limitOrderBuyAmount.toString(),
    kind: "buy",
    from: userAddress || "",
    enabled: cowAvailable && executionType === "limit" && limitOrderBuyAmount > 0n && !!selectedTo && !!userAddress && isOpen,
  });

  const limitOrderNewDebt = useMemo(() => {
    return calculateLimitOrderNewDebt(cowQuote, selectedTo);
  }, [cowQuote, selectedTo]);

  const effectiveLimitOrderNewDebt = useMemo(() => {
    if (useCustomBuyAmount && customBuyAmount && selectedTo) {
      const parsed = parseAmount(customBuyAmount, selectedTo.decimals);
      if (parsed.value && parsed.value > 0n) return parsed.value;
    }
    return limitOrderNewDebt;
  }, [useCustomBuyAmount, customBuyAmount, selectedTo, limitOrderNewDebt]);

  // ============ CoW Conditional Order Setup ============
  const {
    buildOrderCalls: buildConditionalOrderCalls,
    isReady: conditionalOrderReady,
    managerAddress: conditionalOrderManagerAddress,
    limitPriceTriggerAddress,
  } = useCowConditionalOrder();
  const saveOrder = useSaveOrder();

  // Initialize limit order config
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

  // Flash loan info for limit orders
  const cowFlashLoanInfo = useMemo(() => {
    return buildCowFlashLoanInfo(chainId, limitOrderConfig, executionType, selectedTo, effectiveLimitOrderNewDebt);
  }, [chainId, limitOrderConfig, executionType, effectiveLimitOrderNewDebt, selectedTo]);

  // ============ Conditional Order Trigger Params ============
  const conditionalOrderTriggerParams = useMemo(() => {
    if (!selectedTo || !selectedTo.address || !debtFromToken || !limitPriceTriggerAddress || effectiveLimitOrderNewDebt === 0n || limitOrderBuyAmount === 0n) {
      return null;
    }

    const triggerContext = resolveTriggerContext(context, isMorpho, oldMorphoContextEncoded, isEuler, oldEulerContextEncoded);

    // For debt swap: selling new debt token to buy old debt token for repayment
    // limitPrice = (buyAmount / sellAmount) * 1e8
    const limitPrice = calculateLimitPrice(
      effectiveLimitOrderNewDebt, selectedTo.decimals,
      limitOrderBuyAmount, debtFromDecimals
    );

    // Debt swap is a BUY order: we want exact old debt amount (buyAmount) for repayment
    // totalSellAmount = max new debt we're willing to sell, totalBuyAmount = exact old debt to buy
    // For limit orders, user sets exact price - no slippage buffer needed
    return encodeLimitPriceTriggerParams({
      protocolId: getProtocolId(protocolName),
      protocolContext: triggerContext,
      sellToken: selectedTo.address,
      buyToken: debtFromToken as Address,
      sellDecimals: selectedTo.decimals,
      buyDecimals: debtFromDecimals,
      limitPrice,
      triggerAbovePrice: false,
      totalSellAmount: effectiveLimitOrderNewDebt, // Exact amount user is willing to sell
      totalBuyAmount: limitOrderBuyAmount, // Exact amount to buy (old debt for repayment)
      numChunks,
      maxSlippageBps: 0, // No slippage for limit orders - price is exact
      isKindBuy: true, // BUY order: exact buyAmount, max sellAmount
    });
  }, [selectedTo, limitPriceTriggerAddress, effectiveLimitOrderNewDebt, limitOrderBuyAmount, debtFromDecimals, protocolName, context, debtFromToken, numChunks, slippage, isMorpho, oldMorphoContextEncoded, isEuler, oldEulerContextEncoded]);

  // ============ Conditional Order Instructions Builder ============
  // For KapanConditionalOrderManager, post-hook UTXOs are:
  // UTXO[0] = actualSellAmount (new debt we're selling)
  // UTXO[1] = actualBuyAmount (old debt we received from swap)
  const buildConditionalOrderInstructionsData = useMemo((): ConditionalOrderInstructions => {
    const empty: ConditionalOrderInstructions = { preInstructions: [], postInstructions: [] };
    if (!selectedTo?.address || !debtFromToken || !userAddress) return empty;
    if (effectiveLimitOrderNewDebt === 0n || !conditionalOrderManagerAddress || !cowFlashLoanInfo) return empty;

    const normalizedProtocol = normalizeProtocolName(protocolName);

    // Morpho flow - pair-isolated markets require collateral migration
    if (isMorpho && oldMorphoContextEncoded && newMorphoContextEncoded && collateralTokenAddress && collateralBalance) {
      // Calculate proportional collateral based on debt ratio.
      // For partial swaps we only move collateral proportional to the debt being moved.
      // For isMax we move everything.
      const proportionalCollateral = isMax || currentDebtBalance === 0n
        ? collateralBalance
        : (collateralBalance * repayAmountRaw) / currentDebtBalance;

      // Max flow uses GetSupplyBalance to query full collateral on-chain;
      // chunk flow uses a fixed proportional amount (no GetSupplyBalance needed).
      const postInstructions = isMax && numChunks === 1
        ? buildMorphoMaxConditionalPost(normalizedProtocol, debtFromToken, userAddress, oldMorphoContextEncoded, newMorphoContextEncoded, collateralTokenAddress, selectedTo.address, conditionalOrderManagerAddress)
        : buildMorphoChunkConditionalPost(normalizedProtocol, debtFromToken, userAddress, oldMorphoContextEncoded, newMorphoContextEncoded, collateralTokenAddress, selectedTo.address, conditionalOrderManagerAddress, proportionalCollateral / BigInt(numChunks));
      return { preInstructions: [], postInstructions };
    }

    // Euler flow - sub-account isolation requires collateral migration
    if (isEuler && oldEulerContextEncoded && newEulerContextEncoded && eulerCollaterals?.length && eulerBorrowVault) {
      const newBorrowVault = (selectedTo as SwapAsset & { eulerBorrowVault?: string }).eulerBorrowVault;
      if (!newBorrowVault) return empty;
      const postInstructions = buildEulerConditionalPost({
        proto: normalizedProtocol, debt: debtFromToken, user: userAddress, oldCtx: oldEulerContextEncoded,
        borrowVault: eulerBorrowVault, collaterals: eulerCollaterals as EulerCollateralInfo[],
        oldSub: oldSubAccountIndex, newSub: newSubAccountIndex, newBorrow: newBorrowVault,
        to: selectedTo.address, mgr: conditionalOrderManagerAddress, chunks: numChunks, isMax,
      });
      return { preInstructions: [], postInstructions };
    }

    // Standard flow (Aave, Compound, Venus) - no collateral migration needed
    const postInstructions = buildStandardConditionalPost(
      normalizedProtocol, debtFromToken, userAddress, context, selectedTo.address, conditionalOrderManagerAddress,
    );
    return { preInstructions: [], postInstructions };
  }, [selectedTo, userAddress, effectiveLimitOrderNewDebt, conditionalOrderManagerAddress, cowFlashLoanInfo, protocolName, debtFromToken, context, isMorpho, oldMorphoContextEncoded, newMorphoContextEncoded, collateralTokenAddress, collateralBalance, numChunks, isEuler, oldEulerContextEncoded, newEulerContextEncoded, eulerCollaterals, eulerBorrowVault, oldSubAccountIndex, newSubAccountIndex, isMax, repayAmountRaw, currentDebtBalance]);

  // ============ Output Amount ============
  const amountOut = useMemo(() => {
    if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
      return customBuyAmount;
    }
    return executionType === "limit"
      ? (limitOrderNewDebt > 0n && selectedTo ? formatUnits(limitOrderNewDebt, selectedTo.decimals) : "0")
      : requiredNewDebtFormatted;
  }, [executionType, useCustomBuyAmount, customBuyAmount, limitOrderNewDebt, selectedTo, requiredNewDebtFormatted]);

  // ============ Build Flow (Market Orders) ============
  const buildFlow = useCallback((): ProtocolInstruction[] => {
    if (!swapQuote || !selectedTo || !hasAdapter || requiredNewDebt === 0n) return [];

    const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;
    const swapProtocol = resolveSwapProtocol(swapRouter);
    const swapData = swapQuote.tx.data as `0x${string}`;

    // Morpho flow - pair-isolated markets require collateral migration
    // For partial swaps, only move collateral proportional to the debt being moved.
    // For isMax, move everything (uses fixed colBal which should match on-chain balance).
    if (isMorpho && oldMorphoContextEncoded && newMorphoContextEncoded && collateralTokenAddress && collateralBalance) {
      const proportionalCollateral = isMax || currentDebtBalance === 0n
        ? collateralBalance
        : (collateralBalance * repayAmountRaw) / currentDebtBalance;
      return buildMorphoMarketFlow(
        debtFromToken, selectedTo.address, userAddress!, requiredNewDebt, swapMinAmountOut,
        swapData, providerEnum, swapProtocol, oldMorphoContextEncoded, newMorphoContextEncoded,
        collateralTokenAddress, proportionalCollateral,
      );
    }

    // Euler flow - sub-account isolation requires collateral migration
    if (isEuler && oldEulerContextEncoded && newEulerContextEncoded && eulerCollaterals?.length) {
      const newBorrowVault = (selectedTo as SwapAsset & { eulerBorrowVault?: string }).eulerBorrowVault;
      if (!newBorrowVault) return [];
      return buildEulerMarketFlow(
        debtFromToken, selectedTo.address, userAddress!, requiredNewDebt, swapMinAmountOut,
        swapData, providerEnum, swapProtocol, protocolName, oldEulerContextEncoded,
        eulerCollaterals as EulerCollateralInfo[], eulerBorrowVault as string,
        oldSubAccountIndex, newSubAccountIndex, newBorrowVault,
      );
    }

    // Standard flow (Aave, Compound, Venus) - no collateral migration needed
    return buildDebtSwapFlow(
      protocolName as any, debtFromToken, selectedTo.address, swapMinAmountOut,
      requiredNewDebt, swapQuote.tx.data, providerEnum, context, isMax, swapProtocol,
    );
  }, [swapQuote, selectedTo, hasAdapter, requiredNewDebt, selectedProvider, swapRouter, isMorpho, oldMorphoContextEncoded, newMorphoContextEncoded, collateralTokenAddress, collateralBalance, swapMinAmountOut, debtFromToken, userAddress, isEuler, oldEulerContextEncoded, newEulerContextEncoded, eulerCollaterals, eulerBorrowVault, oldSubAccountIndex, newSubAccountIndex, buildDebtSwapFlow, protocolName, context, isMax, repayAmountRaw, currentDebtBalance]);

  // ============ Transaction Flow ============
  const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Debt Swapped successfully!",
    emptyFlowErrorMessage: "Failed to build swap instructions",
    simulateWhenBatching: true,
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

  // ============ Market Order Submit ============
  const handleMarketSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      track("debt_swap_tx_begin", {
        network: "evm",
        protocol: protocolName,
        chainId,
        fromToken: debtFromToken,
        toToken: selectedTo?.address,
        amountIn,
        isMax,
        slippage,
        swapRouter,
      });
      await handleSwap(amountIn, isMax);
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  }, [protocolName, chainId, debtFromToken, selectedTo, amountIn, isMax, slippage, swapRouter, handleSwap, onSuccess]);

  // ============ Conditional Order Submit ============
  const handleLimitOrderSubmit = useCallback(async () => {
    if (!selectedTo || !userAddress || !conditionalOrderManagerAddress || !walletClient || !publicClient) {
      throw new Error("Missing required data for conditional order");
    }
    if (!cowFlashLoanInfo || !limitPriceTriggerAddress || !conditionalOrderTriggerParams) {
      throw new Error("Missing trigger or flash loan configuration");
    }

    const analyticsProps = {
      network: "evm",
      protocol: protocolName,
      chainId,
      orderSystem: "conditional",
      debtFromToken,
      debtFromName,
      newDebtToken: selectedTo.address,
      newDebtName: selectedTo.symbol,
    };

    setIsLimitSubmitting(true);

    try {
      track("debt_swap_conditional_order_begin", analyticsProps);

      const result = await buildConditionalOrderCalls({
        triggerAddress: limitPriceTriggerAddress,
        triggerStaticData: conditionalOrderTriggerParams,
        sellToken: selectedTo.address as Address,
        buyToken: debtFromToken as Address,
        preInstructions: buildConditionalOrderInstructionsData.preInstructions,
        postInstructions: buildConditionalOrderInstructionsData.postInstructions,
        maxIterations: numChunks,
        flashLoan: {
          lender: cowFlashLoanInfo.lender as Address,
          token: selectedTo.address as Address,
          // For limit orders, use exact amount per chunk - no slippage buffer
          amount: effectiveLimitOrderNewDebt / BigInt(numChunks),
        },
        sellTokenRefundAddress: getKapanCowAdapter(chainId) as Address, // KapanCowAdapter for flash loan repayment
        operationType: "debt-swap",
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
        saveOrderNote(createDebtSwapNote(result.salt, protocolName, debtFromName, selectedTo.symbol, chainId));
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
          orderType: "debt_swap",
          protocol: protocolName,
          sellToken: selectedTo.address,
          buyToken: debtFromToken,
          sellTokenSymbol: selectedTo.symbol,
          buyTokenSymbol: debtFromName,
          sellAmount: effectiveLimitOrderNewDebt.toString(),
          buyAmount: repayAmountRaw.toString(),
        });

        if (orderHash && effectiveLimitOrderNewDebt > 0n && repayAmountRaw > 0n) {
          const quoteRate = Number(effectiveLimitOrderNewDebt) / Number(repayAmountRaw);
          storeOrderQuoteRate(chainId, orderHash, quoteRate);
        }
      }

      track("debt_swap_conditional_order_complete", { ...analyticsProps, status: "success" });
      dispatchOrderCreated();
      onSuccess?.();
      onClose();
    } catch (e) {
      track("debt_swap_conditional_order_complete", {
        ...analyticsProps,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      setIsLimitSubmitting(false);
    }
  }, [selectedTo, userAddress, conditionalOrderManagerAddress, walletClient, publicClient, cowFlashLoanInfo, limitPriceTriggerAddress, conditionalOrderTriggerParams, protocolName, chainId, debtFromToken, debtFromName, buildConditionalOrderCalls, buildConditionalOrderInstructionsData, numChunks, effectiveLimitOrderNewDebt, repayAmountRaw, saveOrder, onSuccess, onClose]);

  // ============ Can Submit ============
  const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && requiredNewDebt > 0n && hasAdapter;
  const canSubmitLimit = executionType === "limit" && conditionalOrderReady && !!cowFlashLoanInfo &&
    parseFloat(amountIn) > 0 && !!conditionalOrderManagerAddress && !!limitPriceTriggerAddress &&
    !!conditionalOrderTriggerParams && effectiveLimitOrderNewDebt > 0n;
  const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

  // ============ Price Impact ============
  const srcUsdFallback = useMemo(() => {
    if (!selectedTo?.price || requiredNewDebt === 0n) return undefined;
    const amount = parseFloat(formatUnits(requiredNewDebt, selectedTo.decimals));
    return amount > 0 ? amount * Number(formatUnits(selectedTo.price, 8)) : undefined;
  }, [selectedTo?.price, selectedTo?.decimals, requiredNewDebt]);

  const dstUsdFallback = useMemo(() => {
    if (!debtFromPrice || !expectedOutput) return undefined;
    const parsed = parseFloat(expectedOutput);
    return !isNaN(parsed) && parsed > 0 ? parsed * Number(formatUnits(debtFromPrice, 8)) : undefined;
  }, [debtFromPrice, expectedOutput]);

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

  // ============ Analytics Tracking ============
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      trackModalOpen(protocolName, chainId, context, debtFromToken, debtFromName, availableAssets?.length ?? null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, protocolName, chainId, context, debtFromToken, debtFromName, availableAssets?.length]);

  // Prefer Morpho for limit orders
  useEffect(() => {
    if (executionType === "limit" && flashLoanProviders && flashLoanProviders.length > 0) {
      const morphoProvider = flashLoanProviders.find(p => p.name.toLowerCase().includes("morpho"));
      if (morphoProvider && selectedProvider?.name !== morphoProvider.name) {
        setSelectedProvider(morphoProvider);
      }
    }
  }, [executionType, flashLoanProviders, selectedProvider, setSelectedProvider]);

  // ============ Flash Loan Config ============
  const flashLoanConfig: FlashLoanConfig = useMemo(() => ({
    providers: flashLoanProviders || [],
    selectedProvider: selectedProvider ?? null,
    setSelectedProvider,
    required: true,
  }), [flashLoanProviders, selectedProvider, setSelectedProvider]);

  // ============ Limit Order Config ============
  const limitOrderConfigOutput: LimitOrderConfig = useMemo(() => ({
    available: cowAvailable,
    ready: conditionalOrderReady,
    orderManagerAddress: conditionalOrderManagerAddress,
    numChunks,
    setNumChunks,
    customBuyAmount,
    useCustomBuyAmount,
    setCustomBuyAmount: (amount: string) => {
      setCustomBuyAmount(amount);
      setUseCustomBuyAmount(true);
    },
    flashLoanInfo: cowFlashLoanInfo,
    chunkInstructions: [],
  }), [cowAvailable, conditionalOrderReady, conditionalOrderManagerAddress, numChunks, customBuyAmount, useCustomBuyAmount, cowFlashLoanInfo]);

  // ============ Handler for output amount change ============
  const handleAmountOutChange = useCallback((value: string) => {
    setCustomBuyAmount(value);
    setUseCustomBuyAmount(true);
  }, []);

  // ============ Submit Handler ============
  const onSubmit = useCallback(async () => {
    if (executionType === "market") {
      await handleMarketSubmit();
    } else {
      await handleLimitOrderSubmit();
    }
  }, [executionType, handleMarketSubmit, handleLimitOrderSubmit]);

  // ============ Submit Label ============
  const submitLabel = executionType === "market" ? "Swap Debt" : "Create Limit Order";

  // ============ Info Content ============
  const infoContent: ReactNode = executionType === "market" ? (
    <div className="space-y-4 py-2">
      <div className="alert alert-info bg-info/10 border-info/20 text-sm">
        <span>
          <strong>How Debt Swap Works</strong>
          <br />
          This feature allows you to change your debt asset without closing your collateral position.
        </span>
      </div>
      <div className="text-base-content/70 space-y-2 px-2 text-xs">
        <p>1. Flash loan the new debt token</p>
        <p>2. Swap new debt for current debt via {getRouterDisplayName(swapRouter)}</p>
        <p>3. Repay your current debt</p>
        <p>4. Borrow new debt to repay flash loan</p>
      </div>
    </div>
  ) : (
    <div className="space-y-4 py-2">
      <div className="alert alert-info bg-info/10 border-info/20 text-sm">
        <span>
          <strong>How Limit Order Debt Swap Works</strong>
          <br />
          Your order waits for CoW solvers to find the best price, then executes atomically.
        </span>
      </div>
      <div className="text-base-content/70 space-y-2 px-2 text-xs">
        <p>1. Create order on CoW Protocol</p>
        <p>2. Solvers compete to fill at best price</p>
        <p>3. Flash loan + swap executed atomically</p>
        <p>4. Debt repaid + new debt borrowed</p>
      </div>
    </div>
  );

  // ============ Warnings ============
  const warnings: ReactNode = useMemo(() => {
    if (executionType === "market" && swapQuote && !outputCoversRepay) {
      return (
        <div className="alert alert-warning text-sm">
          Swap output ({expectedOutput} {debtFromName}) may not fully cover repay amount. Consider increasing slippage.
        </div>
      );
    }
    if (!hasAdapter && isOpen) {
      return (
        <div className="alert alert-warning text-sm">
          {getRouterDisplayName(swapRouter)} Adapter not found on this network.
        </div>
      );
    }
    return undefined;
  }, [executionType, swapQuote, outputCoversRepay, expectedOutput, debtFromName, hasAdapter, isOpen, swapRouter]);

  // ============ Limit Price Buttons ============
  const limitPriceButtons: ReactNode = useMemo(() => {
    if (executionType !== "limit" || !selectedTo || limitOrderNewDebt === 0n) return null;

    const currentAmount = Number(formatUnits(effectiveLimitOrderNewDebt, selectedTo.decimals));

    const adjustByPercent = (delta: number) => {
      const newAmount = currentAmount * (1 + delta / 100);
      setCustomBuyAmount(newAmount.toFixed(6));
      setUseCustomBuyAmount(true);
    };

    const resetToMarket = () => {
      const exactMarket = formatUnits(limitOrderNewDebt, selectedTo.decimals);
      setCustomBuyAmount(exactMarket);
      setUseCustomBuyAmount(true);
    };

    return (
      <div className="flex flex-wrap items-center justify-center gap-1 py-1">
        {[-1, -0.5, -0.1, -0.01].map(delta => (
          <button key={delta} onClick={() => adjustByPercent(delta)} className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]">
            {delta}%
          </button>
        ))}
        <button onClick={resetToMarket} className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]">
          Market
        </button>
        {[0.01, 0.1, 0.5, 1].map(delta => (
          <button key={delta} onClick={() => adjustByPercent(delta)} className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]">
            +{delta}%
          </button>
        ))}
      </div>
    );
  }, [executionType, selectedTo, limitOrderNewDebt, effectiveLimitOrderNewDebt]);

  // ============ Right Panel ============
  const rightPanel: ReactNode = useMemo(() => (
    <DebtSwapRightPanel
      executionType={executionType}
      setExecutionType={setExecutionType}
      cowAvailable={cowAvailable}
      conditionalOrderReady={conditionalOrderReady}
      slippage={slippage}
      setSlippage={setSlippage}
      swapRouter={swapRouter}
      setSwapRouter={setSwapRouter}
      kyberAvailable={kyberAvailable}
      oneInchAvailable={oneInchAvailable}
      pendleAvailable={pendleAvailable}
      flashLoanProviders={flashLoanProviders}
      selectedProvider={selectedProvider}
      setSelectedProvider={setSelectedProvider}
      priceImpact={priceImpact}
      formattedPriceImpact={formattedPriceImpact}
      exchangeRate={exchangeRate}
      expectedOutput={expectedOutput}
      outputCoversRepay={outputCoversRepay}
      debtFromName={debtFromName}
      debtFromDecimals={debtFromDecimals}
      selectedTo={selectedTo}
      limitOrderConfig={limitOrderConfig}
      numChunks={numChunks}
      setNumChunks={setNumChunks}
      effectiveLimitOrderNewDebt={effectiveLimitOrderNewDebt}
      limitOrderNewDebt={limitOrderNewDebt}
      isCowQuoteLoading={isCowQuoteLoading}
      repayAmountRaw={repayAmountRaw}
    />
  ), [executionType, setExecutionType, cowAvailable, conditionalOrderReady, slippage, setSlippage, swapRouter, setSwapRouter, oneInchAvailable, pendleAvailable, flashLoanProviders, selectedProvider, setSelectedProvider, priceImpact, formattedPriceImpact, exchangeRate, expectedOutput, outputCoversRepay, debtFromName, debtFromDecimals, selectedTo, limitOrderConfig, numChunks, setNumChunks, effectiveLimitOrderNewDebt, limitOrderNewDebt, isCowQuoteLoading, repayAmountRaw]);

  // ============ Return Config ============
  return {
    // Operation identity
    operationType: "debt-swap",
    title: "Swap Debt",
    protocolName,

    // Token configuration
    fromAssets,
    toAssets,
    selectedFrom,
    selectedTo,
    setSelectedFrom,
    setSelectedTo,
    fromReadOnly: true,
    toReadOnly: false,
    fromLabel: "Repay Debt",
    toLabel: "New Debt",

    // Amount state
    amountIn,
    setAmountIn,
    isMax,
    setIsMax,
    amountOut,

    // Quote state
    isQuoteLoading: executionType === "market" ? isQuoteLoading : (isCowQuoteLoading || isInputSettling),
    quoteError: executionType === "market" ? quoteError : null,
    priceImpact,

    // Slippage
    slippage,
    setSlippage,

    // Execution
    executionType,
    setExecutionType,
    isSubmitting: executionType === "market" ? isSubmitting : isLimitSubmitting,
    canSubmit,
    submitLabel,
    onSubmit,

    // Flash loan
    flashLoan: flashLoanConfig,

    // Limit order
    limitOrder: limitOrderConfigOutput,

    // Batching
    preferBatching: executionType === "market" ? preferBatching : undefined,
    setPreferBatching: executionType === "market" ? setPreferBatching : undefined,

    // UI customization
    infoContent,
    warnings,
    rightPanel,
    hideDefaultStats: true,
    onAmountOutChange: executionType === "limit" ? handleAmountOutChange : undefined,
    limitPriceButtons,
  };
}

// ============================================================================
// Right Panel Component
// ============================================================================

import { ExecutionTypeToggle } from "./ExecutionTypeToggle";
import * as Tooltip from "@radix-ui/react-tooltip";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

interface DebtSwapRightPanelProps {
  executionType: ExecutionType;
  setExecutionType: (type: ExecutionType) => void;
  cowAvailable: boolean;
  conditionalOrderReady: boolean;
  slippage: number;
  setSlippage: (s: number) => void;
  swapRouter: SwapRouter;
  setSwapRouter: (r: SwapRouter) => void;
  kyberAvailable: boolean;
  oneInchAvailable: boolean;
  pendleAvailable: boolean;
  flashLoanProviders?: FlashLoanProviderOption[];
  selectedProvider?: FlashLoanProviderOption | null;
  setSelectedProvider: (p: FlashLoanProviderOption) => void;
  priceImpact: number | null | undefined;
  formattedPriceImpact: string | null | undefined;
  exchangeRate: string;
  expectedOutput: string;
  outputCoversRepay: boolean;
  debtFromName: string;
  debtFromDecimals: number;
  selectedTo: SwapAsset | null;
  limitOrderConfig: LimitOrderResult | null;
  numChunks: number;
  setNumChunks: (n: number) => void;
  effectiveLimitOrderNewDebt: bigint;
  limitOrderNewDebt: bigint;
  isCowQuoteLoading: boolean;
  repayAmountRaw: bigint;
}

function DebtSwapRightPanel(props: DebtSwapRightPanelProps): ReactNode {
  const {
    executionType,
    setExecutionType,
    cowAvailable,
    conditionalOrderReady,
    slippage,
    setSlippage,
    swapRouter,
    setSwapRouter,
    kyberAvailable,
    oneInchAvailable,
    pendleAvailable,
    flashLoanProviders,
    selectedProvider,
    setSelectedProvider,
    priceImpact,
    formattedPriceImpact,
    exchangeRate,
    expectedOutput,
    outputCoversRepay,
    debtFromName,
    debtFromDecimals,
    selectedTo,
    limitOrderConfig,
    numChunks,
    setNumChunks,
    effectiveLimitOrderNewDebt,
    limitOrderNewDebt,
    isCowQuoteLoading,
    repayAmountRaw,
  } = props;

  return (
    <div className="space-y-3">
      <ExecutionTypeToggle
        value={executionType}
        onChange={setExecutionType}
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
                onChange={(e) => setSlippage(parseFloat(e.target.value))}
              >
                {[0.05, 0.1, 0.3, 0.5, 1, 2, 3, 5].map(s => (
                  <option key={s} value={s}>{s}%</option>
                ))}
              </select>
            </div>
            {[kyberAvailable, oneInchAvailable, pendleAvailable].filter(Boolean).length >= 2 && (
              <div className="flex items-center justify-between">
                <span className="text-base-content/50">Router</span>
                <select
                  className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                  value={swapRouter}
                  onChange={(e) => setSwapRouter(e.target.value as SwapRouter)}
                >
                  {kyberAvailable && <option value="kyber">Kyber</option>}
                  {oneInchAvailable && <option value="1inch">1inch</option>}
                  {pendleAvailable && <option value="pendle">Pendle</option>}
                </select>
              </div>
            )}
            {flashLoanProviders && flashLoanProviders.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-base-content/50">Flash Loan</span>
                <select
                  className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                  value={selectedProvider?.name || ""}
                  onChange={(e) => {
                    const p = flashLoanProviders.find(provider => provider.name === e.target.value);
                    if (p) setSelectedProvider(p);
                  }}
                >
                  {flashLoanProviders.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
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
                <span className="text-base-content/80">1:{parseFloat(exchangeRate).toFixed(4)}</span>
              </div>
            )}
            {expectedOutput && (
              <div className="flex items-center justify-between">
                <span className="text-base-content/50">Output</span>
                <span className={outputCoversRepay === false ? "text-warning" : outputCoversRepay === true ? "text-success" : "text-base-content/80"}>
                  {parseFloat(expectedOutput).toFixed(4)} {debtFromName}
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
            <Tooltip.Provider delayDuration={200}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span className="text-primary flex cursor-help items-center gap-1 font-medium">
                    Buy Order
                    <InformationCircleIcon className="size-3.5" />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-base-300 text-base-content z-50 max-w-[280px] rounded-lg px-3 py-2 text-xs shadow-lg" sideOffset={5}>
                    You are buying new debt tokens by selling repayment tokens.
                    <Tooltip.Arrow className="fill-base-300" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>

          {limitOrderConfig?.selectedProvider && (
            <div className="flex items-center justify-between">
              <span className="text-base-content/50">Flash Loan</span>
              <span className="text-base-content/80 font-medium">{limitOrderConfig.selectedProvider.provider}</span>
            </div>
          )}

          {isCowQuoteLoading && (
            <div className="text-base-content/50 flex items-center gap-2 text-xs">
              <span className="loading loading-spinner loading-xs" />
              <span>Fetching quote...</span>
            </div>
          )}

          {selectedTo && effectiveLimitOrderNewDebt > 0n && repayAmountRaw > 0n && !isCowQuoteLoading && (
            <div className="bg-base-200/50 space-y-1 rounded p-2">
              <div className="flex items-center justify-between">
                <span className="text-base-content/50">Limit Price</span>
                <span className="text-base-content/80 font-medium">
                  {`1 ${debtFromName} = ${(Number(formatUnits(effectiveLimitOrderNewDebt, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtFromDecimals))).toFixed(4)} ${selectedTo.symbol}`}
                </span>
              </div>
              {limitOrderNewDebt > 0n && (
                <div className="text-center text-[10px]">
                  {(() => {
                    const userRate = Number(formatUnits(effectiveLimitOrderNewDebt, selectedTo.decimals));
                    const quoteRate = Number(formatUnits(limitOrderNewDebt, selectedTo.decimals));
                    const pctDiff = ((userRate - quoteRate) / quoteRate) * 100;
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

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-base-content/50">Chunks</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="border-base-300 bg-base-200 text-base-content/80 w-14 rounded border px-2 py-0.5 text-right text-xs font-medium"
                value={numChunks}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setNumChunks(Math.max(1, Math.min(100, val)));
                }}
              />
            </div>
            {numChunks > 1 && effectiveLimitOrderNewDebt > 0n && (
              <div className="text-base-content/50 text-[10px]">
                Max {formatUnits(effectiveLimitOrderNewDebt / BigInt(numChunks), selectedTo.decimals).slice(0, 8)} {selectedTo.symbol} per chunk
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
