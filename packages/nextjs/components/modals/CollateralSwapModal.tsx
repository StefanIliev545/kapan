import { FC, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, Address, PublicClient, WalletClient } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseAmount } from "~~/utils/validation";

import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useCowQuote } from "~~/hooks/useCowQuote";
import { useCowLimitOrder, type ChunkInstructions, type BuildOrderResult } from "~~/hooks/useCowLimitOrder";

// Aave flash loan fee buffer: 9 bps (0.09%)
// When using Aave with isMax, we need to quote for a reduced amount
// because Split will carve out the fee buffer before the flash loan
const AAVE_FEE_BUFFER_BPS = 9n;
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { BasicCollateral, useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import {
  FlashLoanProvider,
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodeApprove,
  encodeLendingInstruction,
  encodePushToken,
  LendingOp,
  normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import { is1inchSupported, isPendleSupported, getDefaultSwapRouter, getOneInchAdapterInfo, getPendleAdapterInfo, isPendleToken, isCowProtocolSupported } from "~~/utils/chainFeatures";
import { CompletionType, getCowExplorerAddressUrl, getPreferredFlashLoanLender, calculateFlashLoanFee } from "~~/utils/cow";
import { calculateSuggestedSlippage } from "~~/utils/slippage";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { SwapModalShell, SwapAsset, SwapRouter } from "./SwapModalShell";
import {
    ExecutionTypeToggle,
    type ExecutionType,
} from "./common";
import { Tooltip } from "@radix-ui/themes";
import { WarningDisplay } from "~~/components/common/ErrorDisplay";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { useSendCalls } from "wagmi/experimental";
import { saveOrderNote, createCollateralSwapNote } from "~~/utils/orderNotes";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface LimitOrderParams {
    selectedFrom: SwapAsset;
    selectedTo: SwapAsset;
    userAddress: Address;
    orderManagerAddress: Address;
    amountInBigInt: bigint;
    minBuyAmount: { raw: bigint; formatted: string };
    cowFlashLoanInfo: { lender: Address; provider: string; fee: bigint };
    buildCowInstructions: ChunkInstructions[];
    numChunks: number;
    protocolName: string;
    chainId: number;
    buildLimitOrderCalls: ReturnType<typeof useCowLimitOrder>["buildOrderCalls"];
}

interface OrderExecutionParams {
    limitOrderResult: BuildOrderResult;
    userAddress: Address;
    chainId: number;
    orderManagerAddress: Address | undefined;
    sendCallsAsync: ReturnType<typeof useSendCalls>["sendCallsAsync"] | undefined;
    walletClient: WalletClient | undefined;
    publicClient: PublicClient | undefined;
}

// ============================================================================
// Helper Functions (outside component to reduce complexity)
// ============================================================================

/**
 * Builds limit order result by calling the order builder hook.
 */
async function buildLimitOrder(params: LimitOrderParams): Promise<BuildOrderResult> {
    const {
        selectedFrom, selectedTo, amountInBigInt, minBuyAmount,
        cowFlashLoanInfo, buildCowInstructions, numChunks, buildLimitOrderCalls
    } = params;

    console.log("[Limit Order] Building collateral swap order:", {
        sellToken: selectedFrom.address,
        buyToken: selectedTo.address,
        amount: formatUnits(amountInBigInt, selectedFrom.decimals),
        minBuy: formatUnits(minBuyAmount.raw, selectedTo.decimals),
        flashLoanLender: cowFlashLoanInfo.lender,
    });

    const chunkSellAmount = amountInBigInt / BigInt(numChunks);
    const chunkMinBuyAmount = minBuyAmount.raw / BigInt(numChunks);
    const chunkFlashLoanAmount = chunkSellAmount;

    // All postInstructions are included for authorization.
    // The gateway's authorize() adds buffer to GetSupplyBalance for dust clearing.
    const result = await buildLimitOrderCalls({
        sellToken: selectedFrom.address as Address,
        buyToken: selectedTo.address as Address,
        chunkSize: chunkSellAmount,
        minBuyPerChunk: chunkMinBuyAmount,
        totalAmount: amountInBigInt,
        chunks: buildCowInstructions,
        completion: CompletionType.Iterations,
        targetValue: numChunks,
        minHealthFactor: "1.1",
        seedAmount: 0n,
        flashLoan: {
            lender: cowFlashLoanInfo.lender,
            token: selectedFrom.address as Address,
            amount: chunkFlashLoanAmount,
        },
        preOrderInstructions: buildCowInstructions[0]?.postInstructions || [],
        isKindBuy: false,
        operationType: "collateral-swap",
    });

    if (!result) {
        throw new Error("Failed to build CoW order calls");
    }

    return result;
}

/**
 * Validates the limit order result and throws if there are errors.
 */
function validateLimitOrderResult(result: BuildOrderResult): void {
    if (result.success) return;

    const errorMsg = result.error || "Unknown error building order";
    const fullError = result.errorDetails?.apiResponse
        ? `${errorMsg}\n\nAPI Response: ${result.errorDetails.apiResponse}`
        : errorMsg;

    console.error("[Limit Order] Build failed:", fullError, result.errorDetails);

    notification.error(
        <TransactionToast step="failed" message={`CoW API Error: ${errorMsg}`} />
    );

    throw new Error(errorMsg);
}

/**
 * Executes the limit order using batched calls (EIP-5792).
 */
async function executeBatchedOrder(
    params: OrderExecutionParams,
    notificationId: string,
    onClose: () => void,
    txBeginProps: Record<string, string | number | boolean | null>
): Promise<void> {
    const { limitOrderResult, chainId, orderManagerAddress, sendCallsAsync } = params;

    if (!sendCallsAsync) {
        throw new Error("sendCallsAsync not available");
    }

    const { id: batchId } = await sendCallsAsync({
        calls: limitOrderResult.calls,
        experimental_fallback: true,
    });

    notification.remove(notificationId);

    const explorerUrl = orderManagerAddress
        ? getCowExplorerAddressUrl(chainId, orderManagerAddress)
        : undefined;

    notification.success(
        <TransactionToast
            step="confirmed"
            message="Limit order created!"
            secondaryLink={explorerUrl}
            secondaryLinkText="View on CoW Explorer"
        />
    );

    track("collateral_swap_limit_order_complete", { ...txBeginProps, status: "success", batchId });
    onClose();
}

/**
 * Executes the limit order sequentially (fallback for non-batching wallets).
 */
async function executeSequentialOrder(
    params: OrderExecutionParams,
    notificationId: string,
    onClose: () => void,
    txBeginProps: Record<string, string | number | boolean | null>
): Promise<void> {
    const { limitOrderResult, userAddress, chainId, walletClient, publicClient } = params;

    if (!walletClient || !publicClient) {
        throw new Error("Wallet not connected");
    }

    for (let i = 0; i < limitOrderResult.calls.length; i++) {
        const call = limitOrderResult.calls[i];
        notification.remove(notificationId);

        const stepNotificationId = notification.loading(
            <TransactionToast step="pending" message={`Executing step ${i + 1}/${limitOrderResult.calls.length}...`} />
        );

        const txHash = await walletClient.sendTransaction({
            account: userAddress,
            to: call.to,
            data: call.data,
            chain: null,
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash });
        notification.remove(stepNotificationId);
    }

    const explorerUrl = getCowExplorerAddressUrl(chainId, userAddress);
    notification.success(
        <TransactionToast
            step="confirmed"
            message="Limit order created!"
            blockExplorerLink={explorerUrl}
        />
    );

    track("collateral_swap_limit_order_complete", { ...txBeginProps, status: "success", mode: "sequential" });
    onClose();
}

/**
 * Saves order note for display on orders page.
 */
function saveOrderNoteIfNeeded(
    salt: string | undefined,
    protocolName: string,
    fromSymbol: string,
    toSymbol: string,
    chainId: number
): void {
    if (!salt) return;

    saveOrderNote(createCollateralSwapNote(
        salt,
        protocolName,
        fromSymbol,
        toSymbol,
        chainId
    ));
}

// ============================================================================
// Quote Calculation Helpers
// ============================================================================

interface QuoteSource {
    source: string;
    amount: bigint;
}

/**
 * Calculates the quote amount, accounting for Aave fee buffer when using max.
 */
function calculateQuoteAmount(
    amountIn: string,
    selectedFrom: SwapAsset | null,
    isMax: boolean,
    providerEnum: FlashLoanProvider | undefined
): string {
    const decimals = selectedFrom?.decimals || 18;
    const baseAmount = isMax && selectedFrom?.rawBalance
        ? selectedFrom.rawBalance
        : parseUnits(amountIn || "0", decimals);

    const isAaveWithMax = isMax && (
        providerEnum === FlashLoanProvider.Aave ||
        providerEnum === FlashLoanProvider.ZeroLend
    );

    if (!isAaveWithMax || baseAmount === 0n) {
        return baseAmount.toString();
    }

    // Match on-chain Split rounding exactly
    const feeAmount = (baseAmount * AAVE_FEE_BUFFER_BPS + 10000n - 1n) / 10000n;
    const principal = baseAmount - feeAmount;
    const safetyBuffer = principal / 10000n;
    return (principal - safetyBuffer).toString();
}

/**
 * Finds the best quote from available sources.
 */
function findBestQuote(
    oneInchQuote: { dstAmount: string } | undefined,
    pendleQuote: { data: { amountPtOut?: string; amountTokenOut?: string } } | undefined,
    cowQuote: { quote?: { buyAmount: string } } | undefined
): QuoteSource | null {
    const quotes: QuoteSource[] = [];

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
    return quotes.reduce((best, current) => current.amount > best.amount ? current : best);
}

/**
 * Calculates the output amount based on execution type and quotes.
 */
function calculateAmountOut(
    executionType: ExecutionType,
    bestQuote: QuoteSource | null,
    swapRouter: SwapRouter,
    oneInchQuote: { dstAmount: string } | undefined,
    pendleQuote: { data: { amountPtOut?: string; amountTokenOut?: string } } | undefined,
    decimals: number
): string {
    if (executionType === "limit" && bestQuote) {
        return formatUnits(bestQuote.amount, decimals);
    }

    if (swapRouter === "1inch" && oneInchQuote) {
        return formatUnits(BigInt(oneInchQuote.dstAmount), decimals);
    }

    if (swapRouter === "pendle" && pendleQuote) {
        const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
        return formatUnits(BigInt(outAmount), decimals);
    }

    return "0";
}

/**
 * Calculates price impact from quote data.
 */
function calculateQuotesPriceImpact(
    swapRouter: SwapRouter,
    pendleQuote: { data: { priceImpact?: number } } | undefined,
    oneInchQuote: { srcUSD?: string; dstUSD?: string } | undefined
): number | null {
    if (swapRouter === "pendle" && pendleQuote?.data?.priceImpact !== undefined) {
        return Math.abs(pendleQuote.data.priceImpact * 100);
    }

    if (swapRouter === "1inch" && oneInchQuote?.srcUSD && oneInchQuote?.dstUSD) {
        const srcUSD = parseFloat(oneInchQuote.srcUSD);
        const dstUSD = parseFloat(oneInchQuote.dstUSD);
        if (srcUSD > 0) {
            return Math.max(0, ((srcUSD - dstUSD) / srcUSD) * 100);
        }
    }

    return null;
}

/**
 * Determines the deposit operation based on protocol.
 */
function getDepositOperation(protocolName: string): LendingOp {
    const normalized = normalizeProtocolName(protocolName);
    const useCollateralOp = normalized === "morpho-blue" || normalized === "compound";
    return useCollateralOp ? LendingOp.DepositCollateral : LendingOp.Deposit;
}

// Extended type to include price info passed from parent
interface ExtendedCollateral extends BasicCollateral {
    usdValue?: number;
    price?: bigint;
}

interface CollateralSwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    protocolName: string;
    availableAssets: ExtendedCollateral[];
    initialFromTokenAddress?: string;
    chainId: number;
    /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
    context?: string;
    position: {
        name: string;
        tokenAddress: string;
        decimals: number;
        balance?: number | bigint;
        type: "borrow" | "supply";
    };
}

export const CollateralSwapModal: FC<CollateralSwapModalProps> = ({
    isOpen,
    onClose,
    protocolName,
    availableAssets,
    initialFromTokenAddress,
    chainId,
    context,
    position,
}) => {
    const { buildCollateralSwapFlow } = useKapanRouterV2();

    // Check swap router availability and get adapter info directly from deployed contracts
    const oneInchAvailable = is1inchSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const oneInchAdapter = getOneInchAdapterInfo(chainId);
    const pendleAdapter = getPendleAdapterInfo(chainId);
    const defaultRouter = getDefaultSwapRouter(chainId);

    // Swap router selection (1inch or Pendle) - default based on chain availability
    const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "1inch");
    
    // Update swap router if chain changes and current router is not available
    useEffect(() => {
        if (swapRouter === "1inch" && !oneInchAvailable) {
            setSwapRouter(pendleAvailable ? "pendle" : "1inch");
        } else if (swapRouter === "pendle" && !pendleAvailable) {
            setSwapRouter(oneInchAvailable ? "1inch" : "pendle");
        }
    }, [chainId, oneInchAvailable, pendleAvailable, swapRouter]);

    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            const modalOpenProps = {
                network: "evm",
                protocol: protocolName,
                chainId,
                market: context ?? null,
                positionType: position.type,
                positionToken: position.tokenAddress,
                positionName: position.name,
                initialFromTokenAddress: initialFromTokenAddress ?? null,
            } satisfies Record<string, string | number | boolean | null>;

            track("collateral_swap_modal_open", modalOpenProps);
        }

        wasOpenRef.current = isOpen;
    }, [chainId, initialFromTokenAddress, isOpen, context, position.name, position.tokenAddress, position.type, protocolName]);

    // Fetch Flash Loan Providers using existing hook logic
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: position || { name: "", tokenAddress: "", decimals: 18, type: "borrow" },
    });

    // Filter assets with balance > 0 for "From" selection
    const userAssets = useMemo(() =>
        availableAssets.filter(a => a.rawBalance > 0n) as SwapAsset[],
        [availableAssets]
    );

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(null);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
    const [slippage, setSlippage] = useState<number>(0.1); // Start with minimum, will auto-adjust
    const [amountIn, setAmountIn] = useState("");
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Execution type: "market" (flash loan, instant) vs "limit" (CoW, async)
    const [executionType, setExecutionType] = useState<ExecutionType>("market");
    
    // CoW limit order specific state
    const [limitSlippage, setLimitSlippage] = useState<number>(0.1);
    const [hasAutoSetLimitSlippage, setHasAutoSetLimitSlippage] = useState(false);
    // Custom buy amount for limit orders (user-editable)
    const [customBuyAmount, setCustomBuyAmount] = useState<string>("");
    const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);
    const cowAvailable = isCowProtocolSupported(chainId);
    
    // Check if we're in a dev environment
    const isDevEnvironment = process.env.NODE_ENV === 'development';
    
    // Get user address for CoW order creation
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { sendCallsAsync } = useSendCalls();
    
    // CoW order hooks
    const { buildOrderCalls: buildLimitOrderCalls, isReady: limitOrderReady, orderManagerAddress } = useCowLimitOrder();

    // Number of chunks for limit orders
    const [numChunks, setNumChunks] = useState(1);

    // Filter "To" assets (exclude selected "From")
    const targetAssets = useMemo(() =>
        availableAssets.filter(a => a.address.toLowerCase() !== selectedFrom?.address.toLowerCase()) as SwapAsset[],
        [availableAssets, selectedFrom]
    );

    // Auto-switch to Pendle when a PT token is involved in the swap
    useEffect(() => {
        const fromIsPT = selectedFrom && isPendleToken(selectedFrom.symbol);
        const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);
        if ((fromIsPT || toIsPT) && pendleAvailable) {
            setSwapRouter("pendle");
        }
    }, [selectedFrom, selectedTo, pendleAvailable]);

    // Flash Loan Liquidity Check & Auto-Selection
    const amountInBigInt = useMemo(() => {
        if (!selectedFrom) return 0n;
        const result = parseAmount(amountIn || "0", selectedFrom.decimals);
        return result.value ?? 0n;
    }, [amountIn, selectedFrom]);

    const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
        flashLoanProviders,
        defaultProvider: defaultFlashLoanProvider,
        tokenAddress: selectedFrom?.address,
        amount: amountInBigInt,
        chainId,
    });

    const quoteAmount = useMemo(
        () => calculateQuoteAmount(amountIn, selectedFrom, isMax, selectedProvider?.providerEnum),
        [amountIn, selectedFrom, isMax, selectedProvider?.providerEnum]
    );

    // 1inch Quote - uses reduced amount when Aave + isMax
    const { data: oneInchQuote, isLoading: is1inchLoading, error: oneInchError } = use1inchQuote({
        chainId,
        src: selectedFrom?.address as Address,
        dst: selectedTo?.address as Address,
        amount: quoteAmount,
        from: oneInchAdapter?.address || "",
        slippage: slippage,
        enabled: oneInchAvailable && swapRouter === "1inch" && !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!oneInchAdapter,
    });

    // Pendle Quote
    const { data: pendleQuote, isLoading: isPendleLoading, error: pendleError } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedFrom?.address as Address,
        tokensOut: selectedTo?.address as Address,
        amountsIn: quoteAmount,
        slippage: slippage / 100, // Pendle uses decimal slippage (0.03 = 3%)
        enabled: pendleAvailable && swapRouter === "pendle" && !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!pendleAdapter,
    });

    // CoW Quote (for limit orders - provides reference price)
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedFrom?.address || "",
        buyToken: selectedTo?.address || "",
        sellAmount: quoteAmount,
        from: userAddress || "",
        enabled: cowAvailable && executionType === "limit" && !!amountIn && parseFloat(amountIn) > 0 && !!selectedFrom && !!selectedTo && !!userAddress,
    });

    // Unified quote data
    const isQuoteLoading = executionType === "limit" 
        ? isCowQuoteLoading 
        : (swapRouter === "1inch" ? is1inchLoading : isPendleLoading);
    const quoteError = swapRouter === "1inch" ? oneInchError : pendleError;
    
    // Get best quote from available sources (for limit orders, use CoW quote)
    const bestQuote = useMemo(
        () => findBestQuote(oneInchQuote, pendleQuote, cowQuote ?? undefined),
        [oneInchQuote, pendleQuote, cowQuote]
    );

    const amountOut = useMemo(() => {
        // For limit orders, use custom buy amount if user has set one
        if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
            return customBuyAmount;
        }
        return calculateAmountOut(executionType, bestQuote, swapRouter, oneInchQuote, pendleQuote, selectedTo?.decimals || 18);
    }, [executionType, bestQuote, swapRouter, oneInchQuote, pendleQuote, selectedTo?.decimals, useCustomBuyAmount, customBuyAmount]);

    // Market rate from best quote
    const marketRate = useMemo(() => {
        if (!bestQuote || !selectedFrom || amountInBigInt === 0n) return null;
        const sellAmountFloat = Number(formatUnits(amountInBigInt, selectedFrom.decimals));
        const buyAmountFloat = Number(formatUnits(bestQuote.amount, selectedTo?.decimals ?? 18));
        if (sellAmountFloat === 0) return null;
        return buyAmountFloat / sellAmountFloat;
    }, [bestQuote, selectedFrom, selectedTo, amountInBigInt]);

    // Calculate price impact from available quote data (for limit order slippage estimation)
    const quotesPriceImpact = useMemo(
        () => calculateQuotesPriceImpact(swapRouter, pendleQuote, oneInchQuote),
        [swapRouter, pendleQuote, oneInchQuote]
    );

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
        setLimitSlippage(0.1);
    }, [selectedFrom?.address, selectedTo?.address]);

    // Calculate USD values from token prices for price impact fallback
    // (1inch v6.0 API doesn't return srcUSD/dstUSD, so we compute from token prices)
    const srcUsdFallback = useMemo(() => {
        if (!selectedFrom?.price || !amountIn) return undefined;
        const parsed = parseFloat(amountIn);
        if (isNaN(parsed) || parsed <= 0) return undefined;
        return parsed * Number(formatUnits(selectedFrom.price, 8));
    }, [selectedFrom?.price, amountIn]);

    const dstUsdFallback = useMemo(() => {
        if (!selectedTo?.price || !amountOut) return undefined;
        const parsed = parseFloat(amountOut);
        if (isNaN(parsed) || parsed <= 0) return undefined;
        return parsed * Number(formatUnits(selectedTo.price, 8));
    }, [selectedTo?.price, amountOut]);

    // Auto-slippage and price impact calculation
    const { priceImpact } = useAutoSlippage({
        slippage,
        setSlippage,
        oneInchQuote,
        pendleQuote,
        swapRouter,
        resetDep: `${selectedFrom?.address}-${selectedTo?.address}`,
        srcUsdFallback,
        dstUsdFallback,
    });

    // Calculate min output for limit orders with slippage
    const minBuyAmount = useMemo(() => {
        if (!selectedTo || !bestQuote) return { raw: 0n, formatted: "0" };

        // For limit orders, use custom buy amount if user has set one
        if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
            const customParsed = parseFloat(customBuyAmount);
            if (!isNaN(customParsed) && customParsed > 0) {
                const rawCustom = BigInt(Math.floor(customParsed * (10 ** selectedTo.decimals)));
                return { raw: rawCustom, formatted: customBuyAmount };
            }
        }

        const slippageToUse = executionType === "limit" ? limitSlippage : slippage;
        const bufferBps = BigInt(Math.round(slippageToUse * 100));
        const minRaw = (bestQuote.amount * (10000n - bufferBps)) / 10000n;
        return { raw: minRaw, formatted: formatUnits(minRaw, selectedTo.decimals) };
    }, [selectedTo, bestQuote, executionType, limitSlippage, slippage, useCustomBuyAmount, customBuyAmount]);

    // Flash loan info for CoW limit orders - uses selected provider from flash loan selection
    const cowFlashLoanInfo = useMemo(() => {
        if (executionType !== "limit" || !selectedFrom) return null;

        // Use provider from flash loan selection
        const providerType = selectedProvider?.name as "morpho" | "balancerV2" | "balancerV3" | "aaveV3" | undefined;
        const lenderInfo = getPreferredFlashLoanLender(chainId, providerType);
        if (!lenderInfo) return null;

        const fee = calculateFlashLoanFee(amountInBigInt, lenderInfo.provider);
        return {
            lender: lenderInfo.address as Address,
            provider: lenderInfo.provider,
            fee,
        };
    }, [executionType, selectedFrom, chainId, amountInBigInt, selectedProvider]);

    /**
     * Build CoW limit order instructions for collateral swap.
     *
     * Collateral Swap Flow (KIND_SELL):
     * - Flash loan: old collateral (what we're swapping out)
     * - Sell: old collateral -> Buy: new collateral
     * - Post-hook:
     *   UTXO[0] = swap output (new collateral, from OrderManager ToOutput prepend)
     *   [0] Approve(0, protocol) -> UTXO[1] (dummy output, token=0, amount=0)
     *   [1] Deposit(newCollateral, input=0) -> NO NEW UTXO (0 outputs)
     *   [2] Withdraw(oldCollateral, per-chunk amount + fee) -> UTXO[2]
     *
     *   For isMax (dust clearing):
     *   [3] GetSupplyBalance(oldCollateral) -> UTXO[3] (remaining dust amount)
     *   [4] WithdrawCollateral(oldCollateral, input=3) -> UTXO[4] (withdrawn dust)
     *   [5] PushToken(4, userAddress) -> sends dust to user
     *
     *   [N] PushToken(2, borrower) -> repay flash loan (appended by hook)
     */
    const buildCowInstructions = useMemo((): ChunkInstructions[] => {
        if (!selectedFrom || !selectedTo || !userAddress || amountInBigInt === 0n || !orderManagerAddress || !cowFlashLoanInfo) {
            return [{ preInstructions: [], postInstructions: [] }];
        }

        const normalizedProtocol = normalizeProtocolName(protocolName);
        const depositOp = getDepositOperation(protocolName);

        // Calculate per-chunk amounts
        const chunkSellAmount = amountInBigInt / BigInt(numChunks);
        const chunkFlashLoanFee = cowFlashLoanInfo.fee / BigInt(numChunks);
        const chunkWithdrawAmount = chunkSellAmount + chunkFlashLoanFee;

        console.log("[buildCowInstructions] Collateral swap (KIND_SELL):", {
            sellToken: selectedFrom.symbol,
            buyToken: selectedTo.symbol,
            totalSellAmount: formatUnits(amountInBigInt, selectedFrom.decimals),
            totalFlashLoanFee: formatUnits(cowFlashLoanInfo.fee, selectedFrom.decimals),
            numChunks,
            chunkSellAmount: formatUnits(chunkSellAmount, selectedFrom.decimals),
            chunkWithdrawAmount: formatUnits(chunkWithdrawAmount, selectedFrom.decimals),
            isMax,
            flow: isMax
                ? "swap[0] -> approve[1] -> deposit -> withdraw[2] -> getSupply[3] -> withdrawDust[4] -> pushDust(4) -> (hook appends pushRepay[2])"
                : "swap[0] -> approve[1] -> deposit -> withdraw[2] -> (hook appends pushRepay[2])",
        });

        // Build chunks - each chunk has same instructions but processes per-chunk amounts
        return Array(numChunks).fill(null).map(() => {
            // Post-hook instructions (UTXO tracking after OrderManager prepends ToOutput as UTXO[0])
            // UTXO[0] = swap output (new collateral)
            // Approve(0, protocol) -> UTXO[1] (dummy)
            // Deposit(newCollateral, input=0) -> NO NEW UTXO
            // Withdraw(oldCollateral, chunkWithdrawAmount) -> UTXO[2]
            const postInstructions: ProtocolInstruction[] = [
                // 1. Approve new collateral for deposit -> UTXO[1] (dummy)
                createRouterInstruction(encodeApprove(0, normalizedProtocol)),

                // 2. Deposit new collateral (no UTXO created)
                createProtocolInstruction(
                    normalizedProtocol,
                    encodeLendingInstruction(depositOp, selectedTo.address, userAddress, 0n, context || "0x", 0)
                ),

                // 3. Withdraw old collateral to repay flash loan -> UTXO[2]
                // Use per-chunk amount (chunkSellAmount + fee), NOT total amount
                createProtocolInstruction(
                    normalizedProtocol,
                    encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, chunkWithdrawAmount, context || "0x", 999)
                ),
            ];

            // For isMax: Add dust clearing instructions AFTER the main withdraw
            // This clears any remaining supply balance (dust) from rounding/interest accrual
            if (isMax) {
                // [3] GetSupplyBalance(oldCollateral) -> UTXO[3] (remaining dust amount)
                postInstructions.push(
                    createProtocolInstruction(
                        normalizedProtocol,
                        encodeLendingInstruction(LendingOp.GetSupplyBalance, selectedFrom.address, userAddress, 0n, context || "0x", 999)
                    )
                );

                // [4] WithdrawCollateral(oldCollateral, input=3) -> UTXO[4] (withdraw the dust)
                // inputIndex=3 references the GetSupplyBalance output (UTXO[3])
                postInstructions.push(
                    createProtocolInstruction(
                        normalizedProtocol,
                        encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, 0n, context || "0x", 3)
                    )
                );

                // [5] PushToken(4, userAddress) -> send dust to user
                // This sends UTXO[4] (withdrawn dust) directly to the user
                postInstructions.push(
                    createRouterInstruction(encodePushToken(4, userAddress))
                );
            }

            return {
                preInstructions: [], // Empty - flash loan transfer hooks are in appData
                postInstructions,
                flashLoanRepaymentUtxoIndex: 2, // UTXO[2] = Withdraw output (for flash loan repay)
                // Note: All instructions are included in authorization.
                // The gateway's authorize() adds 0.1% buffer to GetSupplyBalance simulation,
                // ensuring the second WithdrawCollateral gets proper authorization for dust.
            };
        });
    }, [selectedFrom, selectedTo, userAddress, amountInBigInt, orderManagerAddress, protocolName, context, cowFlashLoanInfo, numChunks, isMax]);

    const buildFlow = () => {
        if (!selectedFrom || !selectedTo) return [];
        
        // Get swap data based on selected router
        let swapData: string;
        let minOut: string;
        
        if (swapRouter === "1inch") {
            if (!oneInchQuote || !oneInchAdapter) return [];
            swapData = oneInchQuote.tx.data;
            minOut = "1"; // 1inch handles slippage internally
        } else {
            if (!pendleQuote || !pendleAdapter) return [];
            swapData = pendleQuote.transaction.data;
            minOut = pendleQuote.data.minPtOut || pendleQuote.data.minTokenOut || "1";
        }

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;

        return buildCollateralSwapFlow(
            protocolName,
            selectedFrom.address,
            selectedTo.address,
            amountIn,
            minOut,
            swapData,
            selectedFrom.decimals,
            context,
            isMax,
            providerEnum,
            false, // isExactOut
            swapRouter === "1inch" ? "oneinch" : "pendle"
        );
    };

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Collateral Swapped successfully!",
        emptyFlowErrorMessage: "Failed to build swap instructions",
        simulateWhenBatching: true,
    });

    /**
     * Executes the limit order flow (build, validate, execute).
     */
    const executeLimitOrder = async (txBeginProps: Record<string, string | number | boolean | null>): Promise<void> => {
        track("collateral_swap_limit_order_begin", txBeginProps);

        // Validate required data with early return
        if (!selectedFrom || !selectedTo || !userAddress || !orderManagerAddress || !cowFlashLoanInfo) {
            throw new Error("Missing required data for limit order");
        }

        // Build the limit order (types are now narrowed after the guard above)
        const limitOrderResult = await buildLimitOrder({
            selectedFrom,
            selectedTo,
            userAddress,
            orderManagerAddress,
            amountInBigInt,
            minBuyAmount,
            cowFlashLoanInfo,
            buildCowInstructions,
            numChunks,
            protocolName,
            chainId,
            buildLimitOrderCalls,
        });

        // Validate the result
        validateLimitOrderResult(limitOrderResult);

        console.log("[Limit Order] Order calls built:", limitOrderResult.calls.length);

        // Save order note
        saveOrderNoteIfNeeded(limitOrderResult.salt, protocolName, selectedFrom.symbol, selectedTo.symbol, chainId);

        // Execute via wallet
        const notificationId = notification.loading(
            <TransactionToast step="pending" message={`Creating limit order (${limitOrderResult.calls.length} operations)...`} />
        );

        const executionParams: OrderExecutionParams = {
            limitOrderResult,
            userAddress,
            chainId,
            orderManagerAddress,
            sendCallsAsync,
            walletClient,
            publicClient,
        };

        try {
            // Prefer batched execution (EIP-5792) if available, otherwise fall back to sequential
            const canUseBatchedExecution = typeof sendCallsAsync === "function";
            if (canUseBatchedExecution) {
                await executeBatchedOrder(executionParams, notificationId as string, onClose, txBeginProps);
            } else if (walletClient && publicClient) {
                await executeSequentialOrder(executionParams, notificationId as string, onClose, txBeginProps);
            } else {
                throw new Error("Wallet not connected");
            }
        } catch (batchError) {
            notification.remove(notificationId);
            throw batchError;
        }
    };

    /**
     * Executes the market order flow (flash loan based).
     */
    const executeMarketOrder = async (txBeginProps: Record<string, string | number | boolean | null>): Promise<void> => {
        track("collateral_swap_tx_begin", txBeginProps);
        await handleSwap(amountIn, isMax);
        track("collateral_swap_tx_complete", { ...txBeginProps, status: "success" });
    };

    /**
     * Main handler that routes to limit or market order execution.
     */
    const handleSwapWrapper = useCallback(async () => {
        const txBeginProps = {
            network: "evm",
            protocol: protocolName,
            chainId,
            market: context ?? null,
            fromToken: selectedFrom?.address ?? null,
            fromName: selectedFrom?.symbol ?? null,
            toToken: selectedTo?.address ?? null,
            toName: selectedTo?.symbol ?? null,
            amountIn,
            isMax,
            slippage: executionType === "limit" ? limitSlippage : slippage,
            preferBatching: batchingPreference.enabled,
            flashLoanProvider: selectedProvider?.name ?? null,
            swapRouter,
            executionType,
        } satisfies Record<string, string | number | boolean | null>;

        try {
            setIsSubmitting(true);

            if (executionType === "limit") {
                await executeLimitOrder(txBeginProps);
            } else {
                await executeMarketOrder(txBeginProps);
            }
        } catch (e) {
            const eventName = executionType === "limit" ? "collateral_swap_limit_order_complete" : "collateral_swap_tx_complete";
            track(eventName, {
                ...txBeginProps,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
            throw e;
        } finally {
            setIsSubmitting(false);
        }
    }, [
        executionType,
        executeLimitOrder,
        executeMarketOrder,
        protocolName,
        chainId,
        context,
        selectedFrom,
        selectedTo,
        amountIn,
        isMax,
        limitSlippage,
        slippage,
        batchingPreference.enabled,
        selectedProvider,
        swapRouter,
    ]);

    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;

    const hasQuote = swapRouter === "1inch" ? !!oneInchQuote : !!pendleQuote;
    const hasAdapter = swapRouter === "1inch" ? !!oneInchAdapter : !!pendleAdapter;
    
    // For market orders: need quote and adapter
    // For limit orders: need CoW contract available (quote optional) and dev environment
    const canSubmitMarket = hasQuote && hasAdapter && parseFloat(amountIn) > 0;
    const canSubmitLimit = !!selectedFrom && !!selectedTo && parseFloat(amountIn) > 0 && limitOrderReady && !!cowFlashLoanInfo && isDevEnvironment;
    const canSubmit = executionType === "limit" ? canSubmitLimit : canSubmitMarket;

    // Info content for "How it works" tab
    const infoContent = useMemo(() => (
        <div className="space-y-4 py-2">
            <div className="alert alert-info bg-info/10 border-info/20 text-sm">
                <InformationCircleIcon className="size-5 flex-shrink-0" />
                <span>
                    <strong>How Collateral Swap Works</strong>
                    <br />
                    This feature allows you to change your collateral asset without closing your debt position.
                </span>
            </div>

            <div className="space-y-4 px-2">
                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">1</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Flash Loan</h4>
                        <p className="text-base-content/70 text-xs">We borrow the new collateral asset via a Flash Loan.</p>
                        <div className="bg-base-200 mt-1 inline-block rounded p-1 text-xs">
                            Provider: {selectedProvider?.name || "Auto"}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">2</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Swap</h4>
                        <p className="text-base-content/70 text-xs">
                            We swap your current collateral for the new asset using {swapRouter === "pendle" ? "Pendle" : "1inch"}.
                        </p>
                        <div className="bg-base-200 mt-1 inline-block rounded p-1 text-xs">
                            Router: {swapRouter === "pendle" ? "Pendle" : "1inch"}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">3</div>
                        <div className="bg-base-300 my-1 h-full w-0.5"></div>
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Deposit & Withdraw</h4>
                        <p className="text-base-content/70 text-xs">The new asset is deposited as collateral, and your old collateral is withdrawn.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">4</div>
                    </div>
                    <div>
                        <h4 className="text-sm font-medium">Repay Flash Loan</h4>
                        <p className="text-base-content/70 text-xs">The withdrawn collateral is used to repay the Flash Loan.</p>
                    </div>
                </div>
            </div>
        </div>
    ), [selectedProvider?.name, swapRouter]);

    // Warnings
    const warnings = useMemo(() => (
        <>
            {swapRouter === "1inch" && oneInchQuote && oneInchAdapter && oneInchQuote.tx.from.toLowerCase() !== oneInchAdapter.address.toLowerCase() && (
                <WarningDisplay
                    message="Warning: Quote 'from' address mismatch!"
                    size="sm"
                    breakAll
                />
            )}
            {swapRouter === "1inch" && !oneInchAdapter && isOpen && (
                <WarningDisplay
                    message="1inch Adapter not found on this network. Try Pendle for PT swaps."
                    size="sm"
                />
            )}
            {swapRouter === "pendle" && !pendleAdapter && isOpen && (
                <WarningDisplay
                    message="Pendle Adapter not found on this network."
                    size="sm"
                />
            )}
        </>
    ), [swapRouter, oneInchQuote, oneInchAdapter, pendleAdapter, isOpen]);

    // Right panel with Market/Limit toggle and settings
    const rightPanel = useMemo(() => (
        <div className="space-y-3">
            {/* Execution Type Toggle */}
            <ExecutionTypeToggle
                value={executionType}
                onChange={setExecutionType}
                limitAvailable={cowAvailable}
                limitReady={limitOrderReady && isDevEnvironment}
                limitDisabledReason={
                    !isDevEnvironment
                        ? "Limit orders are only available in development environment"
                        : !limitOrderReady
                            ? "CoW contracts not deployed on this chain"
                            : undefined
                }
            />

            {/* Market Order Settings */}
            {executionType === "market" && (
                <div className="space-y-2 text-xs">
                    {/* Dropdowns row */}
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
                                    {flashLoanProviders.map(p => {
                                        const liq = liquidityData?.find(l => l.provider === p.providerEnum);
                                        return (
                                            <option key={p.name} value={p.name}>
                                                {p.name} {liq ? (liq.hasLiquidity ? "✓" : "⚠️") : ""}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Stats section */}
                    <div className="border-base-300/30 space-y-1 border-t pt-2">
                        {priceImpact !== undefined && priceImpact !== null && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Price Impact</span>
                                <span className={priceImpact > 1 ? "text-warning" : priceImpact > 3 ? "text-error" : "text-base-content/80"}>
                                    {priceImpact.toFixed(2)}%
                                </span>
                            </div>
                        )}
                        {amountOut && parseFloat(amountOut) > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Min Output</span>
                                <span className="text-base-content/80">
                                    {(parseFloat(amountOut) * (1 - slippage / 100)).toFixed(4)} {selectedTo?.symbol}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Limit Order Settings */}
            {executionType === "limit" && (
                <div className="space-y-2 text-xs">
                    {/* Order Type Indicator */}
                    <div className="flex items-center justify-between">
                        <span className="text-base-content/50">Order Type</span>
                        <Tooltip content="You are selling your current collateral to buy new collateral. The order executes when someone is willing to buy your collateral at your specified price or better.">
                            <span className="text-base-content/80 flex cursor-help items-center gap-1 font-medium">
                                Sell Order
                                <InformationCircleIcon className="text-base-content/40 size-3.5" />
                            </span>
                        </Tooltip>
                    </div>

                    {/* Flash Loan Provider dropdown */}
                    {flashLoanProviders && flashLoanProviders.length > 0 && (
                        <div className="flex items-center justify-between">
                            <span className="text-base-content/50">Flash Loan</span>
                            <select
                                className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                value={selectedProvider?.name || ""}
                                onChange={(e) => {
                                    const provider = flashLoanProviders.find(p => p.name === e.target.value);
                                    if (provider) setSelectedProvider(provider);
                                }}
                            >
                                {flashLoanProviders.map(p => (
                                    <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Limit Price vs Market comparison */}
                    <div className="bg-base-200/50 space-y-1 rounded p-2">
                        <div className="flex items-center justify-between">
                            <span className="text-base-content/50">Limit Price</span>
                            <span className="text-base-content/80 font-medium">
                                {isQuoteLoading ? (
                                    <span className="loading loading-dots loading-xs" />
                                ) : marketRate && minBuyAmount.raw > 0n ? (
                                    `1 ${selectedFrom?.symbol} = ${(Number(minBuyAmount.formatted) / Number(formatUnits(amountInBigInt, selectedFrom?.decimals ?? 18))).toFixed(4)} ${selectedTo?.symbol}`
                                ) : "-"}
                            </span>
                        </div>
                        {marketRate && minBuyAmount.raw > 0n && (
                            <div className="text-center text-[10px]">
                                {(() => {
                                    const limitRate = Number(minBuyAmount.formatted) / Number(formatUnits(amountInBigInt, selectedFrom?.decimals ?? 18));
                                    const pctDiff = ((limitRate - marketRate) / marketRate) * 100;
                                    const isAbove = pctDiff > 0;
                                    const absDiff = Math.abs(pctDiff);
                                    if (absDiff < 0.01) return <span className="text-base-content/40">at market price</span>;
                                    return (
                                        <span className={isAbove ? "text-success" : "text-warning"}>
                                            {absDiff.toFixed(2)}% {isAbove ? "above" : "below"} market
                                        </span>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* Chunks */}
                    {selectedFrom && selectedTo && (
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
                            {numChunks > 1 && minBuyAmount.raw > 0n && amountInBigInt > 0n && (
                                <div className="text-base-content/50 text-[10px]">
                                    Min {formatUnits(minBuyAmount.raw / BigInt(numChunks), selectedTo.decimals).slice(0, 8)} {selectedTo.symbol} per chunk
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    ), [
        executionType,
        setExecutionType,
        cowAvailable,
        limitOrderReady,
        isDevEnvironment,
        isQuoteLoading,
        marketRate,
        selectedFrom,
        selectedTo,
        limitSlippage,
        setLimitSlippage,
        minBuyAmount,
        numChunks,
        setNumChunks,
        amountInBigInt,
        slippage,
        setSlippage,
        priceImpact,
        amountOut,
        flashLoanProviders,
        selectedProvider,
        liquidityData,
        swapRouter,
        setSwapRouter,
        oneInchAvailable,
        pendleAvailable,
        setSelectedProvider,
    ]);

    // Handler for when user edits the output amount (limit orders)
    const handleAmountOutChange = useCallback((value: string) => {
        setCustomBuyAmount(value);
        setUseCustomBuyAmount(true);
    }, []);

    // Limit price adjustment buttons (shown below "Swap To" for limit orders)
    const limitPriceButtons = useMemo(() => {
        if (executionType !== "limit") return null;

        const adjustByPercent = (delta: number) => {
            if (!bestQuote || !selectedTo) return;
            const marketAmount = Number(formatUnits(bestQuote.amount, selectedTo.decimals));
            const newAmount = marketAmount * (1 + delta / 100);
            setCustomBuyAmount(newAmount.toFixed(6));
            setUseCustomBuyAmount(true);
        };

        const resetToMarket = () => {
            if (!bestQuote || !selectedTo) return;
            // Set to exact market quote (no slippage adjustment)
            const marketAmount = formatUnits(bestQuote.amount, selectedTo.decimals);
            setCustomBuyAmount(marketAmount);
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
    }, [executionType, bestQuote, selectedTo]);

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
            title="Swap Collateral"
            protocolName={protocolName}
            fromAssets={userAssets}
            toAssets={targetAssets}
            initialFromAddress={initialFromTokenAddress}
            selectedFrom={selectedFrom}
            setSelectedFrom={setSelectedFrom}
            selectedTo={selectedTo}
            setSelectedTo={setSelectedTo}
            amountIn={amountIn}
            setAmountIn={setAmountIn}
            isMax={isMax}
            setIsMax={setIsMax}
            amountOut={amountOut}
            isQuoteLoading={isQuoteLoading}
            quoteError={executionType === "market" ? quoteError : null}
            slippage={executionType === "limit" ? limitSlippage : slippage}
            setSlippage={executionType === "limit" ? setLimitSlippage : setSlippage}
            preferBatching={executionType === "market" ? preferBatching : undefined}
            setPreferBatching={executionType === "market" ? setPreferBatching : undefined}
            onSubmit={handleSwapWrapper}
            isSubmitting={isSubmitting}
            canSubmit={canSubmit}
            submitLabel={executionType === "limit" ? "Create Order" : "Swap Collateral"}
            infoContent={infoContent}
            warnings={warnings}
            fromLabel="Swap From"
            toLabel="Swap To"
            priceImpact={executionType === "market" ? priceImpact : undefined}
            hideDefaultStats={true}
            rightPanel={rightPanel}
            onAmountOutChange={executionType === "limit" ? handleAmountOutChange : undefined}
            limitPriceButtons={limitPriceButtons}
        />
    );
};
