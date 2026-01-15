import { FC, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseAmount } from "~~/utils/validation";
import { Tooltip } from "@radix-ui/themes";

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
import { getCowFlashLoanProviders, getPreferredFlashLoanLender, calculateFlashLoanFee } from "~~/utils/cow";
import { is1inchSupported, isPendleSupported, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { InformationCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";
import {
    ExecutionTypeToggle,
    type ExecutionType,
    hasEnoughCollateral as checkCollateralSufficiency,
} from "./common";
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
    executeSequentialLimitOrder,
    handleLimitOrderError,
    shouldSwitchSwapRouter,
    calculateRequiredCollateral,
    calculateLimitOrderCollateral,
} from "./closeWithCollateralEvmHelpers";

// Aave flash loan fee: 5 bps (0.05%)
// We add a small buffer (10 bps total) to ensure swap covers repayment
const AAVE_FLASH_LOAN_FEE_BPS = 10n;

// Buffer for max limit orders to account for interest accrual.
// 1 basis point (0.01%) is roughly equivalent to 1 hour of interest at ~87% APY,
// which is more than enough buffer for typical DeFi rates (3-20% APY).
// For a 10% APY position, this covers about 8 hours of interest accrual.
const MAX_LIMIT_ORDER_BUFFER_BPS = 1n;

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
    const [numChunks, setNumChunks] = useState(1);
    const [isLimitSubmitting, setIsLimitSubmitting] = useState(false);
    const cowAvailable = isCowProtocolSupported(chainId);
    // Custom buy amount for limit orders (user-editable)
    const [customBuyAmount, setCustomBuyAmount] = useState<string>("");
    const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);

    // Wallet hooks for limit order
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();

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

    // Callback for ExecutionTypeToggle onChange
    const handleExecutionTypeChange = useCallback((type: ExecutionType) => {
        setExecutionType(type);
        // Set higher default slippage for limit orders (1% minimum for better fill rates)
        if (type === "limit" && slippage < 1) setSlippage(1);
    }, [slippage]);

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

    // Amount of debt to repay in raw
    const repayAmountRaw = useMemo(() => {
        const result = parseAmount(amountIn || "0", debtDecimals);
        return result.value ?? 0n;
    }, [amountIn, debtDecimals]);

    // For max limit orders, add a small buffer to account for interest accrual
    // between quote time and order fill time. The buffer ensures we buy enough
    // debt tokens to fully repay even if interest accrues. Any excess is refunded.
    const limitOrderBuyAmount = useMemo(() => {
        if (!isMax || executionType !== "limit") return repayAmountRaw;
        // Add buffer: repayAmount * (1 + buffer/10000)
        return repayAmountRaw + (repayAmountRaw * MAX_LIMIT_ORDER_BUFFER_BPS) / 10000n;
    }, [repayAmountRaw, isMax, executionType]);

    // Flash Loan selection - we flash loan the DEBT token to repay
    const { selectedProvider, setSelectedProvider } = useFlashLoanSelection({
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

    // ============ Limit Order: CoW Quote ============
    // Use limitOrderBuyAmount which includes buffer for isMax orders
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedTo?.address || "",       // Collateral to sell
        buyToken: debtToken,                         // Debt to receive
        buyAmount: limitOrderBuyAmount.toString(),  // Debt amount (buffered for isMax)
        kind: "buy",                                 // KIND_BUY: exact buy, max sell
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && limitOrderBuyAmount > 0n && !!selectedTo && !!userAddress && isOpen,
    });

    // ============ Limit Order: Collateral from CoW Quote (or fallback to 1inch/Pendle) ============
    const limitOrderCollateral = useMemo(() => {
        // Try CoW quote first
        const cowCollateral = calculateLimitOrderCollateral(cowQuote, selectedTo, slippage);
        if (cowCollateral > 0n) return cowCollateral;

        // Fallback to 1inch/Pendle quote if CoW fails
        // This allows limit orders to work even when CoW can't quote the pair
        if (requiredCollateral > 0n) {
            console.log("[Limit Order] CoW quote unavailable, using 1inch/Pendle quote as fallback");
            return requiredCollateral;
        }

        return 0n;
    }, [cowQuote, selectedTo, slippage, requiredCollateral]);

    // amountOut = required collateral (what user will sell)
    const amountOut = useMemo(() => {
        // For limit orders, use custom amount if user has set one
        if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
            return customBuyAmount;
        }
        // For limit orders, use CoW quote-based collateral; for market, use 1inch/Pendle
        if (executionType === "limit" && limitOrderCollateral > 0n && selectedTo) {
            return formatUnits(limitOrderCollateral, selectedTo.decimals);
        }
        return requiredCollateralFormatted;
    }, [executionType, useCustomBuyAmount, customBuyAmount, limitOrderCollateral, selectedTo, requiredCollateralFormatted]);

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
            repayAmountRaw: limitOrderBuyAmount, // Use buffered amount for isMax orders
            orderManagerAddress,
            protocolName,
            context,
            debtToken,
            debtName,
            debtDecimals,
            cowFlashLoanInfo,
            limitOrderConfig,
            isMax, // When true, adds PushToken to return any repay refund to user
        });
    }, [selectedTo, userAddress, limitOrderBuyAmount, orderManagerAddress, protocolName, context, debtToken, debtName, debtDecimals, cowFlashLoanInfo, limitOrderConfig, isMax]);

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
            // Use limitOrderBuyAmount which includes buffer for isMax orders
            const callParams = buildLimitOrderCallParams({
                selectedTo,
                debtToken,
                limitOrderCollateral,
                repayAmountRaw: limitOrderBuyAmount,
                cowFlashLoanInfo,
                buildCowInstructions,
                limitOrderConfig,
                protocolName,
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

            // Always use sequential execution for limit orders
            // MetaMask has issues with approvals in batched calls that may go unused
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
        } catch (e) {
            handleLimitOrderError(e, notificationId, analyticsProps);
            throw e;
        } finally {
            setIsLimitSubmitting(false);
        }
    }, [selectedTo, userAddress, orderManagerAddress, walletClient, publicClient, limitOrderConfig, cowFlashLoanInfo, protocolName, chainId, debtToken, debtName, repayAmountRaw, limitOrderBuyAmount, debtDecimals, limitOrderCollateral, requiredCollateral, cowQuote, buildCowInstructions, buildLimitOrderCalls, onClose]);

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

    // Right panel for close with collateral - Market/Limit settings
    const rightPanel = useMemo(() => (
        <div className="space-y-3">
            {/* Execution Type Toggle */}
            <ExecutionTypeToggle
                value={executionType}
                onChange={handleExecutionTypeChange}
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
                                {[0.1, 0.3, 0.5, 1, 3].map(s => (
                                    <option key={s} value={s}>{s}%</option>
                                ))}
                            </select>
                        </div>
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
                                    1:{parseFloat(exchangeRate).toFixed(2)}
                                </span>
                            </div>
                        )}
                        {swapQuote && expectedOutput && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Output</span>
                                <span className={outputCoversRepay === false ? "text-warning" : outputCoversRepay === true ? "text-success" : "text-base-content/80"}>
                                    {parseFloat(expectedOutput).toFixed(4)} {debtName}
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
                    {selectedTo && limitOrderCollateral > 0n && repayAmountRaw > 0n && (
                        <div className="bg-base-200/50 space-y-1 rounded p-2">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Limit Price</span>
                                <span className="text-base-content/80 font-medium">
                                    {isCowQuoteLoading ? (
                                        <span className="loading loading-dots loading-xs" />
                                    ) : (
                                        `1 ${debtName} = ${(Number(formatUnits(limitOrderCollateral, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtDecimals))).toFixed(4)} ${selectedTo.symbol}`
                                    )}
                                </span>
                            </div>
                            {exchangeRate && (
                                <div className="text-center text-[10px]">
                                    {(() => {
                                        const limitRate = Number(formatUnits(limitOrderCollateral, selectedTo.decimals)) / Number(formatUnits(repayAmountRaw, debtDecimals));
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
                            {numChunks > 1 && limitOrderCollateral > 0n && (
                                <div className="text-base-content/50 text-[10px]">
                                    Max {formatUnits(limitOrderCollateral / BigInt(numChunks), selectedTo.decimals).slice(0, 8)} {selectedTo.symbol} per chunk
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}
        </div>
    ), [executionType, handleExecutionTypeChange, cowAvailable, limitOrderReady, slippage, setSlippage, priceImpact, formattedPriceImpact, exchangeRate, debtName, swapQuote, expectedOutput, outputCoversRepay, flashLoanProviders, selectedProvider, setSelectedProvider, selectedTo, limitOrderConfig, numChunks, setNumChunks, limitOrderCollateral, isCowQuoteLoading, repayAmountRaw, debtDecimals]);

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
    const preferBatchingProp = isMarketExecution ? preferBatching : undefined;
    const setPreferBatchingProp = isMarketExecution ? setPreferBatching : undefined;
    const onSubmitHandler = isMarketExecution ? handleSwapWrapper : handleLimitOrderSubmit;
    const isSubmittingProp = isMarketExecution ? isSubmitting : isLimitSubmitting;
    const submitLabelProp = isMarketExecution ? "Close Position" : "Create Limit Order";

    // Handler for when user edits the output amount (limit orders)
    const handleAmountOutChange = useCallback((value: string) => {
        setCustomBuyAmount(value);
        setUseCustomBuyAmount(true);
    }, []);

    // Limit price adjustment buttons (shown below "Collateral to Sell" for limit orders)
    const limitPriceButtons = useMemo(() => {
        if (executionType !== "limit" || !selectedTo || limitOrderCollateral === 0n) return null;

        const adjustByPercent = (delta: number) => {
            // Use current effective amount for additive adjustments
            const currentAmount = useCustomBuyAmount && customBuyAmount
                ? parseFloat(customBuyAmount)
                : Number(formatUnits(limitOrderCollateral, selectedTo.decimals));
            if (isNaN(currentAmount)) return;
            const newAmount = currentAmount * (1 + delta / 100);
            setCustomBuyAmount(newAmount.toFixed(6));
            setUseCustomBuyAmount(true);
        };

        const resetToMarket = () => {
            // Reset to exact CoW quote price
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
                <button
                    onClick={resetToMarket}
                    className="bg-base-300/50 hover:bg-base-300 rounded px-2 py-0.5 text-[10px]"
                >
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
            hideDefaultStats={true}
            rightPanel={rightPanel}
            onAmountOutChange={executionType === "limit" ? handleAmountOutChange : undefined}
            limitPriceButtons={limitPriceButtons}
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

    const hasAnyWarning = showInsufficientCollateralWarning || showFromMismatchWarning || showNoAdapterWarning;

    // Reserved space container to prevent modal hopping
    return (
        <div className="min-h-[24px]">
            {hasAnyWarning && (
                <div className="text-warning/90 flex items-start gap-1.5 text-xs">
                    <ExclamationTriangleIcon className="mt-0.5 size-3.5 flex-shrink-0" />
                    <span>
                        {showInsufficientCollateralWarning && (
                            <>Need ~{requiredCollateralFormatted} {selectedTo.symbol}, have {Number(formatUnits(selectedTo.rawBalance, selectedTo.decimals)).toFixed(4)}</>
                        )}
                        {showFromMismatchWarning && "Quote address mismatch"}
                        {showNoAdapterWarning && `${swapRouter === "1inch" ? "1inch" : "Pendle"} adapter unavailable`}
                    </span>
                </div>
            )}
        </div>
    );
};
