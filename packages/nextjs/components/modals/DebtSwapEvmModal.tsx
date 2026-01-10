import { FC, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useSendCalls } from "wagmi/experimental";
import { parseAmount } from "~~/utils/validation";
import { PositionManager } from "~~/utils/position";
import * as Tooltip from "@radix-ui/react-tooltip";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import { useCowLimitOrder } from "~~/hooks/useCowLimitOrder";
import { useCowQuote } from "~~/hooks/useCowQuote";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { getCowExplorerAddressUrl, getCowFlashLoanProviders, getPreferredFlashLoanLender, calculateFlashLoanFee } from "~~/utils/cow";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";
import {
    ExecutionTypeToggle,
    type ExecutionType,
} from "./common";
import { WarningDisplay } from "~~/components/common/ErrorDisplay";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import {
    trackModalOpen,
    createLimitOrderAnalyticsProps,
    buildCowFlashLoanInfo,
    buildCowChunkInstructions,
    logLimitOrderBuildStart,
    buildLimitOrderCallParams,
    handleLimitOrderBuildFailure,
    saveLimitOrderNote,
    executeBatchedLimitOrder,
    executeSequentialLimitOrder,
    handleLimitOrderError,
    shouldSwitchSwapRouter,
    calculateRequiredNewDebt,
    calculateLimitOrderNewDebt,
} from "./debtSwapEvmHelpers";

interface DebtSwapEvmModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    chainId: number;
    // Current debt token info (preselected "From")
    debtFromToken: Address;
    debtFromName: string;
    debtFromIcon: string;
    debtFromDecimals: number;
    debtFromPrice?: bigint; // Price in 8 decimals (e.g., from Chainlink)
    currentDebtBalance: bigint;
    // Available assets for "To" selection
    availableAssets: SwapAsset[];
    /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
    context?: string;
    // Position data for health factor / LTV display
    position?: PositionManager;
}

