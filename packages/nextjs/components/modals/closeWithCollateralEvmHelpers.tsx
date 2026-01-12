/**
 * Helper functions for CloseWithCollateralEvmModal to reduce cognitive complexity.
 * Extracted from CloseWithCollateralEvmModal.tsx to improve maintainability.
 */
import { formatUnits, Address } from "viem";
import { track } from "@vercel/analytics";
import {
    ProtocolInstruction,
    createRouterInstruction,
    createProtocolInstruction,
    encodeApprove,
    encodePullToken,
    encodePushToken,
    encodeAdd,
    encodeLendingInstruction,
    LendingOp,
    normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import {
    CompletionType,
    getPreferredFlashLoanLender,
    calculateFlashLoanFee,
    getCowExplorerAddressUrl,
    checkOrderInOrderbook,
} from "~~/utils/cow";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { saveOrderNote, createClosePositionNote } from "~~/utils/orderNotes";
import { getCowQuoteSellAmount, type CowQuoteResponse } from "~~/hooks/useCowQuote";
import { executeSequentialTransactions, type TransactionCall } from "~~/utils/transactionSimulation";
import type { ChunkInstructions, BuildOrderResult } from "~~/hooks/useCowLimitOrder";

/** Alias for backwards compatibility */
export type LimitOrderBuildResult = BuildOrderResult;
import type { SwapAsset } from "./SwapModalShell";
import type { LimitOrderResult } from "~~/components/LimitOrderConfig";
import type { WalletClient, PublicClient } from "viem";

// ============ Types ============

export interface ClosePositionAnalyticsProps {
    network: string;
    protocol: string;
    chainId: number;
    executionType?: string;
    debtToken: string;
    debtName: string;
    collateralToken?: string | null;
    collateralName?: string | null;
    repayAmount?: string;
    collateralAmount?: string;
    flashLoanProvider?: string | null;
    amountIn?: string;
    isMax?: boolean;
    slippage?: number;
    preferBatching?: boolean;
    swapRouter?: string;
    market?: string | null;
    // Index signature for compatibility with Vercel Analytics track() function
    [key: string]: string | number | boolean | null | undefined;
}

export interface FlashLoanInfo {
    lender: string;
    provider: string;
    fee: bigint;
    amount: bigint;
    token: string;
}

export interface CowChunkParams {
    selectedTo: SwapAsset;
    userAddress: string;
    repayAmountRaw: bigint;
    orderManagerAddress: string;
    protocolName: string;
    context: string | undefined;
    debtToken: string;
    debtName: string;
    debtDecimals: number;
    cowFlashLoanInfo: FlashLoanInfo;
    limitOrderConfig: LimitOrderResult | null;
    /** When true, adds a small buffer to handle interest accrual and pushes any refund to user */
    isMax?: boolean;
}

// ============ Analytics Helpers ============

export function trackModalOpen(
    protocolName: string,
    chainId: number,
    context: string | undefined,
    debtToken: string,
    debtName: string,
    availableCollateralsLength: number | null
): void {
    const modalOpenProps = {
        network: "evm",
        protocol: protocolName,
        debtToken: debtToken,
        debtName,
        chainId,
        market: context ?? null,
        availableCollaterals: availableCollateralsLength,
    } satisfies Record<string, string | number | boolean | null>;

    track("close_with_collateral_modal_open", modalOpenProps);
}

export function createLimitOrderAnalyticsProps(params: {
    protocolName: string;
    chainId: number;
    debtToken: string;
    debtName: string;
    selectedTo: SwapAsset;
    repayAmountRaw: bigint;
    debtDecimals: number;
    limitOrderCollateral: bigint;
    requiredCollateral: bigint;
    flashLoanProviderName: string;
}): ClosePositionAnalyticsProps {
    return {
        network: "evm",
        protocol: params.protocolName,
        chainId: params.chainId,
        executionType: "limit",
        debtToken: params.debtToken,
        debtName: params.debtName,
        collateralToken: params.selectedTo.address,
        collateralName: params.selectedTo.symbol,
        repayAmount: formatUnits(params.repayAmountRaw, params.debtDecimals),
        collateralAmount: formatUnits(params.limitOrderCollateral || params.requiredCollateral, params.selectedTo.decimals),
        flashLoanProvider: params.flashLoanProviderName,
    } satisfies ClosePositionAnalyticsProps;
}

// ============ Flash Loan Helpers ============

export function buildCowFlashLoanInfo(
    chainId: number,
    limitOrderConfig: LimitOrderResult | null,
    executionType: string,
    selectedTo: SwapAsset | null,
    limitOrderCollateral: bigint
): FlashLoanInfo | null {
    const isLimitExecution = executionType === "limit";
    const hasValidToken = selectedTo !== null;
    const hasValidAmount = limitOrderCollateral > 0n;

    // Check for valid provider - need explicit null checks for TypeScript narrowing
    if (!limitOrderConfig || !limitOrderConfig.selectedProvider) {
        return null;
    }

    if (!isLimitExecution || !hasValidToken || !hasValidAmount) {
        return null;
    }

    const lenderInfo = getPreferredFlashLoanLender(chainId, limitOrderConfig.selectedProvider.provider);
    if (!lenderInfo) {
        return null;
    }

    const fee = calculateFlashLoanFee(limitOrderCollateral, lenderInfo.provider);
    return {
        lender: lenderInfo.address,
        provider: lenderInfo.provider,
        fee,
        amount: limitOrderCollateral,
        token: selectedTo.address,
    };
}

// ============ CoW Instructions Builder ============

export function buildCowChunkInstructions(params: CowChunkParams): ChunkInstructions[] {
    const {
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
        isMax,
    } = params;

    // Early return for invalid state
    if (!selectedTo || !userAddress || repayAmountRaw === 0n || !orderManagerAddress || !cowFlashLoanInfo) {
        return [{ preInstructions: [], postInstructions: [] }];
    }

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const numChunks = limitOrderConfig?.numChunks ?? 1;

    // Calculate per-chunk amounts
    const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);

    // PRE-HOOK: Empty! fundOrder already moves flash-loaned collateral to OrderManager
    const preInstructions: ProtocolInstruction[] = [];

    const postInstructions: ProtocolInstruction[] = [
        // [0] PullToken: pull debt from OM (per-chunk buyAmount) -> UTXO[2]
        createRouterInstruction(encodePullToken(chunkBuyAmount, debtToken as Address, orderManagerAddress as Address)),

        // [1] Approve debt for lending protocol (using UTXO[2]) -> UTXO[3]
        createRouterInstruction(encodeApprove(2, normalizedProtocol)),

        // [2] Repay user's debt using UTXO[2] - unlocks original collateral -> UTXO[4]
        createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.Repay, debtToken as Address, userAddress as Address, chunkBuyAmount, context || "0x", 2)
        ),

        // [3] Withdraw collateral equal to actual sell amount (UTXO[0] = Y) -> UTXO[5]
        createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(
                LendingOp.WithdrawCollateral,
                selectedTo.address,
                userAddress as Address,
                selectedTo.rawBalance,  // User's full collateral for auth calculation
                context || "0x",
                0  // Use UTXO[0] = actual sell amount
            )
        ),

        // [4] Add: withdrawn (UTXO[5] = Y) + leftover (UTXO[1] = X-Y) -> UTXO[6] = X (flash loan repay)
        createRouterInstruction(encodeAdd(5, 1)),

        // Flash loan repay is implicit via flashLoanRepaymentUtxoIndex
    ];

    // For isMax orders: push any refund from Repay (UTXO[4]) back to user.
    // When user requests max close, we buy slightly more debt tokens than current debt
    // to account for interest accrual. Any excess after repay goes back to user.
    // This must come AFTER the Add instruction to preserve the flash loan repayment UTXO index.
    if (isMax) {
        // UTXO[4] = refund from Repay (debt token). Push it back to user.
        // Note: If there's no refund (amount = 0), the PushToken is a no-op.
        postInstructions.push(
            createRouterInstruction(encodePushToken(4, userAddress as Address))
        );
    }

    logCowInstructions({
        selectedTo,
        debtName,
        repayAmountRaw,
        debtDecimals,
        chunkBuyAmount,
        cowFlashLoanInfo,
        numChunks,
        isMax,
    });

    // Return N identical chunks - each processes per-chunk amounts
    return Array(numChunks).fill(null).map(() => ({
        preInstructions,
        postInstructions,
        flashLoanRepaymentUtxoIndex: 6, // UTXO[6] = X (flash loan amount to repay)
    }));
}

