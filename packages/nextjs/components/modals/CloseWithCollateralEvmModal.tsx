import { FC, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseAmount } from "~~/utils/validation";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { use1inchQuoteOnly } from "~~/hooks/use1inchQuoteOnly";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import { useCowLimitOrder } from "~~/hooks/useCowLimitOrder";
import { useCowQuote, getCowQuoteBuyAmount } from "~~/hooks/useCowQuote";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";
import { getCowExplorerAddressUrl } from "~~/utils/cow";
import { is1inchSupported, isPendleSupported, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";
import {
    ExecutionTypeToggle,
    type ExecutionType,
    MarketSwapStats,
    LimitOrderSection,
    hasEnoughCollateral as checkCollateralSufficiency,
} from "./common";
import { WarningDisplay } from "~~/components/common/ErrorDisplay";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { useSendCalls } from "wagmi/experimental";
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
    calculateRequiredCollateral,
    calculateLimitOrderCollateral,
} from "./closeWithCollateralEvmHelpers";

// Aave flash loan fee: 5 bps (0.05%)
// We add a small buffer (10 bps total) to ensure swap covers repayment
const AAVE_FLASH_LOAN_FEE_BPS = 10n;

interface CloseWithCollateralEvmModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    chainId: number;
    // Debt token info (preselected "From" - what we're repaying, user inputs amount)
    debtToken: Address;
    debtName: string;
    debtIcon: string;
    debtDecimals: number;
    debtPrice?: bigint; // Price in 8 decimals (e.g., from Chainlink)
    debtBalance: bigint;
    // Available collateral assets for "To" selection (collateral to sell)
    availableCollaterals: SwapAsset[];
    /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
    context?: string;
}