export const DebtSwapEvmModal: FC<DebtSwapEvmModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtFromToken,
    debtFromName,
    debtFromIcon,
    debtFromDecimals,
    debtFromPrice,
    currentDebtBalance,
    availableAssets,
    context,
}) => {
    const {
        buildDebtSwapFlow,
        setBatchId,
        setSuppressBatchNotifications,
        isBatchConfirmed,
    } = useKapanRouterV2();

    // Check swap router availability and get adapter info directly from deployed contracts
    const oneInchAvailable = is1inchSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const oneInchAdapter = getOneInchAdapterInfo(chainId);
    const pendleAdapter = getPendleAdapterInfo(chainId);
    const defaultRouter = getDefaultSwapRouter(chainId);

    // Swap router selection - default based on chain availability
    const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");

    // Update swap router if chain changes and current router is not available
    useEffect(() => {
        const newRouter = shouldSwitchSwapRouter(swapRouter, oneInchAvailable, pendleAvailable);
        if (newRouter) {
            setSwapRouter(newRouter as SwapRouter);
        }
    }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

    const wasOpenRef = useRef(false);

    useEffect(() => {
        const modalJustOpened = isOpen && !wasOpenRef.current;
        if (modalJustOpened) {
            trackModalOpen(
                protocolName,
                chainId,
                context,
                debtFromToken,
                debtFromName,
                availableAssets?.length ?? null
            );
        }
        wasOpenRef.current = isOpen;
    }, [availableAssets?.length, chainId, debtFromName, debtFromToken, isOpen, context, protocolName]);

    // Flash Loan Providers
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: { name: debtFromName, tokenAddress: debtFromToken, decimals: debtFromDecimals, type: "borrow" },
    });

    // "From" is fixed (current debt to repay)
    const fromAsset: SwapAsset = useMemo(() => ({
        symbol: debtFromName,
        address: debtFromToken,
        decimals: debtFromDecimals,
        rawBalance: currentDebtBalance,
        balance: parseFloat(formatUnits(currentDebtBalance, debtFromDecimals)),
        icon: debtFromIcon,
        price: debtFromPrice,
    }), [debtFromName, debtFromToken, debtFromDecimals, currentDebtBalance, debtFromIcon, debtFromPrice]);

    // Memoized array for fromAssets prop
    const fromAssets = useMemo(() => [fromAsset], [fromAsset]);

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
    const [slippage, setSlippage] = useState<number>(0.1); // Start with minimum, will auto-adjust
    const [amountIn, setAmountIn] = useState(""); // Amount of current debt to repay
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ============ Limit Order State ============
    const [executionType, setExecutionType] = useState<ExecutionType>("market");
    const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
    const [numChunks, setNumChunks] = useState(1);
    const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
    const [useBatchedTx] = useState<boolean>(false);
    const [lastOrderSalt, setLastOrderSalt] = useState<string | null>(null);
    const [limitOrderNotificationId, setLimitOrderNotificationId] = useState<string | number | null>(null);
    const cowAvailable = isCowProtocolSupported(chainId);
    // Custom buy amount for limit orders (user-editable)
    const [customBuyAmount, setCustomBuyAmount] = useState<string>("");
    const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);

    // Wallet hooks for limit order
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { sendCallsAsync } = useSendCalls();

    // CoW limit order hook
    const {
        buildOrderCalls: buildLimitOrderCalls,
        isReady: limitOrderReady,
        orderManagerAddress
    } = useCowLimitOrder();


    // Initialize limitOrderConfig with default provider when switching to limit mode
    useEffect(() => {
        if (executionType !== "limit" || limitOrderConfig?.selectedProvider) return;

        const providers = getCowFlashLoanProviders(chainId);
        if (providers.length === 0) return;

        // Default to Morpho if available, otherwise first provider
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

    // Sync numChunks state to limitOrderConfig
    useEffect(() => {
        if (limitOrderConfig && limitOrderConfig.numChunks !== numChunks) {
            setLimitOrderConfig({ ...limitOrderConfig, numChunks });
        }
    }, [numChunks, limitOrderConfig]);

    // Ensure "From" is always the debt token
    useEffect(() => {
        const fromMismatch = !selectedFrom || selectedFrom.address !== debtFromToken;
        if (fromMismatch) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtFromToken, fromAsset]);

    // Filter "To" assets (exclude current debt)
    const toAssets = useMemo(() =>
        (availableAssets || []).filter(a => a.address.toLowerCase() !== debtFromToken.toLowerCase()),
        [availableAssets, debtFromToken]
    );

    // Auto-switch to Pendle when a PT token is involved in the swap
    useEffect(() => {
        const fromIsPT = isPendleToken(debtFromName);
        const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);
        const shouldSwitchToPendle = (fromIsPT || toIsPT) && pendleAvailable;
        if (shouldSwitchToPendle) {
            setSwapRouter("pendle");
        }
    }, [debtFromName, selectedTo, pendleAvailable]);

    // Handle batch confirmation for limit orders
    useEffect(() => {
        const shouldHandleBatchConfirmation = isBatchConfirmed && executionType === "limit" && orderManagerAddress && lastOrderSalt;
        if (!shouldHandleBatchConfirmation) return;

        if (limitOrderNotificationId) {
            notification.remove(limitOrderNotificationId);
        }

        const explorerUrl = getCowExplorerAddressUrl(chainId, orderManagerAddress);
        notification.success(
            <TransactionToast
                step="confirmed"
                message="Limit order created!"
                blockExplorerLink={explorerUrl}
            />
        );

        setLastOrderSalt(null);
        setLimitOrderNotificationId(null);
        onClose();
    }, [isBatchConfirmed, executionType, orderManagerAddress, chainId, lastOrderSalt, limitOrderNotificationId, onClose]);

    // Amount to repay in raw
    const repayAmountRaw = useMemo(() => {
        const result = parseAmount(amountIn || "0", debtFromDecimals);
        return result.value ?? 0n;
    }, [amountIn, debtFromDecimals]);

    // Step 1: Get unit quote (1 newDebt -> X currentDebt) to estimate exchange rate
    const unitQuoteAmount = useMemo(() => {
        if (!selectedTo) return "0";
        return parseUnits("1", selectedTo.decimals).toString();
    }, [selectedTo]);

    // 1inch unit quote (only fetch when 1inch router is selected)
    const { data: oneInchUnitQuote, isLoading: isOneInchUnitQuoteLoading } = use1inchQuoteOnly({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtFromToken,
        amount: unitQuoteAmount,
        enabled: oneInchAvailable && swapRouter === "1inch" && !!selectedTo && isOpen && executionType === "market",
    });

    // Pendle unit quote (only fetch when Pendle router is selected)
    const { data: pendleUnitQuote, isLoading: isPendleUnitQuoteLoading } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedTo?.address as Address,
        tokensOut: debtFromToken,
        amountsIn: unitQuoteAmount,
        slippage: 0.03, // 3% for unit quote
        enabled: pendleAvailable && swapRouter === "pendle" && !!selectedTo && !!pendleAdapter && isOpen && unitQuoteAmount !== "0" && executionType === "market",
    });

    const isUnitQuoteLoading = swapRouter === "1inch" ? isOneInchUnitQuoteLoading : isPendleUnitQuoteLoading;

    // Calculate required newDebt input based on unit quote
    const { requiredNewDebt, requiredNewDebtFormatted, exchangeRate } = useMemo(() => {
        return calculateRequiredNewDebt({
            selectedTo,
            repayAmountRaw,
            oneInchUnitQuote,
            pendleUnitQuote,
            debtFromDecimals,
            slippage,
        });
    }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, repayAmountRaw, debtFromDecimals, slippage]);

    // Flash Loan selection - check liquidity for the NEW debt token we're flash loaning
    const { selectedProvider, setSelectedProvider } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: selectedTo?.address,  // NEW debt token (what we flash loan)
        amount: requiredNewDebt,            // Amount of new debt to flash loan (calculated above)
        chainId,
    });

    // Step 2: Get actual swap quote with the required amount
    const minSwapAmount = selectedTo ? parseUnits("0.001", selectedTo.decimals) : 0n;
    const oneInchSwapEnabled = oneInchAvailable && swapRouter === "1inch" && requiredNewDebt > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen && executionType === "market";
    const pendleSwapEnabled = pendleAvailable && swapRouter === "pendle" && requiredNewDebt > minSwapAmount && !!selectedTo && !!pendleAdapter && isOpen && executionType === "market";

    // 1inch quote
    const { data: oneInchSwapQuote, isLoading: is1inchSwapQuoteLoading, error: oneInchQuoteError } = use1inchQuote({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtFromToken,
        amount: requiredNewDebt.toString(),
        from: oneInchAdapter?.address || ("" as Address),
        slippage,
        enabled: oneInchSwapEnabled,
    });

    // Pendle quote
    const { data: pendleQuoteData, isLoading: isPendleQuoteLoading, error: pendleQuoteError } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        slippage: slippage / 100, // Pendle uses decimal (0.03 = 3%)
        tokensIn: selectedTo?.address as Address,
        tokensOut: debtFromToken,
        amountsIn: requiredNewDebt.toString(),
        enableAggregator: true,
        enabled: pendleSwapEnabled,
    });

    // Combine quote data based on selected router
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

    const isSwapQuoteLoading = swapRouter === "1inch" ? is1inchSwapQuoteLoading : isPendleQuoteLoading;
    const quoteError = swapRouter === "1inch" ? oneInchQuoteError : pendleQuoteError;
    const isQuoteLoading = isUnitQuoteLoading || isSwapQuoteLoading;

    // Check adapter availability
    const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;

    // What the swap will actually produce (from the real quote)
    const expectedOutput = swapQuote
        ? formatUnits(BigInt(swapQuote.dstAmount), debtFromDecimals)
        : "0";

    // Is the expected output enough to cover the repay?
    const outputCoversRepay = swapQuote
        ? BigInt(swapQuote.dstAmount) >= repayAmountRaw
        : false;

    // ============ Limit Order: CoW Quote ============
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedTo?.address || "",        // newDebt to sell
        buyToken: debtFromToken,                      // oldDebt to receive (exact)
        buyAmount: repayAmountRaw.toString(),        // Exact old debt amount we need
        kind: "buy",                                  // KIND_BUY: exact buy, max sell
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && repayAmountRaw > 0n && !!selectedTo && !!userAddress && isOpen,
    });

    // ============ Limit Order: New Debt Amount from CoW Quote ============
    const limitOrderNewDebt = useMemo(() => {
        return calculateLimitOrderNewDebt(cowQuote, selectedTo, slippage);
    }, [cowQuote, selectedTo, slippage]);

    // ============ Limit Order: Flash Loan Info ============
    const cowFlashLoanInfo = useMemo(() => {
        return buildCowFlashLoanInfo(chainId, limitOrderConfig, executionType, selectedTo, limitOrderNewDebt);
    }, [chainId, limitOrderConfig, executionType, limitOrderNewDebt, selectedTo]);

    // ============ Limit Order: Build Chunk Instructions ============
    const buildCowInstructions = useMemo(() => {
        if (!selectedTo || !userAddress || !orderManagerAddress || !cowFlashLoanInfo) {
            return [{ preInstructions: [], postInstructions: [] }];
        }
        return buildCowChunkInstructions({
            selectedTo,
            userAddress,
            repayAmountRaw,
            orderManagerAddress,
            protocolName,
            context,
            debtFromToken,
            debtFromName,
            debtFromDecimals,
            cowFlashLoanInfo,
            limitOrderConfig,
        });
    }, [selectedTo, userAddress, repayAmountRaw, orderManagerAddress, protocolName, context, debtFromToken, debtFromName, debtFromDecimals, cowFlashLoanInfo, limitOrderConfig]);

    // amountOut = required new debt (what user will borrow)
    const amountOut = useMemo(() => {
        // For limit orders, use custom buy amount if user has set one
        if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
            return customBuyAmount;
        }
        return executionType === "limit"
            ? (limitOrderNewDebt > 0n && selectedTo ? formatUnits(limitOrderNewDebt, selectedTo.decimals) : "0")
            : requiredNewDebtFormatted;
    }, [executionType, useCustomBuyAmount, customBuyAmount, limitOrderNewDebt, selectedTo, requiredNewDebtFormatted]);

    const buildFlow = () => {
        if (!swapQuote || !selectedTo || !hasAdapter || requiredNewDebt === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        return buildDebtSwapFlow(
            protocolName,
            debtFromToken,           // currentDebt (to repay)
            selectedTo.address,      // newDebt (to borrow)
            repayAmountRaw,          // amount of currentDebt to repay
            requiredNewDebt,         // max amount of newDebt to borrow
            swapQuote.tx.data,       // swap data
            providerEnum,
            context,
            isMax,                   // if true, uses GetBorrowBalance for exact debt amount on-chain
            swapRouter === "1inch" ? "oneinch" : "pendle",  // map "1inch" -> "oneinch"
        );
    };

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

    const handleSwapWrapper = useCallback(async () => {
        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            market: context ?? null,
            fromToken: debtFromToken,
            fromName: debtFromName,
            toToken: selectedTo?.address ?? null,
            toName: selectedTo?.symbol ?? null,
            amountIn,
            isMax,
            slippage,
            preferBatching,
            flashLoanProvider: selectedProvider?.name ?? null,
            swapRouter,
        } satisfies Record<string, string | number | boolean | null>;

        try {
            setIsSubmitting(true);
            track("debt_swap_tx_begin", txBeginProps);
            await handleSwap(amountIn, isMax);
            track("debt_swap_tx_complete", { ...txBeginProps, status: "success" });
        } catch (e) {
            track("debt_swap_tx_complete", {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsSubmitting(false);
        }
    }, [protocolName, chainId, context, debtFromToken, debtFromName, selectedTo?.address, selectedTo?.symbol, amountIn, isMax, slippage, preferBatching, selectedProvider?.name, swapRouter, handleSwap]);

    // ============ Limit Order: Submit Handler ============
    const handleLimitOrderSubmit = useCallback(async () => {
        // Validate required data
        if (!selectedTo || !userAddress || !orderManagerAddress || !walletClient || !publicClient) {
            throw new Error("Missing required data for limit order");
        }
        if (!limitOrderConfig?.selectedProvider || !cowFlashLoanInfo) {
            throw new Error("No flash loan provider selected");
        }

        const analyticsProps = createLimitOrderAnalyticsProps({
            protocolName,
            chainId,
            debtFromToken,
            debtFromName,
            selectedTo,
            repayAmountRaw,
            debtFromDecimals,
            limitOrderNewDebt,
            flashLoanProviderName: limitOrderConfig.selectedProvider.name,
        });

        setIsLimitSubmitting(true);
        let notificationId: string | number | undefined;

        try {
            track("debt_swap_limit_order_begin", analyticsProps);

            logLimitOrderBuildStart({
                selectedTo,
                debtFromName,
                limitOrderNewDebt,
                repayAmountRaw,
                debtFromDecimals,
                cowFlashLoanInfo,
                cowQuote,
            });

            // Build limit order calls
            const callParams = buildLimitOrderCallParams({
                selectedTo,
                debtFromToken,
                limitOrderNewDebt,
                repayAmountRaw,
                cowFlashLoanInfo,
                buildCowInstructions,
                limitOrderConfig,
            });

            const limitOrderResult = await buildLimitOrderCalls(callParams);

            if (!limitOrderResult) {
                throw new Error("Failed to build limit order calls");
            }

            if (!limitOrderResult.success) {
                handleLimitOrderBuildFailure(limitOrderResult, analyticsProps);
            }

            console.log("[Limit Order] Order calls built:", limitOrderResult.calls.length);

            // Save order note for display on orders page
            saveLimitOrderNote(
                limitOrderResult.salt,
                protocolName,
                debtFromName,
                selectedTo.symbol,
                chainId
            );

            const allCalls = limitOrderResult.calls;
            notificationId = notification.loading(
                <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
            );

            if (useBatchedTx) {
                await executeBatchedLimitOrder({
                    allCalls,
                    sendCallsAsync: (params) => sendCallsAsync(params),
                    setSuppressBatchNotifications,
                    setBatchId,
                    setLastOrderSalt,
                    setLimitOrderNotificationId,
                    salt: limitOrderResult.salt,
                    notificationId,
                    analyticsProps,
                });
            } else {
                await executeSequentialLimitOrder({
                    allCalls,
                    walletClient,
                    publicClient,
                    chainId,
                    orderManagerAddress,
                    analyticsProps,
                    onClose,
                    notificationId,
                });
            }
        } catch (e) {
            handleLimitOrderError(e, notificationId, analyticsProps);
            throw e;
        } finally {
            setIsLimitSubmitting(false);
        }
    }, [selectedTo, userAddress, orderManagerAddress, walletClient, publicClient, limitOrderConfig, cowFlashLoanInfo, protocolName, chainId, debtFromToken, debtFromName, repayAmountRaw, debtFromDecimals, limitOrderNewDebt, cowQuote, buildCowInstructions, buildLimitOrderCalls, useBatchedTx, sendCallsAsync, setSuppressBatchNotifications, setBatchId, onClose]);

    const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && requiredNewDebt > 0n && hasAdapter;
    const canSubmitLimit = executionType === "limit" && limitOrderReady && !!cowFlashLoanInfo &&
        parseFloat(amountIn) > 0 && !!orderManagerAddress && limitOrderNewDebt > 0n;
    const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

    // Calculate USD values from token prices for price impact fallback
    // (1inch v6.0 API doesn't return srcUSD/dstUSD, so we compute from token prices)
    // Swap is: newDebt (selectedTo) → oldDebt (debtFromToken)
    const srcUsdFallback = useMemo(() => {
        if (!selectedTo?.price || requiredNewDebt === 0n) return undefined;
        const amount = parseFloat(formatUnits(requiredNewDebt, selectedTo.decimals));
        if (amount <= 0) return undefined;
        return amount * Number(formatUnits(selectedTo.price, 8));
    }, [selectedTo?.price, selectedTo?.decimals, requiredNewDebt]);

    const dstUsdFallback = useMemo(() => {
        if (!debtFromPrice || !expectedOutput) return undefined;
        const parsed = parseFloat(expectedOutput);
        if (isNaN(parsed) || parsed <= 0) return undefined;
        return parsed * Number(formatUnits(debtFromPrice, 8));
    }, [debtFromPrice, expectedOutput]);

    // Auto-slippage and price impact calculation
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

    // Right panel for debt swap - Market/Limit settings
    const rightPanel = useMemo(() => (
        <div className="space-y-3">
            {/* Execution Type Toggle */}
            <ExecutionTypeToggle
                value={executionType}
                onChange={setExecutionType}
                limitAvailable={cowAvailable}
                limitReady={limitOrderReady}
            />

            {/* Market Order Settings */}
            {executionType === "market" && (
                <div className="space-y-2 text-xs">
                    {/* Dropdowns */}
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
                        {oneInchAvailable && pendleAvailable && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Router</span>
                                <select
                                    className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                    value={swapRouter}
                                    onChange={(e) => setSwapRouter(e.target.value as SwapRouter)}
                                >
                                    <option value="1inch">1inch</option>
                                    <option value="pendle">Pendle</option>
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

                    {/* Stats */}
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
                                <span className="text-base-content/80">
                                    1:{parseFloat(exchangeRate).toFixed(4)}
                                </span>
                            </div>
                        )}
                        {swapQuote && expectedOutput && (
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

            {/* Limit Order Settings */}
            {executionType === "limit" && selectedTo && (
                <div className="space-y-2 text-xs">
                    {/* Order Type Indicator */}
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
                                    <Tooltip.Content
                                        className="bg-base-300 text-base-content z-50 max-w-[280px] rounded-lg px-3 py-2 text-xs shadow-lg"
                                        sideOffset={5}
                                    >
                                        You are buying new debt tokens by selling repayment tokens. The order executes when someone is willing to sell you the new debt tokens at your specified price or better.
                                        <Tooltip.Arrow className="fill-base-300" />
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Tooltip.Provider>
                    </div>

                    {/* Flash Loan Provider */}
                    {limitOrderConfig?.selectedProvider && (
                        <div className="flex items-center justify-between">
                            <span className="text-base-content/50">Flash Loan</span>
                            <span className="text-base-content/80 font-medium">
                                {limitOrderConfig.selectedProvider.provider}
                            </span>
                        </div>
                    )}

                    {/* Limit Price vs Market comparison */}
                    {selectedTo && limitOrderNewDebt > 0n && repayAmountRaw > 0n && (
                        <div className="bg-base-200/50 space-y-1 rounded p-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Limit Price</span>
                                <span className="text-base-content/80 font-medium">
                                    {isCowQuoteLoading ? (
                                        <span className="loading loading-dots loading-xs" />
                                    ) : (
                                        `1 ${debtFromName} = ${(Number(formatUnits(limitOrderNewDebt, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtFromDecimals))).toFixed(4)} ${selectedTo.symbol}`
                                    )}
                                </span>
                            </div>
                            {exchangeRate && (
                                <div className="text-center text-[10px]">
                                    {(() => {
                                        const limitRate = Number(formatUnits(limitOrderNewDebt, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtFromDecimals));
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

                    {/* Chunks */}
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
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 1;
                                        setNumChunks(Math.max(1, Math.min(100, val)));
                                    }}
                                />
                            </div>
                            {numChunks > 1 && limitOrderNewDebt > 0n && (
                                <div className="text-base-content/50 text-[10px]">
                                    Max {formatUnits(limitOrderNewDebt / BigInt(numChunks), selectedTo.decimals).slice(0, 8)} {selectedTo.symbol} per chunk
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}
        </div>
    ), [executionType, setExecutionType, cowAvailable, limitOrderReady, slippage, setSlippage, priceImpact, formattedPriceImpact, exchangeRate, selectedTo, debtFromName, swapQuote, expectedOutput, outputCoversRepay, flashLoanProviders, selectedProvider, setSelectedProvider, oneInchAvailable, pendleAvailable, swapRouter, setSwapRouter, limitOrderConfig, numChunks, setNumChunks, limitOrderNewDebt, isCowQuoteLoading, repayAmountRaw, debtFromDecimals]);

    // Info content
    const infoContent = executionType === "market" ? (
        <MarketOrderInfoContent swapRouter={swapRouter} selectedProviderName={selectedProvider?.name} />
    ) : (
        <LimitOrderInfoContent />
    );

    // Memoize warnings JSX to avoid re-creating on each render
    const warnings = useMemo(
        () => (
            <DebtSwapWarnings
                executionType={executionType}
                swapQuote={swapQuote}
                outputCoversRepay={outputCoversRepay}
                expectedOutput={expectedOutput}
                debtFromName={debtFromName}
                swapRouter={swapRouter}
                oneInchAdapter={oneInchAdapter}
                hasAdapter={hasAdapter}
                isOpen={isOpen}
                isCowQuoteLoading={isCowQuoteLoading}
            />
        ),
        [executionType, swapQuote, outputCoversRepay, expectedOutput, debtFromName, swapRouter, oneInchAdapter, hasAdapter, isOpen, isCowQuoteLoading],
    );

    // Pre-compute execution type dependent props to reduce cognitive complexity in JSX
    const isMarketExecution = executionType === "market";
    const quoteLoadingProp = isMarketExecution ? isQuoteLoading : isCowQuoteLoading;
    const quoteErrorProp = isMarketExecution ? quoteError : null;
    const preferBatchingProp = isMarketExecution ? preferBatching : undefined;
    const setPreferBatchingProp = isMarketExecution ? setPreferBatching : undefined;
    const onSubmitHandler = isMarketExecution ? handleSwapWrapper : handleLimitOrderSubmit;
    const isSubmittingProp = isMarketExecution ? isSubmitting : isLimitSubmitting;
    const submitLabelProp = isMarketExecution ? "Swap Debt" : "Create Limit Order";

    // Handler for when user edits the output amount (limit orders)
    const handleAmountOutChange = useCallback((value: string) => {
        setCustomBuyAmount(value);
        setUseCustomBuyAmount(true);
    }, []);

    // Limit price adjustment buttons (shown below "New Debt" for limit orders)
    const limitPriceButtons = useMemo(() => {
        if (executionType !== "limit" || !selectedTo || limitOrderNewDebt === 0n) return null;

        const marketAmount = Number(formatUnits(limitOrderNewDebt, selectedTo.decimals));

        const adjustByPercent = (delta: number) => {
            const newAmount = marketAmount * (1 + delta / 100);
            setCustomBuyAmount(newAmount.toFixed(6));
            setUseCustomBuyAmount(true);
        };

        const resetToMarket = () => {
            // Set to exact market quote (no slippage adjustment)
            const exactMarket = formatUnits(limitOrderNewDebt, selectedTo.decimals);
            setCustomBuyAmount(exactMarket);
            setUseCustomBuyAmount(true);
        };

        return (
            <div className="flex flex-wrap items-center justify-center gap-1 py-1">
                {[-1, -0.5, -0.1].map(delta => (
                    <button
                        key={delta}
                        onClick={() => adjustByPercent(delta)}
                        className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]"
                    >
                        {delta}%
                    </button>
                ))}
                <button
                    onClick={resetToMarket}
                    className="bg-primary/20 text-primary hover:bg-primary/30 rounded px-2 py-0.5 text-[10px] font-medium"
                >
                    Market
                </button>
                {[0.1, 0.5, 1].map(delta => (
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
    }, [executionType, selectedTo, limitOrderNewDebt]);

    // Prefer Morpho for limit orders
    useEffect(() => {
        if (executionType === "limit" && flashLoanProviders && flashLoanProviders.length > 0) {
            const morphoProvider = flashLoanProviders.find(p => p.name.toLowerCase().includes("morpho"));
            if (morphoProvider && selectedProvider?.name !== morphoProvider.name) {
                setSelectedProvider(morphoProvider);
            }
        }
    }, [executionType, flashLoanProviders, selectedProvider, setSelectedProvider]);

    return (
        <SwapModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Swap Debt"
            protocolName={protocolName}
            fromAssets={fromAssets}
            toAssets={toAssets}
            initialFromAddress={debtFromToken}
            selectedFrom={selectedFrom}
            setSelectedFrom={setSelectedFrom}
            selectedTo={selectedTo}
            setSelectedTo={setSelectedTo}
            amountIn={amountIn}
            setAmountIn={setAmountIn}
            isMax={isMax}
            setIsMax={setIsMax}
            amountOut={amountOut}
            isQuoteLoading={quoteLoadingProp}
            quoteError={quoteErrorProp}
            slippage={slippage}
            setSlippage={setSlippage}
            preferBatching={preferBatchingProp}
            setPreferBatching={setPreferBatchingProp}
            onSubmit={onSubmitHandler}
            isSubmitting={isSubmittingProp}
            canSubmit={canSubmit}
            submitLabel={submitLabelProp}
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Repay Debt"
            toLabel="New Debt"
            fromReadOnly={true}
            hideDefaultStats={true}
            rightPanel={rightPanel}
            onAmountOutChange={executionType === "limit" ? handleAmountOutChange : undefined}
            limitPriceButtons={limitPriceButtons}
        />
    );
};

// ============ Sub-components to reduce main component complexity ============

interface MarketOrderInfoContentProps {
    swapRouter: SwapRouter;
    selectedProviderName?: string;
}

const MarketOrderInfoContent: FC<MarketOrderInfoContentProps> = ({ swapRouter, selectedProviderName }) => (
    <div className="space-y-4 py-2">
        <div className="alert alert-info bg-info/10 border-info/20 text-sm">
            <InformationCircleIcon className="size-5 flex-shrink-0" />
            <span>
                <strong>How Debt Swap Works</strong>
                <br />
                This feature allows you to change your debt asset without closing your collateral position.
            </span>
        </div>

        <div className="space-y-4 px-2">
            <InfoStep step={1} title="Flash Loan" isLast={false}>
                <p className="text-base-content/70 text-xs">We borrow the new debt asset via a Flash Loan.</p>
                <div className="bg-base-200 mt-1 inline-block rounded p-1 text-xs">
                    Provider: {selectedProviderName || "Auto"}
                </div>
            </InfoStep>

            <InfoStep step={2} title="Swap" isLast={false}>
                <p className="text-base-content/70 text-xs">
                    We swap the new debt token for your current debt token using {swapRouter === "1inch" ? "1inch" : "Pendle"}.
                </p>
            </InfoStep>

            <InfoStep step={3} title="Repay Current Debt" isLast={false}>
                <p className="text-base-content/70 text-xs">Your current debt is repaid with the swapped tokens.</p>
            </InfoStep>

            <InfoStep step={4} title="Borrow New Debt" isLast={true}>
                <p className="text-base-content/70 text-xs">New debt is borrowed to repay the Flash Loan.</p>
            </InfoStep>
        </div>
    </div>
);

const LimitOrderInfoContent: FC = () => (
    <div className="space-y-4 py-2">
        <div className="alert alert-info bg-info/10 border-info/20 text-sm">
            <InformationCircleIcon className="size-5 flex-shrink-0" />
            <span>
                <strong>How Limit Order Debt Swap Works</strong>
                <br />
                Your order waits for CoW solvers to find the best price, then executes atomically.
            </span>
        </div>

        <div className="space-y-4 px-2">
            <InfoStep step={1} title="Create Order" isLast={false}>
                <p className="text-base-content/70 text-xs">Your limit order is created and submitted to CoW Protocol.</p>
            </InfoStep>

            <InfoStep step={2} title="Solver Competition" isLast={false}>
                <p className="text-base-content/70 text-xs">Solvers compete to fill your order at the best price.</p>
            </InfoStep>

            <InfoStep step={3} title="Flash Loan + Swap" isLast={false}>
                <p className="text-base-content/70 text-xs">Solver takes flash loan, swaps new debt for old debt.</p>
            </InfoStep>

            <InfoStep step={4} title="Repay + Borrow" isLast={true}>
                <p className="text-base-content/70 text-xs">Old debt repaid, new debt borrowed to cover flash loan. All atomic!</p>
            </InfoStep>
        </div>
    </div>
);

interface InfoStepProps {
    step: number;
    title: string;
    isLast: boolean;
    children: React.ReactNode;
}

const InfoStep: FC<InfoStepProps> = ({ step, title, isLast, children }) => (
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

interface DebtSwapWarningsProps {
    executionType: ExecutionType;
    swapQuote: { dstAmount: string; tx: { data: string; from?: string }; srcUSD?: string | null; dstUSD?: string | null } | null | undefined;
    outputCoversRepay: boolean;
    expectedOutput: string;
    debtFromName: string;
    swapRouter: SwapRouter;
    oneInchAdapter: { address: string } | null | undefined;
    hasAdapter: boolean;
    isOpen: boolean;
    isCowQuoteLoading: boolean;
}

const DebtSwapWarnings: FC<DebtSwapWarningsProps> = ({
    executionType,
    swapQuote,
    outputCoversRepay,
    expectedOutput,
    debtFromName,
    swapRouter,
    oneInchAdapter,
    hasAdapter,
    isOpen,
    isCowQuoteLoading,
}) => {
    const showOutputWarning = executionType === "market" && swapQuote && !outputCoversRepay;
    const showFromMismatchWarning = executionType === "market" && swapRouter === "1inch" && swapQuote && oneInchAdapter && "from" in swapQuote.tx && swapQuote.tx.from?.toLowerCase() !== oneInchAdapter.address.toLowerCase();
    const showNoAdapterWarning = executionType === "market" && !hasAdapter && isOpen;
    const showCowQuoteLoading = executionType === "limit" && isCowQuoteLoading;

    return (
        <>
            {showOutputWarning && (
                <WarningDisplay
                    message={`Swap output (${expectedOutput} ${debtFromName}) may not fully cover repay amount. Consider increasing slippage or reducing amount.`}
                    size="sm"
                />
            )}
            {showFromMismatchWarning && (
                <WarningDisplay
                    message="Warning: Quote 'from' address mismatch!"
                    size="sm"
                    breakAll
                />
            )}
            {showNoAdapterWarning && (
                <WarningDisplay
                    message={`${swapRouter === "1inch" ? "1inch" : "Pendle"} Adapter not found on this network. Swaps unavailable.`}
                    size="sm"
                />
            )}
            {showCowQuoteLoading && (
                <div className="alert alert-info py-2 text-xs">
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>Fetching CoW quote...</span>
                </div>
            )}
        </>
    );
};