function logCowInstructions(params: {
    selectedTo: SwapAsset;
    debtName: string;
    repayAmountRaw: bigint;
    debtDecimals: number;
    chunkBuyAmount: bigint;
    cowFlashLoanInfo: FlashLoanInfo;
    numChunks: number;
    isMax?: boolean;
}): void {
    const baseFlow = "pullDebt -> approve -> repay -> withdraw(Y) -> add(Y, X-Y) -> implicit:push(X->adapter)";
    const flow = params.isMax ? `${baseFlow} -> push(refund->user)` : baseFlow;

    console.log("[buildCowInstructions] Close with Collateral (KIND_BUY):", {
        sellToken: params.selectedTo.symbol,
        buyToken: params.debtName,
        totalDebtToBuy: formatUnits(params.repayAmountRaw, params.debtDecimals),
        chunkDebtToBuy: formatUnits(params.chunkBuyAmount, params.debtDecimals),
        flashLoanToken: params.selectedTo.symbol,
        flashLoanAmount: formatUnits(params.cowFlashLoanInfo.amount, params.selectedTo.decimals),
        numChunks: params.numChunks,
        isMax: params.isMax ?? false,
        utxoLayout: "UTXO[0]=actualSell(Y), UTXO[1]=leftover(X-Y), UTXO[4]=repayRefund, UTXO[5]=withdrawn(Y), UTXO[6]=Y+(X-Y)=X",
        flow,
    });
}

