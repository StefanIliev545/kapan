/**
 * Helper functions for DebtSwapEvmModal to reduce cognitive complexity.
 * Extracted from DebtSwapEvmModal.tsx to improve maintainability.
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
} from "~~/utils/cow";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { saveOrderNote, createDebtSwapNote } from "~~/utils/orderNotes";
import { getCowQuoteSellAmount, type CowQuoteResponse } from "~~/hooks/useCowQuote";
import type { ChunkInstructions } from "~~/hooks/useCowLimitOrder";

import type { SwapAsset } from "./SwapModalShell";
import type { LimitOrderResult } from "~~/components/LimitOrderConfig";
import type { WalletClient, PublicClient } from "viem";
// Shared types for CoW swap operations
import { type FlashLoanInfo, type LimitOrderBuildResult } from "./common/swapTypes";
export type { FlashLoanInfo, LimitOrderBuildResult };

// ============ Types ============

export type DebtSwapAnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface CowChunkParams {
    selectedTo: SwapAsset;
    userAddress: string;
    repayAmountRaw: bigint;
    orderManagerAddress: string;
    protocolName: string;
    context: string | undefined;
    debtFromToken: string;
    debtFromName: string;
    debtFromDecimals: number;
    cowFlashLoanInfo: FlashLoanInfo;
    limitOrderConfig: LimitOrderResult | null;
    /** Whether user selected "max" - enables dust clearing with refund to user */
    isMax?: boolean;
}

export interface LimitOrderSubmitParams {
    selectedTo: SwapAsset;
    userAddress: string;
    orderManagerAddress: string;
    walletClient: WalletClient;
    publicClient: PublicClient;
    limitOrderConfig: LimitOrderResult;
    cowFlashLoanInfo: FlashLoanInfo;
    protocolName: string;
    chainId: number;
    debtFromToken: string;
    debtFromName: string;
    repayAmountRaw: bigint;
    debtFromDecimals: number;
    limitOrderNewDebt: bigint;
    cowQuote: unknown;
    buildCowInstructions: ChunkInstructions[];
    buildLimitOrderCalls: (params: unknown) => Promise<LimitOrderBuildResult | null>;
    useBatchedTx: boolean;
    sendCallsAsync?: (params: { calls: unknown[]; experimental_fallback: boolean }) => Promise<{ id: string }>;
    setSuppressBatchNotifications: (val: boolean) => void;
    setBatchId: (id: string) => void;
    onClose: () => void;
    setLastOrderSalt: (salt: string | null) => void;
    setLimitOrderNotificationId: (id: string | number | null) => void;
}

// ============ Analytics Helpers ============

export function trackModalOpen(
    protocolName: string,
    chainId: number,
    context: string | undefined,
    debtFromToken: string,
    debtFromName: string,
    availableAssetsLength: number | null
): void {
    const modalOpenProps = {
        network: "evm",
        protocol: protocolName,
        chainId,
        market: context ?? null,
        debtFromToken,
        debtFromName,
        availableAssets: availableAssetsLength,
    } satisfies Record<string, string | number | boolean | null>;

    track("debt_swap_modal_open", modalOpenProps);
}

export function createLimitOrderAnalyticsProps(params: {
    protocolName: string;
    chainId: number;
    debtFromToken: string;
    debtFromName: string;
    selectedTo: SwapAsset;
    repayAmountRaw: bigint;
    debtFromDecimals: number;
    limitOrderNewDebt: bigint;
    flashLoanProviderName: string;
}): DebtSwapAnalyticsProps {
    return {
        network: "evm",
        protocol: params.protocolName,
        chainId: params.chainId,
        executionType: "limit",
        oldDebtToken: params.debtFromToken,
        oldDebtName: params.debtFromName,
        newDebtToken: params.selectedTo.address,
        newDebtName: params.selectedTo.symbol,
        repayAmount: formatUnits(params.repayAmountRaw, params.debtFromDecimals),
        newDebtAmount: formatUnits(params.limitOrderNewDebt, params.selectedTo.decimals),
        flashLoanProvider: params.flashLoanProviderName,
        market: null,
    } satisfies DebtSwapAnalyticsProps;
}

// ============ Flash Loan Helpers ============