export const CloseWithCollateralEvmModal: FC<CloseWithCollateralEvmModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    chainId,
    debtToken,
    debtName,
    debtIcon,
    debtPrice,
    debtDecimals,
    debtBalance,
    availableCollaterals,
    context,
}) => {
    const {
        buildCloseWithCollateralFlow,
        setBatchId,
        setSuppressBatchNotifications,
        isBatchConfirmed,
    } = useKapanRouterV2();

    // Check swap router availability and get adapter info directly from deployed contracts
    const oneInchAvailable = is1inchSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const oneInchAdapter = getOneInchAdapterInfo(chainId);
    const pendleAdapter = getPendleAdapterInfo(chainId);

    // Swap router selection - default based on chain and token availability
    const [swapRouter, setSwapRouter] = useState<SwapRouter>("1inch");

    // Update swap router based on chain and token availability
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
                debtToken,
                debtName,
                availableCollaterals?.length ?? null
            );
        }
        wasOpenRef.current = isOpen;
    }, [availableCollaterals?.length, chainId, debtName, debtToken, isOpen, context, protocolName]);

    // Memoize position object for useMovePositionData to avoid recreation
    const positionForFlashLoan = useMemo(() => ({
        name: debtName,
        tokenAddress: debtToken,
        decimals: debtDecimals,
        type: "borrow" as const,
    }), [debtName, debtToken, debtDecimals]);

    // Flash Loan Providers
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: positionForFlashLoan,
    });

    // "From" is fixed (debt to repay) - user inputs how much debt to repay
    const fromAsset: SwapAsset = useMemo(() => ({
        symbol: debtName,
        address: debtToken,
        decimals: debtDecimals,
        rawBalance: debtBalance,
        balance: parseFloat(formatUnits(debtBalance, debtDecimals)),
        icon: debtIcon,
        price: debtPrice,
    }), [debtName, debtToken, debtDecimals, debtBalance, debtIcon, debtPrice]);

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(fromAsset);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null); // Collateral to sell
    const [slippage, setSlippage] = useState<number>(0.1); // Managed by useAutoSlippage after quotes
    const [amountIn, setAmountIn] = useState(""); // Amount of debt to repay
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ============ Limit Order State ============
    const [executionType, setExecutionType] = useState<ExecutionType>("market");
    const [limitOrderConfig, setLimitOrderConfig] = useState<LimitOrderResult | null>(null);
    const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
    const [useBatchedTx, setUseBatchedTx] = useState<boolean>(false);
    const [lastOrderSalt, setLastOrderSalt] = useState<string | null>(null);
    const [limitOrderNotificationId, setLimitOrderNotificationId] = useState<string | number | null>(null);
    const cowAvailable = isCowProtocolSupported(chainId);

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

    // Callback for LimitOrderConfig
    const handleLimitOrderConfigChange = useCallback((config: LimitOrderResult) => {
        setLimitOrderConfig(config);
    }, []);

    // Callback for ExecutionTypeToggle onChange
    const handleExecutionTypeChange = useCallback((type: ExecutionType) => {
        setExecutionType(type);
        // Set higher default slippage for limit orders (1% minimum for better fill rates)
        if (type === "limit" && slippage < 1) setSlippage(1);
    }, [slippage]);

    // Memoize sellToken for LimitOrderConfig to prevent infinite re-renders
    const limitOrderSellToken = useMemo(() => selectedTo ? ({
        symbol: selectedTo.symbol,
        decimals: selectedTo.decimals,
        address: selectedTo.address,
    }) : null, [selectedTo]);

    // Ensure "From" is always the debt token
    useEffect(() => {
        const fromMismatch = !selectedFrom || selectedFrom.address !== debtToken;
        if (fromMismatch) {
            setSelectedFrom(fromAsset);
        }
    }, [selectedFrom, debtToken, fromAsset]);

    // Filter "To" assets (collaterals with balance, exclude debt token)
    const toAssets = useMemo(() =>
        (availableCollaterals || []).filter(a => a.rawBalance > 0n && a.address.toLowerCase() !== debtToken.toLowerCase()),
        [availableCollaterals, debtToken]
    );

    // Auto-switch to Pendle when a PT token is selected as collateral
    useEffect(() => {
        const shouldSwitchToPendle = selectedTo && isPendleToken(selectedTo.symbol) && pendleAvailable;
        if (shouldSwitchToPendle) {
            setSwapRouter("pendle");
        }
    }, [selectedTo, pendleAvailable]);

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
                message="Limit order created! Position will close when order fills."
                blockExplorerLink={explorerUrl}
            />
        );

        console.log("[Limit Order] Batch confirmed, salt:", lastOrderSalt);
        console.log("[Limit Order] Batch confirmed - check CoW Explorer for order status");

        setLastOrderSalt(null);
        setLimitOrderNotificationId(null);
        setIsLimitSubmitting(false);
        onClose();
    }, [isBatchConfirmed, executionType, orderManagerAddress, chainId, lastOrderSalt, limitOrderNotificationId, onClose]);

    // Amount of debt to repay in raw
    const repayAmountRaw = useMemo(() => {
        const result = parseAmount(amountIn || "0", debtDecimals);
        return result.value ?? 0n;
    }, [amountIn, debtDecimals]);

    // Flash Loan selection - we flash loan the DEBT token to repay
    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: debtToken,
        amount: repayAmountRaw,
        chainId,
    });

    // Step 1: Get unit quote (1 collateral -> X debt) to estimate exchange rate
    const unitQuoteAmount = useMemo(() => {
        if (!selectedTo) return "0";
        return parseUnits("1", selectedTo.decimals).toString();
    }, [selectedTo]);

    // 1inch unit quote (only fetch when 1inch router is selected)
    const { data: oneInchUnitQuote, isLoading: isOneInchUnitQuoteLoading } = use1inchQuoteOnly({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtToken,
        amount: unitQuoteAmount,
        enabled: oneInchAvailable && swapRouter === "1inch" && !!selectedTo && isOpen,
    });

    // Pendle unit quote (only fetch when Pendle router is selected)
    const { data: pendleUnitQuote, isLoading: isPendleUnitQuoteLoading } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedTo?.address as Address,
        tokensOut: debtToken,
        amountsIn: unitQuoteAmount,
        slippage: 0.03, // 3% for unit quote
        enabled: pendleAvailable && swapRouter === "pendle" && !!selectedTo && !!pendleAdapter && isOpen && unitQuoteAmount !== "0",
    });

    const isUnitQuoteLoading = swapRouter === "1inch" ? isOneInchUnitQuoteLoading : isPendleUnitQuoteLoading;

    // Calculate required collateral based on debt to repay
    const { requiredCollateral, requiredCollateralFormatted, exchangeRate } = useMemo(() => {
        return calculateRequiredCollateral({
            selectedTo,
            repayAmountRaw,
            oneInchUnitQuote,
            pendleUnitQuote,
            debtDecimals,
            slippage,
        });
    }, [oneInchUnitQuote, pendleUnitQuote, selectedTo, repayAmountRaw, debtDecimals, slippage]);

    // Check if user has enough collateral (using shared utility)
    const hasEnoughCollateral = selectedTo ? checkCollateralSufficiency(requiredCollateral, selectedTo.rawBalance) : false;

    // Step 2: Get actual swap quote with the required collateral amount
    const minSwapAmount = selectedTo ? parseUnits("0.0001", selectedTo.decimals) : 0n;
    const oneInchSwapEnabled = oneInchAvailable && swapRouter === "1inch" && requiredCollateral > minSwapAmount && !!selectedTo && !!oneInchAdapter && isOpen;
    const pendleSwapEnabled = pendleAvailable && swapRouter === "pendle" && requiredCollateral > minSwapAmount && !!selectedTo && !!pendleAdapter && isOpen;

    // 1inch quote
    const { data: oneInchSwapQuote, isLoading: is1inchSwapQuoteLoading, error: oneInchQuoteError } = use1inchQuote({
        chainId,
        src: selectedTo?.address as Address,
        dst: debtToken,
        amount: requiredCollateral.toString(),
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
        tokensOut: debtToken,
        amountsIn: requiredCollateral.toString(),
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

    // amountOut = required collateral (what user will sell)
    const amountOut = requiredCollateralFormatted;

    // ============ Limit Order: CoW Quote ============
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedTo?.address || "",       // Collateral to sell
        buyToken: debtToken,                         // Debt to receive
        buyAmount: repayAmountRaw.toString(),       // Exact debt amount we need
        kind: "buy",                                 // KIND_BUY: exact buy, max sell
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && repayAmountRaw > 0n && !!selectedTo && !!userAddress && isOpen,
    });

    // ============ Limit Order: Collateral from CoW Quote ============
    const limitOrderCollateral = useMemo(() => {
        return calculateLimitOrderCollateral(cowQuote, selectedTo, slippage);
    }, [cowQuote, selectedTo, slippage]);

    // Check if user has enough collateral for limit order
    const hasEnoughCollateralForLimit = selectedTo && limitOrderCollateral > 0n
        ? checkCollateralSufficiency(limitOrderCollateral, selectedTo.rawBalance)
        : hasEnoughCollateral;

    // ============ Limit Order: Flash Loan Info ============
    const cowFlashLoanInfo = useMemo(() => {
        return buildCowFlashLoanInfo(chainId, limitOrderConfig, executionType, selectedTo, limitOrderCollateral);
    }, [chainId, limitOrderConfig, executionType, limitOrderCollateral, selectedTo]);

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
            debtToken,
            debtName,
            debtDecimals,
            cowFlashLoanInfo,
            limitOrderConfig,
        });
    }, [selectedTo, userAddress, repayAmountRaw, orderManagerAddress, protocolName, context, debtToken, debtName, debtDecimals, cowFlashLoanInfo, limitOrderConfig]);

    const buildFlow = () => {
        if (!swapQuote || !selectedTo || !hasAdapter || requiredCollateral === 0n) return [];

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        // For Aave flash loans, the swap needs to output enough to cover the flash loan repayment
        const isAave = providerEnum === FlashLoanProvider.Aave || providerEnum === FlashLoanProvider.ZeroLend;
        const swapMinAmountOut = isAave
            ? repayAmountRaw + (repayAmountRaw * AAVE_FLASH_LOAN_FEE_BPS / 10000n)
            : repayAmountRaw;

        return buildCloseWithCollateralFlow(
            protocolName,
            selectedTo.address,      // collateral to sell
            debtToken,               // debt to repay
            requiredCollateral,      // max collateral to sell (with buffer)
            swapMinAmountOut,        // minAmountOut for swap (includes Aave fee if applicable)
            swapQuote.tx.data,       // swap data
            providerEnum,            // flash loan provider
            context,
            isMax,                   // if true, uses GetBorrowBalance for exact debt amount on-chain
            swapRouter === "1inch" ? "oneinch" : "pendle",
        );
    };

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
            debtToken: debtToken,
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
    }, [protocolName, chainId, debtToken, debtName, selectedTo?.address, selectedTo?.symbol, amountIn, isMax, slippage, preferBatching, selectedProvider?.name, swapRouter, context, handleSwap]);

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
            debtToken,
            debtName,
            selectedTo,
            repayAmountRaw,
            debtDecimals,
            limitOrderCollateral,
            requiredCollateral,
            flashLoanProviderName: limitOrderConfig.selectedProvider.name,
        });

        setIsLimitSubmitting(true);
        let notificationId: string | number | undefined;

        try {
            track("close_with_collateral_limit_order_begin", analyticsProps);

            logLimitOrderBuildStart({
                selectedTo,
                debtName,
                limitOrderCollateral,
                repayAmountRaw,
                debtDecimals,
                cowFlashLoanInfo,
                cowQuote,
            });

            // Build limit order calls
            const callParams = buildLimitOrderCallParams({
                selectedTo,
                debtToken,
                limitOrderCollateral,
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
                selectedTo.symbol,
                debtName,
                chainId
            );

            const allCalls = limitOrderResult.calls;
            notificationId = notification.loading(
                <TransactionToast step="pending" message={`Creating limit order (${allCalls.length} operations)...`} />
            );

            if (useBatchedTx) {
                // Wrap sendCallsAsync to match the expected signature
                const wrappedSendCalls = async (params: { calls: readonly { to: `0x${string}`; data?: `0x${string}`; value?: bigint }[] }): Promise<{ id: string }> => {
                    return sendCallsAsync({ calls: params.calls });
                };
                await executeBatchedLimitOrder({
                    allCalls,
                    sendCallsAsync: wrappedSendCalls,
                    setSuppressBatchNotifications,
                    setBatchId,
                    setLastOrderSalt,
                    setLimitOrderNotificationId,
                    salt: limitOrderResult.salt,
                    appDataHash: limitOrderResult.appDataHash,
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
                    userAddress,
                    salt: limitOrderResult.salt,
                    appDataHash: limitOrderResult.appDataHash,
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
    }, [selectedTo, userAddress, orderManagerAddress, walletClient, publicClient, limitOrderConfig, cowFlashLoanInfo, protocolName, chainId, debtToken, debtName, repayAmountRaw, debtDecimals, limitOrderCollateral, requiredCollateral, cowQuote, buildCowInstructions, buildLimitOrderCalls, useBatchedTx, sendCallsAsync, setBatchId, setSuppressBatchNotifications, onClose]);

    // Can submit based on execution type
    const canSubmitMarket = !!swapQuote && parseFloat(amountIn) > 0 && hasEnoughCollateral && hasAdapter;
    const canSubmitLimit = executionType === "limit" && limitOrderReady && !!cowFlashLoanInfo &&
        parseFloat(amountIn) > 0 && hasEnoughCollateralForLimit && !!orderManagerAddress && limitOrderCollateral > 0n;
    const canSubmit = executionType === "market" ? canSubmitMarket : canSubmitLimit;

    // What the swap will actually produce
    const expectedOutput = swapQuote
        ? formatUnits(BigInt(swapQuote.dstAmount), debtDecimals)
        : "0";

    // Is the expected output enough to cover the repay?
    const outputCoversRepay = swapQuote
        ? BigInt(swapQuote.dstAmount) >= repayAmountRaw
        : false;

    // Calculate USD values from token prices for price impact fallback
    // (1inch v6.0 API doesn't return srcUSD/dstUSD, so we compute from token prices)
    // Swap is: collateral (selectedTo) → debt token (debtToken)
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

    // Auto-slippage and price impact calculation
    const { priceImpact, priceImpactColorClass, formattedPriceImpact } = useAutoSlippage({
        slippage,
        setSlippage,
        oneInchQuote: oneInchSwapQuote,
        pendleQuote: pendleQuoteData,
        swapRouter,
        resetDep: selectedTo?.address,
        srcUsdFallback,
        dstUsdFallback,
    });

    // Custom stats for close with collateral - using shared components
    const customStats = useMemo(() => (
        <div className="space-y-2">
            {/* Execution Type Toggle */}
            <ExecutionTypeToggle
                value={executionType}
                onChange={handleExecutionTypeChange}
                limitAvailable={cowAvailable}
                limitReady={limitOrderReady}
            />

            {/* Limit Order Config */}
            {executionType === "limit" && selectedTo && limitOrderSellToken && (
                <LimitOrderSection
                    chainId={chainId}
                    sellToken={limitOrderSellToken}
                    totalAmount={limitOrderCollateral || requiredCollateral}
                    onConfigChange={handleLimitOrderConfigChange}
                    limitOrderConfig={limitOrderConfig}
                    isCowQuoteLoading={isCowQuoteLoading}
                    showBatchedToggle={true}
                    useBatchedTx={useBatchedTx}
                    setUseBatchedTx={setUseBatchedTx}
                    className="bg-base-200/30 mb-2 rounded p-2"
                />
            )}

            {/* Market order stats */}
            {executionType === "market" && (
                <MarketSwapStats
                    slippage={slippage}
                    setSlippage={setSlippage}
                    priceImpact={priceImpact}
                    priceImpactClass={priceImpactColorClass}
                    formattedPriceImpact={formattedPriceImpact}
                    exchangeRate={parseFloat(exchangeRate).toFixed(2)}
                    fromSymbol={selectedTo?.symbol}
                    toSymbol={debtName}
                    expectedOutput={swapQuote ? parseFloat(expectedOutput).toFixed(4) : undefined}
                    outputCoversRequired={outputCoversRepay}
                />
            )}

            {/* Limit order stats */}
            {executionType === "limit" && cowQuote && (
                <MarketSwapStats
                    slippage={slippage}
                    setSlippage={setSlippage}
                    exchangeRate={parseFloat(exchangeRate).toFixed(2)}
                    fromSymbol={selectedTo?.symbol}
                    toSymbol={debtName}
                    expectedOutput={formatUnits(getCowQuoteBuyAmount(cowQuote), debtDecimals)}
                    outputCoversRequired={true}
                />
            )}

            {/* Show USD values if available (market order only) */}
            {executionType === "market" && srcUsdFallback !== undefined && dstUsdFallback !== undefined && (
                <div className="text-base-content/60 flex justify-between px-1 text-xs">
                    <span>Selling: ~${srcUsdFallback.toFixed(2)}</span>
                    <span>Receiving: ~${dstUsdFallback.toFixed(2)}</span>
                </div>
            )}
        </div>
    ), [executionType, handleExecutionTypeChange, cowAvailable, limitOrderReady, selectedTo, limitOrderSellToken, chainId, limitOrderCollateral, requiredCollateral, handleLimitOrderConfigChange, limitOrderConfig, isCowQuoteLoading, useBatchedTx, setUseBatchedTx, slippage, setSlippage, priceImpact, priceImpactColorClass, formattedPriceImpact, exchangeRate, debtName, swapQuote, expectedOutput, outputCoversRepay, cowQuote, debtDecimals, srcUsdFallback, dstUsdFallback]);

    // Info content
    const infoContent = useMemo(() => (
        <CloseWithCollateralInfoContent
            swapRouter={swapRouter}
            debtBalance={debtBalance}
            debtDecimals={debtDecimals}
            debtName={debtName}
        />
    ), [swapRouter, debtBalance, debtDecimals, debtName]);

    // Warnings
    const warnings = useMemo(() => (
        <CloseWithCollateralWarnings
            hasEnoughCollateral={hasEnoughCollateral}
            requiredCollateral={requiredCollateral}
            selectedTo={selectedTo}
            requiredCollateralFormatted={requiredCollateralFormatted}
            swapRouter={swapRouter}
            swapQuote={swapQuote}
            oneInchAdapter={oneInchAdapter}
            hasAdapter={hasAdapter}
            isOpen={isOpen}
        />
    ), [hasEnoughCollateral, requiredCollateral, selectedTo, requiredCollateralFormatted, swapRouter, swapQuote, oneInchAdapter, hasAdapter, isOpen]);

    // Hide dropdown when there's only one collateral option (e.g., Morpho isolated pairs)
    const singleCollateral = toAssets.length === 1;

    // Memoize fromAssets array to avoid recreation on every render
    const fromAssetsArray = useMemo(() => [fromAsset], [fromAsset]);

    // Pre-compute execution type dependent props to reduce cognitive complexity in JSX
    const isMarketExecution = executionType === "market";
    const quoteLoadingProp = isMarketExecution ? isQuoteLoading : isCowQuoteLoading;
    const quoteErrorProp = isMarketExecution ? quoteError : null;
    const flashLoanProvidersProp = isMarketExecution ? flashLoanProviders : undefined;
    const selectedProviderProp = isMarketExecution ? selectedProvider : undefined;
    const setSelectedProviderProp = isMarketExecution ? setSelectedProvider : undefined;
    const liquidityDataProp = isMarketExecution ? liquidityData : undefined;
    const swapRouterProp = isMarketExecution ? swapRouter : undefined;
    const canSetSwapRouter = isMarketExecution && oneInchAvailable && pendleAvailable;
    const setSwapRouterProp = canSetSwapRouter ? setSwapRouter : undefined;
    const preferBatchingProp = isMarketExecution ? preferBatching : undefined;
    const setPreferBatchingProp = isMarketExecution ? setPreferBatching : undefined;
    const onSubmitHandler = isMarketExecution ? handleSwapWrapper : handleLimitOrderSubmit;
    const isSubmittingProp = isMarketExecution ? isSubmitting : isLimitSubmitting;
    const submitLabelProp = isMarketExecution ? "Close Position" : "Create Limit Order";

    return (
        <SwapModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Close with Collateral"
            protocolName={protocolName}
            fromAssets={fromAssetsArray}
            toAssets={toAssets}
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
            flashLoanProviders={flashLoanProvidersProp}
            selectedProvider={selectedProviderProp}
            setSelectedProvider={setSelectedProviderProp}
            flashLoanLiquidityData={liquidityDataProp}
            swapRouter={swapRouterProp}
            setSwapRouter={setSwapRouterProp}
            preferBatching={preferBatchingProp}
            setPreferBatching={setPreferBatchingProp}
            onSubmit={onSubmitHandler}
            isSubmitting={isSubmittingProp}
            canSubmit={canSubmit}
            submitLabel={submitLabelProp}
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Debt to Repay"
            toLabel="Collateral to Sell"
            fromReadOnly={true}
            toReadOnly={singleCollateral}
            customStats={customStats}
        />
    );
};

// ============ Sub-components to reduce main component complexity ============

interface CloseWithCollateralInfoContentProps {
    swapRouter: SwapRouter;
    debtBalance: bigint;
    debtDecimals: number;
    debtName: string;
}

const CloseWithCollateralInfoContent: FC<CloseWithCollateralInfoContentProps> = ({
    swapRouter,
    debtBalance,
    debtDecimals,
    debtName,
}) => (
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
                    Collateral is swapped for the debt token using {swapRouter === "1inch" ? "1inch" : "Pendle"}.
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

interface CloseWithCollateralWarningsProps {
    hasEnoughCollateral: boolean;
    requiredCollateral: bigint;
    selectedTo: SwapAsset | null;
    requiredCollateralFormatted: string;
    swapRouter: SwapRouter;
    swapQuote: { dstAmount: string; tx: { data: string; from?: string }; srcUSD?: string | null; dstUSD?: string | null } | null | undefined;
    oneInchAdapter: { address: string } | null | undefined;
    hasAdapter: boolean;
    isOpen: boolean;
}

const CloseWithCollateralWarnings: FC<CloseWithCollateralWarningsProps> = ({
    hasEnoughCollateral,
    requiredCollateral,
    selectedTo,
    requiredCollateralFormatted,
    swapRouter,
    swapQuote,
    oneInchAdapter,
    hasAdapter,
    isOpen,
}) => {
    const showInsufficientCollateralWarning = !hasEnoughCollateral && requiredCollateral > 0n && selectedTo;
    const showFromMismatchWarning = swapRouter === "1inch" && swapQuote && oneInchAdapter && "from" in swapQuote.tx && swapQuote.tx.from?.toLowerCase() !== oneInchAdapter.address.toLowerCase();
    const showNoAdapterWarning = !hasAdapter && isOpen;

    return (
        <>
            {showInsufficientCollateralWarning && (
                <WarningDisplay
                    message={`Insufficient collateral. Need ~${requiredCollateralFormatted} ${selectedTo.symbol}, but you only have ${formatUnits(selectedTo.rawBalance, selectedTo.decimals)} ${selectedTo.symbol}.`}
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
        </>
    );
};