// ============ Limit Order Execution Helpers ============

export function logLimitOrderBuildStart(params: {
    selectedTo: SwapAsset;
    debtName: string;
    limitOrderCollateral: bigint;
    repayAmountRaw: bigint;
    debtDecimals: number;
    cowFlashLoanInfo: FlashLoanInfo;
    cowQuote: CowQuoteResponse | null | undefined;
}): void {
    const { selectedTo, debtName, limitOrderCollateral, repayAmountRaw, debtDecimals, cowFlashLoanInfo, cowQuote } = params;

    console.log("[Limit Order] Building close-with-collateral order (KIND_BUY):", {
        sellToken: selectedTo.symbol,
        buyToken: debtName,
        maxSellAmount: formatUnits(limitOrderCollateral, selectedTo.decimals),
        exactBuyAmount: formatUnits(repayAmountRaw, debtDecimals),
        flashLoanToken: selectedTo.symbol,
        flashLoanAmount: formatUnits(cowFlashLoanInfo.amount, selectedTo.decimals),
        flashLoanLender: cowFlashLoanInfo.lender,
        cowQuoteSellAmount: cowQuote ? formatUnits(getCowQuoteSellAmount(cowQuote), selectedTo.decimals) : "N/A",
    });
}

export interface LimitOrderCallParams {
    selectedTo: SwapAsset;
    debtToken: string;
    limitOrderCollateral: bigint;
    repayAmountRaw: bigint;
    cowFlashLoanInfo: FlashLoanInfo;
    buildCowInstructions: ChunkInstructions[];
    limitOrderConfig: LimitOrderResult;
    protocolName: string;
}