export function buildCowFlashLoanInfo(
    chainId: number,
    limitOrderConfig: LimitOrderResult | null,
    executionType: string,
    selectedTo: SwapAsset | null,
    limitOrderNewDebt: bigint
): FlashLoanInfo | null {
    const hasValidProvider = limitOrderConfig?.selectedProvider;
    const isLimitExecution = executionType === "limit";
    const hasValidToken = selectedTo !== null;
    const hasValidAmount = limitOrderNewDebt > 0n;

    if (!hasValidProvider || !isLimitExecution || !hasValidToken || !hasValidAmount) {
        return null;
    }

    // At this point we know selectedProvider is not null (checked via hasValidProvider)
    const lenderInfo = getPreferredFlashLoanLender(chainId, limitOrderConfig.selectedProvider!.provider);
    if (!lenderInfo) {
        return null;
    }

    const fee = calculateFlashLoanFee(limitOrderNewDebt, lenderInfo.provider);
    return {
        lender: lenderInfo.address,
        provider: lenderInfo.provider,
        fee,
        amount: limitOrderNewDebt,
        token: selectedTo.address,
    };
}

// ============ Dust Buffer Calculation ============

/**
 * Calculate dust buffer for max debt repayment.
 *
 * When repaying max debt, we need to buy slightly more oldDebt than the current
 * balance to account for interest that accrues between quote and execution.
 * Any excess is refunded to the user via a PushToken instruction.
 *
 * Buffer: 0.5% (50 basis points)
 * - Covers ~3.5 days at 50% APY or ~10 days at 17.5% APY
 * - Critical for Euler where any leftover debt blocks collateral withdrawal
 *
 * @param amount - The debt amount to buffer
 * @returns The buffered amount (amount + dust buffer)
 */
export function calculateDustBuffer(amount: bigint): bigint {
    // Add 0.5% (50 basis points) = multiply by 10050/10000
    // This covers interest accrual between quote and execution:
    // - ~3.5 days at 50% APY (extreme)
    // - ~10 days at 17.5% APY (typical)
    // Larger buffer needed for Euler debt swaps where leftover debt blocks withdrawal
    const DUST_BUFFER_NUMERATOR = 10050n;
    const DUST_BUFFER_DENOMINATOR = 10000n;

    return (amount * DUST_BUFFER_NUMERATOR) / DUST_BUFFER_DENOMINATOR;
}

/**
 * Calculate the amount of extra debt to buy for dust clearing.
 * @param amount - The base debt amount
 * @returns The extra amount (buffer - original)
 */
export function getDustBufferAmount(amount: bigint): bigint {
    return calculateDustBuffer(amount) - amount;
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
        debtFromToken,
        debtFromName,
        debtFromDecimals,
        cowFlashLoanInfo,
        limitOrderConfig,
        isMax,
    } = params;

    // Early return for invalid state
    if (!selectedTo || !userAddress || repayAmountRaw === 0n || !orderManagerAddress || !cowFlashLoanInfo || !debtFromToken) {
        return [{ preInstructions: [], postInstructions: [] }];
    }

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const numChunks = limitOrderConfig?.numChunks ?? 1;

    // Calculate per-chunk amounts
    const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
    const chunkFlashLoanAmount = cowFlashLoanInfo.amount / BigInt(numChunks);

    // PRE-HOOK: Empty - fundOrder handles transfer
    const preInstructions: ProtocolInstruction[] = [];

    const postInstructions: ProtocolInstruction[] = [
        // [0] PullToken: pull oldDebt from OM (per-chunk buyAmount) -> UTXO[2]
        createRouterInstruction(encodePullToken(chunkBuyAmount, debtFromToken as Address, orderManagerAddress as Address)),

        // [1] Approve oldDebt for lending protocol (using UTXO[2]) -> UTXO[3]
        createRouterInstruction(encodeApprove(2, normalizedProtocol)),

        // [2] Repay user's oldDebt using UTXO[2] -> UTXO[4] (refund if over-repaying)
        createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.Repay, debtFromToken as Address, userAddress as Address, chunkBuyAmount, context || "0x", 2)
        ),

        // [3] Borrow newDebt equal to actual sell amount (UTXO[0]) -> UTXO[5]
        createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(
                LendingOp.Borrow,
                selectedTo.address,
                userAddress as Address,
                chunkFlashLoanAmount,  // Per-chunk max borrow for auth calculation
                context || "0x",
                0  // Use UTXO[0] = actual sell amount
            )
        ),

        // [4] Add: borrowed (UTXO[5]) + leftover (UTXO[1]) -> UTXO[6]
        createRouterInstruction(encodeAdd(5, 1)),

        // Flash loan repay is implicit via flashLoanRepaymentUtxoIndex (pushes UTXO[6])
    ];

    // For max repayments: Push any refund from Repay (UTXO[4]) back to user
    // This handles the case where we bought slightly more oldDebt than needed
    // (dust buffer) and the Repay instruction returns the excess
    if (isMax) {
        // UTXO[4] is the refund from Repay - push it to user
        // This is added AFTER the Add instruction but the hook appends flash loan
        // repayment (PushToken for UTXO[6]) last, so order is preserved
        postInstructions.push(
            createRouterInstruction(encodePushToken(4, userAddress))
        );
    }

    logCowInstructions({
        selectedTo,
        debtFromName,
        repayAmountRaw,
        debtFromDecimals,
        chunkBuyAmount,
        cowFlashLoanInfo,
        chunkFlashLoanAmount,
        numChunks,
        isMax,
    });

    // Return N identical chunks - each processes per-chunk amounts
    return Array(numChunks).fill(null).map(() => ({
        preInstructions,
        postInstructions,
        flashLoanRepaymentUtxoIndex: 6,
    }));
}