export function buildLimitOrderCallParams(params: LimitOrderCallParams): {
    sellToken: Address;
    buyToken: string;
    chunkSize: bigint;
    minBuyPerChunk: bigint;
    totalAmount: bigint;
    chunks: ChunkInstructions[];
    completion: CompletionType;
    targetValue: number;
    minHealthFactor: string;
    seedAmount: bigint;
    flashLoan: { lender: Address; token: Address; amount: bigint };
    preOrderInstructions: never[];
    isKindBuy: boolean;
    operationType: "close-position";
    protocolName: string;
} {
    const { selectedTo, debtToken, limitOrderCollateral, repayAmountRaw, cowFlashLoanInfo, buildCowInstructions, limitOrderConfig, protocolName } = params;
    const numChunks = limitOrderConfig?.numChunks ?? 1;
    const chunkSellAmount = limitOrderCollateral / BigInt(numChunks);
    const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
    const chunkFlashLoanAmount = cowFlashLoanInfo.amount / BigInt(numChunks);

    return {
        sellToken: selectedTo.address as Address,   // Collateral to sell
        buyToken: debtToken,                         // Debt to receive
        chunkSize: chunkSellAmount,                  // Per-chunk collateral to sell
        minBuyPerChunk: chunkBuyAmount,              // Per-chunk debt amount needed
        totalAmount: limitOrderCollateral,           // Total across all chunks
        chunks: buildCowInstructions,
        completion: CompletionType.Iterations,
        targetValue: numChunks,
        minHealthFactor: "1.0",
        seedAmount: 0n,                              // No seed - flash loan provides funds
        flashLoan: {
            lender: cowFlashLoanInfo.lender as Address,
            token: selectedTo.address as Address,    // Flash loan COLLATERAL (sellToken!)
            amount: chunkFlashLoanAmount,            // Per-chunk flash loan amount
        },
        preOrderInstructions: [],                    // Empty - fundOrder handles collateral transfer
        isKindBuy: true,                             // KIND_BUY: exact buyAmount, max sellAmount
        operationType: "close-position",
        protocolName,
    };
}

export function handleLimitOrderBuildFailure(
    result: LimitOrderBuildResult,
    analyticsProps: ClosePositionAnalyticsProps
): never {
    const errorMsg = result.error || "Unknown error building order";
    const fullError = result.errorDetails?.apiResponse
        ? `${errorMsg}\n\nAPI Response: ${result.errorDetails.apiResponse}`
        : errorMsg;

    console.error("[Limit Order] Build failed:", fullError, result.errorDetails);
    notification.error(
        <TransactionToast
            step="failed"
            message={`CoW API Error: ${errorMsg}`}
        />
    );

    track("close_with_collateral_limit_order_complete", {
        ...analyticsProps,
        status: "error",
        error: errorMsg,
    });

    throw new Error(errorMsg);
}

export function saveLimitOrderNote(
    salt: string | undefined,
    protocolName: string,
    collateralSymbol: string,
    debtName: string,
    chainId: number
): void {
    if (!salt) return;

    saveOrderNote(createClosePositionNote(
        salt,
        protocolName,
        collateralSymbol, // collateral being sold
        debtName,         // debt being repaid
        chainId
    ));
}

export async function executeBatchedLimitOrder(params: {
    allCalls: Array<{ to: string; data: string }>;
    sendCallsAsync: (params: { calls: readonly { to: `0x${string}`; data?: `0x${string}`; value?: bigint }[] }) => Promise<{ id: string }>;
    setSuppressBatchNotifications: (val: boolean) => void;
    setBatchId: (id: string) => void;
    setLastOrderSalt: (salt: string | null) => void;
    setLimitOrderNotificationId: (id: string | number | null) => void;
    salt: string;
    appDataHash: string;
    notificationId: string | number;
    analyticsProps: ClosePositionAnalyticsProps;
}): Promise<void> {
    const {
        allCalls,
        sendCallsAsync,
        setSuppressBatchNotifications,
        setBatchId,
        setLastOrderSalt,
        setLimitOrderNotificationId,
        salt,
        appDataHash,
        notificationId,
        analyticsProps,
    } = params;

    console.log("[Limit Order] Using batched TX mode (EIP-5792)");

    // Format calls to match wagmi's expected type
    const formattedCalls = allCalls.map(call => ({
        to: call.to as `0x${string}`,
        data: call.data as `0x${string}`,
    }));

    const { id: newBatchId } = await sendCallsAsync({
        calls: formattedCalls,
    });

    // Store salt for CoW Explorer link in confirmation toast
    setLastOrderSalt(salt);

    // Suppress hook's generic notifications - we'll show custom ones
    setSuppressBatchNotifications(true);

    // Set batch ID to trigger status tracking
    setBatchId(newBatchId);

    notification.remove(notificationId);

    // Show loading notification while waiting for confirmation
    const loadingId = notification.loading(
        <TransactionToast
            step="sent"
            message="Limit order submitted - waiting for confirmation..."
        />
    );
    setLimitOrderNotificationId(loadingId);

    console.log("[Limit Order] Batch submitted:", newBatchId);
    console.log("[Limit Order] Salt:", salt);
    console.log("[Limit Order] AppData Hash:", appDataHash);

    track("close_with_collateral_limit_order_complete", { ...analyticsProps, status: "submitted", mode: "batched" });
}