function logCowInstructions(params: {
    selectedTo: SwapAsset;
    debtFromName: string;
    repayAmountRaw: bigint;
    debtFromDecimals: number;
    chunkBuyAmount: bigint;
    cowFlashLoanInfo: FlashLoanInfo;
    chunkFlashLoanAmount: bigint;
    numChunks: number;
    isMax?: boolean;
}): void {
    console.log("[buildCowInstructions] Debt Swap (KIND_BUY):", {
        sellToken: params.selectedTo.symbol,
        buyToken: params.debtFromName,
        totalOldDebtToBuy: formatUnits(params.repayAmountRaw, params.debtFromDecimals),
        chunkOldDebtToBuy: formatUnits(params.chunkBuyAmount, params.debtFromDecimals),
        flashLoanToken: params.selectedTo.symbol,
        totalFlashLoanAmount: formatUnits(params.cowFlashLoanInfo.amount, params.selectedTo.decimals),
        chunkFlashLoanAmount: formatUnits(params.chunkFlashLoanAmount, params.selectedTo.decimals),
        numChunks: params.numChunks,
        isMax: params.isMax ?? false,
        dustClearing: params.isMax ? "enabled (UTXO[4] refund pushed to user)" : "disabled",
        utxoLayout: "UTXO[0]=actualSell, UTXO[1]=leftover, UTXO[4]=repayRefund, UTXO[5]=borrowed, UTXO[6]=borrowed+leftover",
    });
}

// ============ Limit Order Execution Helpers ============

export function logLimitOrderBuildStart(params: {
    selectedTo: SwapAsset;
    debtFromName: string;
    limitOrderNewDebt: bigint;
    repayAmountRaw: bigint;
    debtFromDecimals: number;
    cowFlashLoanInfo: FlashLoanInfo;
    cowQuote: CowQuoteResponse | null | undefined;
}): void {
    const { selectedTo, debtFromName, limitOrderNewDebt, repayAmountRaw, debtFromDecimals, cowFlashLoanInfo, cowQuote } = params;

    console.log("[Limit Order] Building debt swap order (KIND_BUY):", {
        sellToken: selectedTo.symbol,
        buyToken: debtFromName,
        maxSellAmount: formatUnits(limitOrderNewDebt, selectedTo.decimals),
        exactBuyAmount: formatUnits(repayAmountRaw, debtFromDecimals),
        flashLoanToken: selectedTo.symbol,
        flashLoanAmount: formatUnits(cowFlashLoanInfo.amount, selectedTo.decimals),
        flashLoanLender: cowFlashLoanInfo.lender,
        cowQuoteSellAmount: cowQuote ? formatUnits(getCowQuoteSellAmount(cowQuote), selectedTo.decimals) : "N/A",
    });
}