export async function executeSequentialLimitOrder(params: {
    allCalls: Array<{ to: string; data: string }>;
    walletClient: WalletClient;
    publicClient: PublicClient;
    chainId: number;
    orderManagerAddress: string;
    userAddress: string;
    salt: string;
    appDataHash: string;
    analyticsProps: ClosePositionAnalyticsProps;
    onClose: () => void;
    notificationId: string | number;
}): Promise<void> {
    const {
        allCalls,
        publicClient,
        walletClient,
        chainId,
        orderManagerAddress,
        userAddress,
        salt,
        appDataHash,
        analyticsProps,
        onClose,
    } = params;
    let { notificationId } = params;

    console.log("[Limit Order] Using sequential TX mode");

    const result = await executeSequentialTransactions(
        publicClient,
        walletClient,
        allCalls as TransactionCall[],
        userAddress as Address,
        {
            simulateFirst: true,
            onProgress: (step, total, phase) => {
                if (notificationId !== undefined) notification.remove(notificationId as string | number);
                const message = getProgressMessage(step, total, phase);
                notificationId = notification.loading(
                    <TransactionToast step="pending" message={message} />
                );
                if (phase === "confirmed") {
                    console.log(`[Limit Order] Step ${step} complete`);
                }
            },
            onError: (step, error) => {
                console.error(`[Limit Order] Step ${step} FAILED:`, error);
                if (notificationId !== undefined) notification.remove(notificationId as string | number);
                notification.error(`Step ${step} would fail: ${error}`);
            },
        }
    );

    if (!result.success) {
        throw new Error(result.error || "Transaction failed");
    }

    notification.remove(notificationId);

    // Log order details for debugging
    logOrderCreationSuccess(salt, appDataHash, orderManagerAddress);

    // Check if order appears in CoW orderbook (give it a moment)
    scheduleOrderbookCheck(chainId, orderManagerAddress, appDataHash);

    const explorerUrl = getCowExplorerAddressUrl(chainId, userAddress);
    notification.success(
        <TransactionToast
            step="confirmed"
            message="Limit order created! Position will close when order fills."
            blockExplorerLink={explorerUrl}
        />
    );

    track("close_with_collateral_limit_order_complete", { ...analyticsProps, status: "success", mode: "sequential" });
    onClose();
}

function getProgressMessage(step: number, total: number, phase: string): string {
    if (phase === "simulating") {
        return `Simulating step ${step}/${total}...`;
    }
    if (phase === "executing") {
        return `Executing step ${step}/${total}...`;
    }
    return `Step ${step}/${total} confirmed`;
}

function logOrderCreationSuccess(salt: string, appDataHash: string, orderManagerAddress: string): void {
    console.log("[Limit Order] Order created successfully");
    console.log("[Limit Order] Salt:", salt);
    console.log("[Limit Order] AppData Hash:", appDataHash);
    console.log("[Limit Order] OrderManager:", orderManagerAddress);
}

function scheduleOrderbookCheck(chainId: number, orderManagerAddress: string, appDataHash: string): void {
    setTimeout(async () => {
        try {
            const checkResult = await checkOrderInOrderbook(
                chainId,
                orderManagerAddress,
                appDataHash
            );

            if (checkResult.found) {
                console.log("[Limit Order] Order found in CoW orderbook:", checkResult.order);
            } else {
                console.warn("[Limit Order] Order NOT found in CoW orderbook yet.", checkResult.error || "");
                console.warn("[Limit Order] WatchTower may need time to pick up the order, or there may be an issue.");
            }
        } catch (e) {
            console.error("[Limit Order] Failed to check orderbook:", e);
        }
    }, 5000); // Check after 5 seconds
}