export interface LimitOrderCallParams {
    selectedTo: SwapAsset;
    debtFromToken: string;
    limitOrderNewDebt: bigint;
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
    operationType: "debt-swap";
    protocolName: string;
} {
    const { selectedTo, debtFromToken, limitOrderNewDebt, repayAmountRaw, cowFlashLoanInfo, buildCowInstructions, limitOrderConfig, protocolName } = params;
    const numChunks = limitOrderConfig?.numChunks ?? 1;
    const chunkSellAmount = limitOrderNewDebt / BigInt(numChunks);
    const chunkBuyAmount = repayAmountRaw / BigInt(numChunks);
    const chunkFlashLoanAmount = cowFlashLoanInfo.amount / BigInt(numChunks);

    return {
        sellToken: selectedTo.address as Address,    // newDebt to sell
        buyToken: debtFromToken,                      // oldDebt to receive
        chunkSize: chunkSellAmount,                   // Per-chunk newDebt to sell
        minBuyPerChunk: chunkBuyAmount,               // Per-chunk oldDebt amount needed
        totalAmount: limitOrderNewDebt,               // Total across all chunks
        chunks: buildCowInstructions,
        completion: CompletionType.Iterations,
        targetValue: numChunks,
        minHealthFactor: "1.0",
        seedAmount: 0n,
        flashLoan: {
            lender: cowFlashLoanInfo.lender as Address,
            token: selectedTo.address as Address,
            amount: chunkFlashLoanAmount,
        },
        preOrderInstructions: [],
        isKindBuy: true,
        operationType: "debt-swap",
        protocolName,
    };
}

export function handleLimitOrderBuildFailure(
    result: LimitOrderBuildResult,
    analyticsProps: DebtSwapAnalyticsProps
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

    track("debt_swap_limit_order_complete", {
        ...analyticsProps,
        status: "error",
        error: errorMsg,
    });

    throw new Error(errorMsg);
}

export function saveLimitOrderNote(
    salt: string | undefined,
    protocolName: string,
    debtFromName: string,
    selectedToSymbol: string,
    chainId: number
): void {
    if (!salt) {
        console.warn("[saveLimitOrderNote] No salt provided, skipping note save");
        return;
    }

    const note = createDebtSwapNote(
        salt,
        protocolName,
        debtFromName,      // old debt being repaid
        selectedToSymbol,  // new debt being taken on
        chainId
    );
    console.log("[saveLimitOrderNote] Saving note:", {
        salt,
        protocolName,
        sellToken: note.sellToken,
        buyToken: note.buyToken,
        chainId,
    });
    saveOrderNote(note);
}

export async function executeBatchedLimitOrder(params: {
    allCalls: Array<{ to: string; data: string }>;
    sendCallsAsync: (params: { calls: readonly unknown[] }) => Promise<{ id: string }>;
    setSuppressBatchNotifications: (val: boolean) => void;
    setBatchId: (id: string) => void;
    setLastOrderSalt: (salt: string | null) => void;
    setLimitOrderNotificationId: (id: string | number | null) => void;
    salt: string;
    notificationId: string | number;
    analyticsProps: DebtSwapAnalyticsProps;
}): Promise<void> {
    const {
        allCalls,
        sendCallsAsync,
        setSuppressBatchNotifications,
        setBatchId,
        setLastOrderSalt,
        setLimitOrderNotificationId,
        salt,
        notificationId,
        analyticsProps,
    } = params;

    console.log("[Limit Order] Using batched TX mode (EIP-5792)");

    const { id: newBatchId } = await sendCallsAsync({
        calls: allCalls,
    });

    setSuppressBatchNotifications(true);
    setBatchId(newBatchId);
    setLastOrderSalt(salt);
    setLimitOrderNotificationId(notificationId);

    notification.remove(notificationId);
    notification.loading(
        <TransactionToast
            step="pending"
            message="Waiting for batch confirmation..."
        />
    );

    track("debt_swap_limit_order_complete", { ...analyticsProps, status: "batched", batchId: newBatchId });
}

type TransactionReceipt = Awaited<ReturnType<PublicClient["waitForTransactionReceipt"]>>;

export async function executeSequentialLimitOrder(params: {
    allCalls: Array<{ to: string; data: string }>;
    walletClient: WalletClient;
    publicClient: PublicClient;
    chainId: number;
    orderManagerAddress: string;
    analyticsProps: DebtSwapAnalyticsProps;
    onClose: () => void;
    notificationId: string | number;
    onSuccess?: (receipts: TransactionReceipt[]) => void;
}): Promise<void> {
    const {
        allCalls,
        walletClient,
        publicClient,
        chainId,
        orderManagerAddress,
        analyticsProps,
        onClose,
        onSuccess,
    } = params;
    let { notificationId } = params;
    const receipts: TransactionReceipt[] = [];

    console.log("[Limit Order] Using sequential TX mode");

    if (!walletClient.account) {
        throw new Error("WalletClient must have an account configured");
    }
    const account = walletClient.account;

    for (let i = 0; i < allCalls.length; i++) {
        const call = allCalls[i];
        notification.remove(notificationId);
        notificationId = notification.loading(
            <TransactionToast step="pending" message={`Executing step ${i + 1}/${allCalls.length}...`} />
        );

        const hash = await walletClient.sendTransaction({
            to: call.to as Address,
            data: call.data as `0x${string}`,
            chain: walletClient.chain,
            account,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        receipts.push(receipt);
    }

    notification.remove(notificationId);
    const explorerUrl = getCowExplorerAddressUrl(chainId, orderManagerAddress);
    notification.success(
        <TransactionToast
            step="confirmed"
            message="Limit order created!"
            blockExplorerLink={explorerUrl}
        />
    );

    track("debt_swap_limit_order_complete", { ...analyticsProps, status: "success" });
    onSuccess?.(receipts);
    onClose();
}

export function handleLimitOrderError(
    error: unknown,
    notificationId: string | number | undefined,
    analyticsProps: DebtSwapAnalyticsProps
): void {
    if (notificationId) {
        notification.remove(notificationId);
    }

    const errorMessage = error instanceof Error ? error.message : "Transaction failed";
    notification.error(
        <TransactionToast
            step="failed"
            message={errorMessage}
        />
    );

    track("debt_swap_limit_order_complete", {
        ...analyticsProps,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
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
    requiredNewDebt: bigint;
    requiredNewDebtFormatted: string;
    exchangeRate: string;
}

export function calculateRequiredNewDebt(params: {
    selectedTo: SwapAsset | null;
    repayAmountRaw: bigint;
    oneInchUnitQuote: { dstAmount: string } | null | undefined;
    pendleUnitQuote: { data: { amountPtOut?: string; amountTokenOut?: string } } | null | undefined;
    debtFromDecimals: number;
    slippage: number;
}): QuoteCalculationResult {
    const { selectedTo, repayAmountRaw, oneInchUnitQuote, pendleUnitQuote, debtFromDecimals, slippage } = params;

    if (!selectedTo || repayAmountRaw === 0n) {
        return { requiredNewDebt: 0n, requiredNewDebtFormatted: "0", exchangeRate: "0" };
    }

    // Get unit output from whichever quote is available
    const unitOut = getUnitOutput(oneInchUnitQuote, pendleUnitQuote);

    if (unitOut === 0n) {
        return { requiredNewDebt: 0n, requiredNewDebtFormatted: "0", exchangeRate: "0" };
    }

    // Exchange rate: how much currentDebt per 1 newDebt
    const rate = formatUnits(unitOut, debtFromDecimals);

    // requiredNewDebt = repayAmountRaw / rate = repayAmountRaw * 1_newDebt / unitOut
    const unitIn = 10n ** BigInt(selectedTo.decimals);
    const base = (repayAmountRaw * unitIn) / unitOut;

    // Apply slippage buffer from UI (e.g., 1% slippage -> multiply by 1.01)
    const slippageBps = BigInt(Math.round(slippage * 100)); // 1% -> 100 bps
    const required = (base * (10000n + slippageBps)) / 10000n;

    return {
        requiredNewDebt: required,
        requiredNewDebtFormatted: formatUnits(required, selectedTo.decimals),
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

export function calculateLimitOrderNewDebt(
    cowQuote: CowQuoteResponse | null | undefined,
    selectedTo: SwapAsset | null,
): bigint {
    if (!cowQuote || !selectedTo) return 0n;

    // Return raw quote - users set their own price via +/- buttons
    return getCowQuoteSellAmount(cowQuote);
}