export function handleLimitOrderError(
    error: unknown,
    notificationId: string | number | undefined,
    analyticsProps: ClosePositionAnalyticsProps
): void {
    if (notificationId) {
        notification.remove(notificationId);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    notification.error(`Failed: ${errorMessage}`);

    track("close_with_collateral_limit_order_complete", {
        ...analyticsProps,
        status: "error",
        error: errorMessage,
    });
}

// ============ Swap Router Helpers ============

export function shouldSwitchSwapRouter(
    swapRouter: string,
    oneInchAvailable: boolean,
    pendleAvailable: boolean
): string | null {
    if (swapRouter === "1inch" && !oneInchAvailable) {
        return pendleAvailable ? "pendle" : null;
    }
    if (swapRouter === "pendle" && !pendleAvailable) {
        return oneInchAvailable ? "1inch" : null;
    }
    return null;
}

// ============ Quote Calculation Helpers ============

export interface QuoteCalculationResult {
    requiredCollateral: bigint;
    requiredCollateralFormatted: string;
    exchangeRate: string;
}

export function calculateRequiredCollateral(params: {
    selectedTo: SwapAsset | null;
    repayAmountRaw: bigint;
    oneInchUnitQuote: { dstAmount: string } | null | undefined;
    pendleUnitQuote: { data: { amountPtOut?: string; amountTokenOut?: string } } | null | undefined;
    debtDecimals: number;
    slippage: number;
}): QuoteCalculationResult {
    const { selectedTo, repayAmountRaw, oneInchUnitQuote, pendleUnitQuote, debtDecimals, slippage } = params;

    if (!selectedTo || repayAmountRaw === 0n) {
        return { requiredCollateral: 0n, requiredCollateralFormatted: "0", exchangeRate: "0" };
    }

    // Get unit output from whichever quote is available
    const unitOut = getUnitOutput(oneInchUnitQuote, pendleUnitQuote);

    if (unitOut === 0n) {
        return { requiredCollateral: 0n, requiredCollateralFormatted: "0", exchangeRate: "0" };
    }

    // Exchange rate: how much debt per 1 collateral
    const rate = formatUnits(unitOut, debtDecimals);

    // requiredCollateral = repayAmountRaw * 1_collateral / unitOut
    const unitIn = 10n ** BigInt(selectedTo.decimals);
    const base = (repayAmountRaw * unitIn) / unitOut;

    // Apply slippage buffer from UI (e.g., 3% slippage -> multiply by 1.03)
    const slippageBps = BigInt(Math.round(slippage * 100)); // 3% -> 300 bps
    const required = (base * (10000n + slippageBps)) / 10000n;

    return {
        requiredCollateral: required,
        requiredCollateralFormatted: formatUnits(required, selectedTo.decimals),
        exchangeRate: rate,
    };
}

function getUnitOutput(
    oneInchUnitQuote: { dstAmount: string } | null | undefined,
    pendleUnitQuote: { data: { amountPtOut?: string; amountTokenOut?: string } } | null | undefined
): bigint {
    if (oneInchUnitQuote) {
        return BigInt(oneInchUnitQuote.dstAmount);
    }
    if (pendleUnitQuote) {
        const outAmount = pendleUnitQuote.data.amountPtOut || pendleUnitQuote.data.amountTokenOut || "0";
        return BigInt(outAmount);
    }
    return 0n;
}

export function calculateLimitOrderCollateral(
    cowQuote: CowQuoteResponse | null | undefined,
    selectedTo: SwapAsset | null,
    slippage: number
): bigint {
    if (!cowQuote || !selectedTo) return 0n;

    // Get the sellAmount from CoW quote (how much collateral needed for exact buyAmount)
    const baseSellAmount = getCowQuoteSellAmount(cowQuote);
    if (baseSellAmount === 0n) return 0n;

    // Apply slippage buffer (e.g., 3% -> multiply by 1.03)
    // For KIND_BUY, higher sellAmount = more willing to pay = better chance to fill
    const slippageBps = BigInt(Math.round(slippage * 100));
    const withSlippage = (baseSellAmount * (10000n + slippageBps)) / 10000n;

    return withSlippage;
}
