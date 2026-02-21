/**
 * Configuration hook for CollateralSwapModal.
 *
 * This hook encapsulates all the state and logic for collateral swaps,
 * providing a clean interface that can be used with SwapModalShell.
 *
 * Collateral swaps are complex operations that:
 * - Use flash loans to enable atomic swaps
 * - Support multiple protocols (Aave, Compound, Venus, Morpho, Euler)
 * - Support both market (instant) and limit (CoW) order execution
 * - Handle protocol-specific instruction building
 */

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useDebounceValue } from "usehooks-ts";
import { track } from "@vercel/analytics";
import { formatUnits, parseUnits, type Address, encodeAbiParameters } from "viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@radix-ui/themes";

// Hooks
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { usePendleConvert } from "~~/hooks/usePendleConvert";
import { useCowQuote } from "~~/hooks/useCowQuote";
import {
    useCowConditionalOrder,
    encodeLimitPriceTriggerParams,
    getProtocolId,
    type ConditionalOrderInstructions,
} from "~~/hooks/useCowConditionalOrder";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useAutoSlippage } from "~~/hooks/useAutoSlippage";
import { useMorphoCollateralSwapMarkets, marketToContext } from "~~/hooks/useMorphoCollateralSwapMarkets";
import { useEulerCollateralSwapVaults } from "~~/hooks/useEulerCollateralSwapVaults";
import { useSaveOrder } from "~~/hooks/useOrderHistory";

// Utils
import { parseAmount } from "~~/utils/validation";
import {
    FlashLoanProvider,
    type ProtocolInstruction,
    createRouterInstruction,
    createProtocolInstruction,
    encodeApprove,
    encodeFlashLoan,
    encodeLendingInstruction,
    encodePushToken,
    encodeToOutput,
    LendingOp,
    normalizeProtocolName,
    encodeMorphoContext,
    encodeEulerContext,
    calculateLimitPrice,
    type MorphoMarketContextForEncoding,
} from "~~/utils/v2/instructionHelpers";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
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
    getCowExplorerAddressUrl,
    getPreferredFlashLoanLender,
    calculateFlashLoanFee,
    storeOrderQuoteRate,
    getKapanCowAdapter,
} from "~~/utils/cow";
import { calculateSuggestedSlippage } from "~~/utils/slippage";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { saveOrderNote, createCollateralSwapNote, dispatchOrderCreated } from "~~/utils/orderNotes";
import { extractOrderHash } from "~~/utils/orderHashExtractor";
import { WarningDisplay } from "~~/components/common/ErrorDisplay";
import { ExecutionTypeToggle } from "./ExecutionTypeToggle";

// Types
import type { SwapAsset, SwapRouter } from "../SwapModalShell";
import type { SwapOperationConfig, UseCollateralSwapConfigProps, ExecutionType, FlashLoanInfo, LimitOrderConfig, FlashLoanConfig } from "./swapConfigTypes";
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import type { TransactionReceipt } from "~~/utils/transactionSimulation";

// ============================================================================
// Constants
// ============================================================================

// Aave flash loan fee buffer: 9 bps (0.09%)
const AAVE_FEE_BUFFER_BPS = 9n;

// Protocol name constants to avoid duplicate string literals
const MORPHO_BLUE_PROTOCOL = "morpho-blue";
const EULER_PROTOCOL = "euler";

// ============================================================================
// Helper Functions
// ============================================================================

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

    const isAaveWithMax = isMax && providerEnum === FlashLoanProvider.Aave;

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
interface QuoteSource {
    source: string;
    amount: bigint;
}

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

    if (quotes.length === 0) {
        return null;
    }
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

    if ((swapRouter === "1inch" || swapRouter === "kyber") && oneInchQuote) {
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

    if ((swapRouter === "1inch" || swapRouter === "kyber") && oneInchQuote?.srcUSD && oneInchQuote?.dstUSD) {
        const srcUSD = Number.parseFloat(oneInchQuote.srcUSD);
        const dstUSD = Number.parseFloat(oneInchQuote.dstUSD);
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
    const useCollateralOp = normalized === MORPHO_BLUE_PROTOCOL || normalized === "compound";
    return useCollateralOp ? LendingOp.DepositCollateral : LendingOp.Deposit;
}

/**
 * Resolves the swap router when the currently selected one is unavailable.
 * Uses a lookup table instead of nested ternaries to keep complexity low.
 */
function resolveSwapRouter(
    current: SwapRouter,
    kyber: boolean,
    oneInch: boolean,
    pendle: boolean,
): SwapRouter {
    const fallbackOrder: Record<SwapRouter, SwapRouter[]> = {
        kyber: ["1inch", "pendle", "kyber"],
        "1inch": ["kyber", "pendle", "1inch"],
        pendle: ["kyber", "1inch", "pendle"],
    };

    const isAvailable: Record<SwapRouter, boolean> = {
        kyber,
        "1inch": oneInch,
        pendle,
    };

    if (isAvailable[current]) {
        return current;
    }

    const candidates = fallbackOrder[current];
    return candidates.find(r => isAvailable[r]) ?? current;
}

// ============================================================================
// Conditional Order Instruction Builders (extracted for complexity reduction)
// ============================================================================

/** Shared params for conditional order instruction builders */
interface ConditionalInstructionParams {
    normalizedProtocol: string;
    depositOp: LendingOp;
    selectedFrom: SwapAsset;
    selectedTo: SwapAsset;
    userAddress: Address;
    conditionalOrderManagerAddress: Address;
    isMax: boolean;
}

/**
 * Appends "dust clearing" instructions when isMax is true.
 * After the main withdraw + push, reads any remaining supply balance
 * and withdraws + pushes it to the user.
 *
 * NOTE: PushToken does NOT create a UTXO, so UTXO indices continue from
 * the index of the last instruction that *does* produce a UTXO.
 */
function appendDustClearingInstructions(
    instructions: ProtocolInstruction[],
    normalizedProtocol: string,
    sellTokenAddress: Address,
    userAddress: Address,
    contextEncoded: string,
    /** The UTXO index where GetSupplyBalance output will land */
    supplyBalanceUtxoIndex: number,
): void {
    instructions.push(
        createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.GetSupplyBalance, sellTokenAddress, userAddress, 0n, contextEncoded, 999)
        )
    );
    instructions.push(
        createProtocolInstruction(
            normalizedProtocol,
            encodeLendingInstruction(LendingOp.WithdrawCollateral, sellTokenAddress, userAddress, 0n, contextEncoded, supplyBalanceUtxoIndex)
        )
    );
    instructions.push(
        createRouterInstruction(encodePushToken(supplyBalanceUtxoIndex + 1, userAddress))
    );
}

/**
 * Builds Morpho conditional order post-instructions WITH debt migration.
 */
function buildMorphoConditionalWithDebt(
    params: ConditionalInstructionParams,
    oldContext: string,
    newContext: string,
    debtTokenAddress: Address,
): ConditionalOrderInstructions {
    const { normalizedProtocol, depositOp, selectedFrom, selectedTo, userAddress, conditionalOrderManagerAddress } = params;

    const postInstructions: ProtocolInstruction[] = [
        createRouterInstruction(encodeApprove(1, normalizedProtocol)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(depositOp, selectedTo.address, userAddress, 0n, newContext, 1)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.GetBorrowBalance, debtTokenAddress, userAddress, 0n, oldContext, 999)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.Borrow, debtTokenAddress, userAddress, 0n, newContext, 3)),
        createRouterInstruction(encodeApprove(4, normalizedProtocol)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.Repay, debtTokenAddress, userAddress, 0n, oldContext, 3)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, 0n, oldContext, 0)),
        createRouterInstruction(encodePushToken(7, conditionalOrderManagerAddress)),
    ];
    console.log("[CollateralSwap] Morpho WITH debt flow - postInstructions count:", postInstructions.length);
    return { preInstructions: [], postInstructions };
}

/**
 * Builds Morpho conditional order post-instructions WITHOUT debt (collateral-only).
 */
function buildMorphoConditionalNoDebt(
    params: ConditionalInstructionParams,
    oldContext: string,
    newContext: string,
): ConditionalOrderInstructions {
    const { normalizedProtocol, depositOp, selectedFrom, selectedTo, userAddress, conditionalOrderManagerAddress } = params;

    const postInstructions: ProtocolInstruction[] = [
        createRouterInstruction(encodeApprove(1, normalizedProtocol)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(depositOp, selectedTo.address, userAddress, 0n, newContext, 1)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, 0n, oldContext, 0)),
        createRouterInstruction(encodePushToken(3, conditionalOrderManagerAddress)),
    ];
    console.log("[CollateralSwap] Morpho NO debt flow - postInstructions count:", postInstructions.length);
    return { preInstructions: [], postInstructions };
}

/**
 * Builds Euler conditional order post-instructions.
 * Appends dust clearing when isMax is true.
 */
function buildEulerConditionalInstructions(
    params: ConditionalInstructionParams,
    oldContext: string,
    newContext: string,
): ConditionalOrderInstructions {
    const { normalizedProtocol, selectedFrom, selectedTo, userAddress, conditionalOrderManagerAddress, isMax } = params;

    const postInstructions: ProtocolInstruction[] = [
        createRouterInstruction(encodeApprove(1, normalizedProtocol)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.DepositCollateral, selectedTo.address, userAddress, 0n, newContext, 1)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, 0n, oldContext, 0)),
        createRouterInstruction(encodePushToken(3, conditionalOrderManagerAddress)),
    ];

    if (isMax) {
        appendDustClearingInstructions(postInstructions, normalizedProtocol, selectedFrom.address, userAddress, oldContext, 4);
    }

    return { preInstructions: [], postInstructions };
}

/**
 * Builds standard (Aave, Compound, Venus) conditional order post-instructions.
 * Appends dust clearing when isMax is true.
 */
function buildStandardConditionalInstructions(
    params: ConditionalInstructionParams,
    protocolContext: string,
): ConditionalOrderInstructions {
    const { normalizedProtocol, depositOp, selectedFrom, selectedTo, userAddress, conditionalOrderManagerAddress, isMax } = params;

    const postInstructions: ProtocolInstruction[] = [
        createRouterInstruction(encodeApprove(1, normalizedProtocol)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(depositOp, selectedTo.address, userAddress, 0n, protocolContext, 1)),
        createProtocolInstruction(normalizedProtocol, encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, 0n, protocolContext, 0)),
        createRouterInstruction(encodePushToken(3, conditionalOrderManagerAddress)),
    ];
    console.log("[CollateralSwap] Standard flow - postInstructions count:", postInstructions.length, "isMax:", isMax, "manager:", conditionalOrderManagerAddress);

    if (isMax) {
        appendDustClearingInstructions(postInstructions, normalizedProtocol, selectedFrom.address, userAddress, protocolContext, 4);
        console.log("[CollateralSwap] After isMax additions - postInstructions count:", postInstructions.length);
    }

    console.log("[CollateralSwap] Final postInstructions:", postInstructions.map((p, i) => `[${i}] ${p.protocolName}`).join(", "));
    return { preInstructions: [], postInstructions };
}

// ============================================================================
// Market Order Flow Builders (extracted for complexity reduction)
// ============================================================================

/** Shared params for market order flow builders */
interface MarketFlowParams {
    selectedFrom: SwapAsset;
    selectedTo: SwapAsset;
    userAddress: Address;
    amountInBigInt: bigint;
    providerEnum: FlashLoanProvider;
    swapProtocol: string;
    swapData: string;
}

/**
 * Encodes the swap context ABI parameters used by Morpho and Euler market flows.
 */
function encodeSwapContext(toAddress: Address, minOut: string, swapData: string): `0x${string}` {
    return encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
        [toAddress, BigInt(minOut), swapData as `0x${string}`]
    );
}

/**
 * Returns the base instructions shared by Morpho and Euler market flows:
 * ToOutput, FlashLoan, Approve, Swap.
 */
function buildBaseMarketInstructions(
    params: MarketFlowParams,
    swapContext: `0x${string}`,
): ProtocolInstruction[] {
    const { selectedFrom, userAddress, amountInBigInt, providerEnum, swapProtocol } = params;
    return [
        createRouterInstruction(encodeToOutput(amountInBigInt, selectedFrom.address)),
        createRouterInstruction(encodeFlashLoan(providerEnum, 0)),
        createRouterInstruction(encodeApprove(1, swapProtocol)),
        createProtocolInstruction(swapProtocol, encodeLendingInstruction(LendingOp.Swap, selectedFrom.address, userAddress, 0n, swapContext, 1)),
    ];
}

/**
 * Calculates the flash loan withdraw amount, adding a fee buffer for Aave providers.
 * Balancer V2/V3 has no fee, so no buffer needed.
 */
function calculateWithdrawAmount(amountInBigInt: bigint, providerEnum: FlashLoanProvider): bigint {
    const isAaveFlashLoan = providerEnum === FlashLoanProvider.Aave;
    return isAaveFlashLoan
        ? amountInBigInt + (amountInBigInt / 1000n)
        : amountInBigInt;
}

/**
 * Builds the Morpho-specific market order flow.
 * Includes optional debt migration when currentDebtBalance > 0.
 */
function buildMorphoMarketFlow(
    params: MarketFlowParams,
    swapContext: `0x${string}`,
    oldContext: string,
    newContext: string,
    currentDebtBalance: bigint | undefined,
    debtTokenAddress: Address | undefined,
    proportionalDebtAmount: bigint | undefined,
    isMax: boolean,
): ProtocolInstruction[] {
    const { selectedFrom, selectedTo, userAddress, amountInBigInt, providerEnum } = params;
    const instructions = buildBaseMarketInstructions(params, swapContext);

    instructions.push(
        createRouterInstruction(encodeApprove(3, MORPHO_BLUE_PROTOCOL)),
        createProtocolInstruction(MORPHO_BLUE_PROTOCOL, encodeLendingInstruction(LendingOp.DepositCollateral, selectedTo.address, userAddress, 0n, newContext, 3)),
    );

    const hasDebt = currentDebtBalance !== undefined && currentDebtBalance > 0n;
    if (hasDebt && debtTokenAddress) {
        const useFixedDebtAmount = proportionalDebtAmount !== undefined && !isMax;
        if (useFixedDebtAmount) {
            instructions.push(createRouterInstruction(encodeToOutput(proportionalDebtAmount!, debtTokenAddress)));
        } else {
            instructions.push(createProtocolInstruction(MORPHO_BLUE_PROTOCOL, encodeLendingInstruction(LendingOp.GetBorrowBalance, debtTokenAddress, userAddress, 0n, oldContext, 999)));
        }

        instructions.push(
            createProtocolInstruction(MORPHO_BLUE_PROTOCOL, encodeLendingInstruction(LendingOp.Borrow, debtTokenAddress, userAddress, 0n, newContext, 6)),
            createRouterInstruction(encodeApprove(7, MORPHO_BLUE_PROTOCOL)),
            createProtocolInstruction(MORPHO_BLUE_PROTOCOL, encodeLendingInstruction(LendingOp.Repay, debtTokenAddress, userAddress, 0n, oldContext, 6)),
        );
    }

    const withdrawAmount = calculateWithdrawAmount(amountInBigInt, providerEnum);
    instructions.push(createProtocolInstruction(MORPHO_BLUE_PROTOCOL, encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, withdrawAmount, oldContext, 999)));

    return instructions;
}

/**
 * Builds the Euler-specific market order flow.
 */
function buildEulerMarketFlow(
    params: MarketFlowParams,
    swapContext: `0x${string}`,
    oldContext: string,
    newContext: string,
): ProtocolInstruction[] {
    const { selectedFrom, selectedTo, userAddress, amountInBigInt } = params;
    const instructions = buildBaseMarketInstructions(params, swapContext);

    instructions.push(
        createRouterInstruction(encodeApprove(3, EULER_PROTOCOL)),
        createProtocolInstruction(EULER_PROTOCOL, encodeLendingInstruction(LendingOp.DepositCollateral, selectedTo.address, userAddress, 0n, newContext, 3)),
    );

    const withdrawAmount = amountInBigInt + (amountInBigInt / 1000n);
    instructions.push(createProtocolInstruction(EULER_PROTOCOL, encodeLendingInstruction(LendingOp.WithdrawCollateral, selectedFrom.address, userAddress, withdrawAmount, oldContext, 999)));

    return instructions;
}

/**
 * Computes whether the quote is still loading based on execution type and router.
 */
function computeIsQuoteLoading(
    executionType: ExecutionType,
    swapRouter: SwapRouter,
    isCowQuoteLoading: boolean,
    isPendleLoading: boolean,
    is1inchLoading: boolean,
    isMorpho: boolean,
    isMorphoMarketsLoading: boolean,
    isEuler: boolean,
    isEulerVaultsLoading: boolean,
    isInputSettling: boolean,
): boolean {
    const routerLoading = executionType === "limit"
        ? isCowQuoteLoading
        : (swapRouter === "pendle" ? isPendleLoading : is1inchLoading);

    return routerLoading
        || (isMorpho && isMorphoMarketsLoading)
        || (isEuler && isEulerVaultsLoading)
        || isInputSettling;
}

/**
 * Computes the minimum buy amount from the best quote, applying slippage.
 * Supports custom buy amounts for limit orders.
 */
function computeMinBuyAmount(
    selectedTo: SwapAsset | null,
    executionType: ExecutionType,
    useCustomBuyAmount: boolean,
    customBuyAmount: string,
    bestQuote: QuoteSource | null,
    limitSlippage: number,
    slippage: number,
): { raw: bigint; formatted: string } {
    if (!selectedTo) {
        return { raw: 0n, formatted: "0" };
    }

    if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
        const customParsed = Number.parseFloat(customBuyAmount);
        if (!Number.isNaN(customParsed) && customParsed > 0) {
            const rawCustom = BigInt(Math.floor(customParsed * (10 ** selectedTo.decimals)));
            return { raw: rawCustom, formatted: customBuyAmount };
        }
    }

    if (!bestQuote) {
        return { raw: 0n, formatted: "0" };
    }

    const slippageToUse = executionType === "limit" ? limitSlippage : slippage;
    const bufferBps = BigInt(Math.round(slippageToUse * 100));
    const minRaw = (bestQuote.amount * (10000n - bufferBps)) / 10000n;
    return { raw: minRaw, formatted: formatUnits(minRaw, selectedTo.decimals) };
}

/**
 * Computes proportional debt amount for partial Morpho collateral swaps.
 */
function computeProportionalDebt(
    isMorpho: boolean,
    currentDebtBalance: bigint | undefined,
    rawBalance: bigint | undefined,
    decimals: number | undefined,
    amountIn: string,
    isMax: boolean,
): bigint | undefined {
    if (!isMorpho || !currentDebtBalance || !rawBalance || rawBalance === 0n) {
        return undefined;
    }
    if (isMax) {
        return undefined;
    }
    const amount = parseUnits(amountIn || "0", decimals ?? 18);
    if (amount === 0n) {
        return undefined;
    }
    return (currentDebtBalance * amount) / rawBalance;
}

/**
 * Computes a USD fallback value from a token price and amount string.
 */
function computeUsdFallback(price: bigint | undefined, amountStr: string | undefined): number | undefined {
    if (!price || !amountStr) {
        return undefined;
    }
    const parsed = Number.parseFloat(amountStr);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return undefined;
    }
    return parsed * Number(formatUnits(price, 8));
}

/**
 * Builds target assets list based on protocol type.
 * Morpho uses target markets, Euler uses target vaults, others filter available assets.
 */
function buildTargetAssets(
    isMorpho: boolean,
    morphoTargetMarkets: MorphoMarket[],
    isEuler: boolean,
    eulerTargetVaults: Record<string, { tokenSymbol: string; tokenAddress: string; decimals: number; vaultAddress: string }>,
    availableAssets: SwapAsset[],
    selectedFromAddress: string | undefined,
): SwapAsset[] {
    if (isMorpho && morphoTargetMarkets.length > 0) {
        const seenAddresses = new Set<string>();
        return morphoTargetMarkets
            .filter(m => {
                const addr = m.collateralAsset?.address?.toLowerCase();
                if (!addr || seenAddresses.has(addr)) {
                    return false;
                }
                seenAddresses.add(addr);
                return true;
            })
            .map(m => ({
                symbol: m.collateralAsset?.symbol || "???",
                address: (m.collateralAsset?.address || "") as Address,
                decimals: m.collateralAsset?.decimals || 18,
                rawBalance: 0n,
                balance: 0,
                icon: tokenNameToLogo(m.collateralAsset?.symbol?.toLowerCase() || ""),
                price: m.collateralAsset?.priceUsd
                    ? BigInt(Math.round(Number(m.collateralAsset.priceUsd) * 1e8))
                    : undefined,
            } as SwapAsset));
    }

    if (isEuler && Object.keys(eulerTargetVaults).length > 0) {
        const lcFrom = selectedFromAddress?.toLowerCase();
        return Object.values(eulerTargetVaults)
            .filter(vault => vault.tokenAddress.toLowerCase() !== lcFrom)
            .map(vault => ({
                symbol: vault.tokenSymbol,
                address: vault.tokenAddress as Address,
                decimals: vault.decimals,
                rawBalance: 0n,
                balance: 0,
                icon: tokenNameToLogo(vault.tokenSymbol.toLowerCase()),
                price: undefined,
                eulerCollateralVault: vault.vaultAddress,
            } as SwapAsset));
    }

    const lcFrom = selectedFromAddress?.toLowerCase();
    return availableAssets.filter(a => a.address.toLowerCase() !== lcFrom) as SwapAsset[];
}

/**
 * Computes the new Euler context encoding for the selected target vault.
 */
function computeNewEulerContext(
    isEuler: boolean,
    eulerBorrowVault: string | undefined,
    selectedTo: SwapAsset | null,
    eulerTargetVaults: Record<string, { vaultAddress: string }>,
    eulerSubAccountIndex: number | undefined,
): string | undefined {
    if (!isEuler || !eulerBorrowVault || !selectedTo) {
        return undefined;
    }
    const eulerVaultFromAsset = (selectedTo as SwapAsset & { eulerCollateralVault?: string }).eulerCollateralVault;
    if (eulerVaultFromAsset) {
        return encodeEulerContext({
            borrowVault: eulerBorrowVault as Address,
            collateralVault: eulerVaultFromAsset as Address,
            subAccountIndex: eulerSubAccountIndex,
        });
    }
    const tokenAddr = selectedTo.address.toLowerCase();
    const targetVault = eulerTargetVaults[tokenAddr];
    if (!targetVault) {
        return undefined;
    }
    return encodeEulerContext({
        borrowVault: eulerBorrowVault as Address,
        collateralVault: targetVault.vaultAddress as Address,
        subAccountIndex: eulerSubAccountIndex,
    });
}

/**
 * Computes the market rate (buy/sell) from the best quote.
 */
function computeMarketRate(
    bestQuote: QuoteSource | null,
    selectedFrom: SwapAsset | null,
    selectedToDecimals: number | undefined,
    amountInBigInt: bigint,
): number | null {
    if (!bestQuote || !selectedFrom || amountInBigInt === 0n) {
        return null;
    }
    const sellAmountFloat = Number(formatUnits(amountInBigInt, selectedFrom.decimals));
    const buyAmountFloat = Number(formatUnits(bestQuote.amount, selectedToDecimals ?? 18));
    if (sellAmountFloat === 0) {
        return null;
    }
    return buyAmountFloat / sellAmountFloat;
}

/**
 * Extracts swap data and validates adapter availability for the given router.
 * Returns null if the required data is missing.
 */
function extractSwapDataForRouter(
    swapRouter: SwapRouter,
    oneInchQuote: { tx: { data: string } } | undefined,
    pendleQuote: { transaction: { data: string } } | undefined,
    activeAdapter: { address: string } | undefined,
    pendleAdapter: { address: string } | undefined,
): { swapData: string; minOut: string } | null {
    if (swapRouter === "1inch" || swapRouter === "kyber") {
        if (!oneInchQuote || !activeAdapter) {
            return null;
        }
        return { swapData: oneInchQuote.tx.data, minOut: "1" };
    }

    if (!pendleQuote || !pendleAdapter) {
        return null;
    }
    return { swapData: pendleQuote.transaction.data, minOut: "1" };
}

/**
 * Resolves the active swap adapter based on the current router selection.
 */
function resolveActiveAdapter(
    swapRouter: SwapRouter,
    kyberAdapter: { address: string } | undefined,
    pendleAdapter: { address: string } | undefined,
    oneInchAdapter: { address: string } | undefined,
): { address: string } | undefined {
    if (swapRouter === "kyber") return kyberAdapter;
    if (swapRouter === "pendle") return pendleAdapter;
    return oneInchAdapter;
}

/**
 * Resolves the quote error based on the current router selection.
 */
function resolveQuoteError(
    swapRouter: SwapRouter,
    pendleError: Error | null | undefined,
    oneInchError: Error | null | undefined,
): Error | null | undefined {
    return swapRouter === "pendle" ? pendleError : oneInchError;
}

/**
 * Computes the amountInBigInt from the text input and selected asset.
 */
function computeAmountInBigInt(amountIn: string, selectedFrom: SwapAsset | null): bigint {
    if (!selectedFrom) return 0n;
    const result = parseAmount(amountIn || "0", selectedFrom.decimals);
    return result.value ?? 0n;
}

/**
 * Computes the amountOut value, considering limit order custom buy amounts.
 */
function computeAmountOut(
    executionType: ExecutionType,
    useCustomBuyAmount: boolean,
    customBuyAmount: string,
    bestQuote: QuoteSource | null,
    swapRouter: SwapRouter,
    oneInchQuote: { dstAmount: string } | undefined,
    pendleQuote: { data: { amountPtOut?: string; amountTokenOut?: string } } | undefined,
    selectedToDecimals: number,
): string {
    if (executionType === "limit" && useCustomBuyAmount && customBuyAmount) {
        return customBuyAmount;
    }
    return calculateAmountOut(executionType, bestQuote, swapRouter, oneInchQuote, pendleQuote, selectedToDecimals);
}

/**
 * Computes flash loan info for CoW conditional orders.
 */
function computeCowFlashLoanInfo(
    executionType: ExecutionType,
    selectedFrom: SwapAsset | null,
    chainId: number,
    amountInBigInt: bigint,
    providerName: string | undefined,
): FlashLoanInfo | null {
    if (executionType !== "limit" || !selectedFrom) return null;
    const providerType = providerName as "morpho" | "balancerV2" | "balancerV3" | "aaveV3" | undefined;
    const lenderInfo = getPreferredFlashLoanLender(chainId, providerType);
    if (!lenderInfo) return null;
    const fee = calculateFlashLoanFee(amountInBigInt, lenderInfo.provider);
    return {
        lender: lenderInfo.address as Address,
        provider: lenderInfo.provider,
        fee,
        amount: amountInBigInt,
        token: selectedFrom.address,
    };
}

/**
 * Resolves the trigger context for conditional order params.
 */
function resolveTriggerContext(
    isMorpho: boolean,
    isEuler: boolean,
    oldMorphoContextEncoded: string | undefined,
    oldEulerContextEncoded: string | undefined,
    context: string | undefined,
): `0x${string}` {
    if (isMorpho && oldMorphoContextEncoded) return oldMorphoContextEncoded as `0x${string}`;
    if (isEuler && oldEulerContextEncoded) return oldEulerContextEncoded as `0x${string}`;
    return (context || "0x") as `0x${string}`;
}

/**
 * Computes canSubmit for market orders.
 */
function computeCanSubmitMarket(
    hasQuote: boolean,
    hasAdapter: boolean,
    amountIn: string,
    morphoDebtInfoNotLoaded: boolean,
): boolean {
    return hasQuote && hasAdapter && Number.parseFloat(amountIn) > 0 && !morphoDebtInfoNotLoaded;
}

/**
 * Computes canSubmit for limit orders.
 */
function computeCanSubmitLimit(
    selectedFrom: SwapAsset | null,
    selectedTo: SwapAsset | null,
    amountIn: string,
    conditionalOrderReady: boolean,
    cowFlashLoanInfo: FlashLoanInfo | null,
    limitPriceTriggerAddress: string | undefined,
    conditionalOrderTriggerParams: string | null,
    morphoDebtInfoNotLoaded: boolean,
): boolean {
    return !!selectedFrom && !!selectedTo && Number.parseFloat(amountIn) > 0
        && conditionalOrderReady && !!cowFlashLoanInfo && !!limitPriceTriggerAddress
        && !!conditionalOrderTriggerParams && !morphoDebtInfoNotLoaded;
}

/**
 * Computes the old Morpho context encoding.
 */
function computeOldMorphoContextEncoded(
    morphoContext: MorphoMarketContextForEncoding | undefined,
): string | undefined {
    if (!morphoContext) return undefined;
    return encodeMorphoContext(morphoContext as MorphoMarketContextForEncoding);
}

/**
 * Computes the new Morpho context from a selected market.
 */
function computeNewMorphoContext(selectedMorphoMarket: MorphoMarket | null) {
    if (!selectedMorphoMarket) return null;
    return marketToContext(selectedMorphoMarket);
}

/**
 * Computes the encoded new Morpho context.
 */
function computeNewMorphoContextEncoded(
    newMorphoContext: ReturnType<typeof marketToContext> | null,
): string | undefined {
    if (!newMorphoContext) return undefined;
    return encodeMorphoContext(newMorphoContext);
}

/**
 * Computes the old Euler context encoding.
 */
function computeOldEulerContextEncoded(
    isEuler: boolean,
    eulerBorrowVault: string | undefined,
    eulerCollateralVault: string | undefined,
    eulerSubAccountIndex: number | undefined,
): string | undefined {
    if (!isEuler || !eulerBorrowVault || !eulerCollateralVault) return undefined;
    return encodeEulerContext({
        borrowVault: eulerBorrowVault as Address,
        collateralVault: eulerCollateralVault as Address,
        subAccountIndex: eulerSubAccountIndex,
    });
}

/**
 * Determines if Morpho debt info hasn't loaded yet (blocking submission).
 */
function computeMorphoDebtInfoNotLoaded(
    isMorpho: boolean,
    isMax: boolean,
    amountIn: string,
    currentDebtBalance: bigint | undefined,
): boolean {
    return isMorpho && !isMax && Number.parseFloat(amountIn) > 0 && currentDebtBalance === undefined;
}

/**
 * Determines if the 1inch/kyber quote should be enabled.
 */
function compute1inchQuoteEnabled(
    kyberAvailable: boolean,
    oneInchAvailable: boolean,
    swapRouter: SwapRouter,
    amountIn: string,
    selectedFrom: SwapAsset | null,
    selectedTo: SwapAsset | null,
    activeAdapter: { address: string } | undefined,
): boolean {
    const routerMatch = swapRouter === "kyber" || swapRouter === "1inch";
    const hasAmount = !!amountIn && Number.parseFloat(amountIn) > 0;
    return (kyberAvailable || oneInchAvailable) && routerMatch && hasAmount && !!selectedFrom && !!selectedTo && !!activeAdapter;
}

/**
 * Determines if the Pendle quote should be enabled.
 */
function computePendleQuoteEnabled(
    pendleAvailable: boolean,
    swapRouter: SwapRouter,
    amountIn: string,
    selectedFrom: SwapAsset | null,
    selectedTo: SwapAsset | null,
    pendleAdapter: { address: string } | undefined,
): boolean {
    const hasAmount = !!amountIn && Number.parseFloat(amountIn) > 0;
    return pendleAvailable && swapRouter === "pendle" && hasAmount && !!selectedFrom && !!selectedTo && !!pendleAdapter;
}

/**
 * Determines if the CoW quote should be enabled.
 */
function computeCowQuoteEnabled(
    cowAvailable: boolean,
    executionType: ExecutionType,
    amountIn: string,
    selectedFrom: SwapAsset | null,
    selectedTo: SwapAsset | null,
    userAddress: string | undefined,
): boolean {
    const hasAmount = !!amountIn && Number.parseFloat(amountIn) > 0;
    return cowAvailable && executionType === "limit" && hasAmount && !!selectedFrom && !!selectedTo && !!userAddress;
}

/**
 * Resolves the swap protocol name for the instruction builder.
 */
function resolveSwapProtocol(swapRouter: SwapRouter): "oneinch" | "kyber" | "pendle" {
    if (swapRouter === "1inch") return "oneinch";
    if (swapRouter === "kyber") return "kyber";
    return "pendle";
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook that provides all configuration for a collateral swap operation.
 *
 * Returns a SwapOperationConfig that can be spread into SwapModalShell.
 */
export function useCollateralSwapConfig(props: UseCollateralSwapConfigProps): SwapOperationConfig {
    const {
        isOpen,
        onClose,
        chainId,
        protocolName,
        availableAssets,
        initialFromTokenAddress,
        context,
        position,
        morphoContext,
        debtTokenAddress,
        currentDebtBalance,
        eulerBorrowVault,
        eulerCollateralVault,
        eulerSubAccountIndex,
    } = props;

    // ============ Protocol Detection ============
    const isMorpho = normalizeProtocolName(protocolName) === "morpho-blue";
    const isEuler = normalizeProtocolName(protocolName) === "euler";

    // ============ Hooks ============
    const { buildCollateralSwapFlow } = useKapanRouterV2({ chainId });
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient({ chainId });
    const publicClient = usePublicClient({ chainId });
    const {
        buildOrderCalls: buildConditionalOrderCalls,
        isReady: conditionalOrderReady,
        managerAddress: conditionalOrderManagerAddress,
        limitPriceTriggerAddress,
    } = useCowConditionalOrder();
    const saveOrder = useSaveOrder();

    // ============ Morpho Markets ============
    const { targetMarkets: morphoTargetMarkets, isLoading: isMorphoMarketsLoading } = useMorphoCollateralSwapMarkets({
        chainId,
        debtTokenAddress: debtTokenAddress || "",
        currentCollateralAddress: initialFromTokenAddress || "",
        enabled: isMorpho && isOpen && !!debtTokenAddress,
    });

    const [selectedMorphoMarket, setSelectedMorphoMarket] = useState<MorphoMarket | null>(null);

    useEffect(() => {
        if (isMorpho && morphoTargetMarkets.length > 0 && !selectedMorphoMarket) {
            setSelectedMorphoMarket(morphoTargetMarkets[0]);
        }
    }, [isMorpho, morphoTargetMarkets, selectedMorphoMarket]);

    const newMorphoContext = useMemo(
        () => computeNewMorphoContext(selectedMorphoMarket),
        [selectedMorphoMarket],
    );

    const oldMorphoContextEncoded = useMemo(
        () => computeOldMorphoContextEncoded(morphoContext as MorphoMarketContextForEncoding | undefined),
        [morphoContext],
    );

    const newMorphoContextEncoded = useMemo(
        () => computeNewMorphoContextEncoded(newMorphoContext),
        [newMorphoContext],
    );

    // ============ Euler Vaults ============
    const { targetVaultsByAddress: eulerTargetVaults, isLoading: isEulerVaultsLoading } = useEulerCollateralSwapVaults({
        chainId,
        borrowVaultAddress: eulerBorrowVault || "",
        currentCollateralAddress: initialFromTokenAddress || "",
        enabled: isEuler && isOpen && !!eulerBorrowVault,
    });

    const oldEulerContextEncoded = useMemo(
        () => computeOldEulerContextEncoded(isEuler, eulerBorrowVault, eulerCollateralVault, eulerSubAccountIndex),
        [isEuler, eulerBorrowVault, eulerCollateralVault, eulerSubAccountIndex],
    );

    // ============ Swap Router Setup ============
    const oneInchAvailable = is1inchSupported(chainId);
    const kyberAvailable = isKyberSupported(chainId);
    const pendleAvailable = isPendleSupported(chainId);
    const cowAvailable = isCowProtocolSupported(chainId);
    const defaultRouter = getDefaultSwapRouter(chainId);

    const oneInchAdapter = getOneInchAdapterInfo(chainId);
    const kyberAdapter = getKyberAdapterInfo(chainId);
    const pendleAdapter = getPendleAdapterInfo(chainId);

    const [swapRouter, setSwapRouter] = useState<SwapRouter>(defaultRouter || "kyber");

    const activeAdapter = resolveActiveAdapter(swapRouter, kyberAdapter, pendleAdapter, oneInchAdapter);

    // Resolve swap router when selected one is unavailable on this chain
    useEffect(() => {
        const resolved = resolveSwapRouter(swapRouter, kyberAvailable, oneInchAvailable, pendleAvailable);
        if (resolved !== swapRouter) {
            setSwapRouter(resolved);
        }
    }, [chainId, oneInchAvailable, kyberAvailable, pendleAvailable, swapRouter]);

    // ============ Analytics Tracking ============
    const wasOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            track("collateral_swap_modal_open", {
                network: "evm",
                protocol: protocolName,
                chainId,
                market: context ?? null,
                positionType: position.type,
                positionToken: position.tokenAddress,
                positionName: position.name,
                initialFromTokenAddress: initialFromTokenAddress ?? null,
            });
        }
        wasOpenRef.current = isOpen;
    }, [chainId, initialFromTokenAddress, isOpen, context, position.name, position.tokenAddress, position.type, protocolName]);

    // ============ Flash Loan Providers ============
    const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
        isOpen,
        networkType: "evm",
        fromProtocol: protocolName,
        chainId,
        position: position || { name: "", tokenAddress: "", decimals: 18, type: "borrow" },
    });

    // ============ State ============
    const userAssets = useMemo(() =>
        availableAssets.filter(a => (a as SwapAsset).rawBalance > 0n) as SwapAsset[],
        [availableAssets]
    );

    const [selectedFrom, setSelectedFrom] = useState<SwapAsset | null>(null);
    const [selectedTo, setSelectedTo] = useState<SwapAsset | null>(null);
    const [slippage, setSlippage] = useState<number>(0.1);
    const [amountIn, setAmountIn] = useState("");
    const [isMax, setIsMax] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [debouncedAmountIn] = useDebounceValue(amountIn, 300);
    const isInputSettling = amountIn !== debouncedAmountIn;

    const [executionType, setExecutionType] = useState<ExecutionType>("market");
    const [limitSlippage, setLimitSlippage] = useState<number>(0.1);
    const [hasAutoSetLimitSlippage, setHasAutoSetLimitSlippage] = useState(false);
    const [hasAutoSetMarketSlippage, setHasAutoSetMarketSlippage] = useState(false);
    const [customBuyAmount, setCustomBuyAmount] = useState<string>("");
    const [useCustomBuyAmount, setUseCustomBuyAmount] = useState(false);
    const [numChunks, setNumChunks] = useState(1);

    // ============ Target Assets ============
    const targetAssets = useMemo(
        () => buildTargetAssets(isMorpho, morphoTargetMarkets, isEuler, eulerTargetVaults, availableAssets as SwapAsset[], selectedFrom?.address),
        [isMorpho, morphoTargetMarkets, availableAssets, selectedFrom, isEuler, eulerTargetVaults],
    );

    // Sync selectedMorphoMarket when user selects a "to" asset
    useEffect(() => {
        if (!isMorpho || !selectedTo) {
            return;
        }
        const matchingMarket = morphoTargetMarkets.find(
            m => m.collateralAsset?.address?.toLowerCase() === selectedTo.address.toLowerCase()
        );
        if (matchingMarket && matchingMarket.uniqueKey !== selectedMorphoMarket?.uniqueKey) {
            setSelectedMorphoMarket(matchingMarket);
        }
    }, [isMorpho, selectedTo, morphoTargetMarkets, selectedMorphoMarket]);

    // Euler: new context
    const newEulerContextEncoded = useMemo(
        () => computeNewEulerContext(isEuler, eulerBorrowVault, selectedTo, eulerTargetVaults, eulerSubAccountIndex),
        [isEuler, eulerBorrowVault, selectedTo, eulerTargetVaults, eulerSubAccountIndex],
    );

    // Auto-switch to Pendle for PT tokens
    useEffect(() => {
        const fromIsPT = selectedFrom && isPendleToken(selectedFrom.symbol);
        const toIsPT = selectedTo && isPendleToken(selectedTo.symbol);
        if ((fromIsPT || toIsPT) && pendleAvailable) {
            setSwapRouter("pendle");
        }
    }, [selectedFrom, selectedTo, pendleAvailable]);

    // ============ Flash Loan Selection ============
    const amountInBigInt = useMemo(
        () => computeAmountInBigInt(amountIn, selectedFrom),
        [amountIn, selectedFrom],
    );

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

    // ============ Quotes ============
    const oneInchEnabled = compute1inchQuoteEnabled(kyberAvailable, oneInchAvailable, swapRouter, amountIn, selectedFrom, selectedTo, activeAdapter);
    const { data: oneInchQuote, isLoading: is1inchLoading, error: oneInchError } = use1inchQuote({
        chainId,
        src: selectedFrom?.address as Address,
        dst: selectedTo?.address as Address,
        amount: quoteAmount,
        from: activeAdapter?.address || "",
        slippage: slippage,
        enabled: oneInchEnabled,
        preferredRouter: swapRouter === "kyber" ? "kyber" : "1inch",
    });

    const pendleEnabled = computePendleQuoteEnabled(pendleAvailable, swapRouter, amountIn, selectedFrom, selectedTo, pendleAdapter);
    const { data: pendleQuote, isLoading: isPendleLoading, error: pendleError } = usePendleConvert({
        chainId,
        receiver: pendleAdapter?.address as Address,
        tokensIn: selectedFrom?.address as Address,
        tokensOut: selectedTo?.address as Address,
        amountsIn: quoteAmount,
        slippage: slippage / 100,
        enabled: pendleEnabled,
    });

    const cowEnabled = computeCowQuoteEnabled(cowAvailable, executionType, amountIn, selectedFrom, selectedTo, userAddress);
    const { data: cowQuote, isLoading: isCowQuoteLoading } = useCowQuote({
        sellToken: selectedFrom?.address || "",
        buyToken: selectedTo?.address || "",
        sellAmount: quoteAmount,
        from: userAddress || "",
        enabled: cowEnabled,
    });

    const isQuoteLoading = computeIsQuoteLoading(
        executionType, swapRouter, isCowQuoteLoading, isPendleLoading, is1inchLoading,
        isMorpho, isMorphoMarketsLoading, isEuler, isEulerVaultsLoading, isInputSettling,
    );

    const quoteError = resolveQuoteError(swapRouter, pendleError, oneInchError);

    const bestQuote = useMemo(
        () => findBestQuote(oneInchQuote, pendleQuote, cowQuote ?? undefined),
        [oneInchQuote, pendleQuote, cowQuote]
    );

    const amountOut = useMemo(
        () => computeAmountOut(executionType, useCustomBuyAmount, customBuyAmount, bestQuote, swapRouter, oneInchQuote, pendleQuote, selectedTo?.decimals || 18),
        [executionType, bestQuote, swapRouter, oneInchQuote, pendleQuote, selectedTo?.decimals, useCustomBuyAmount, customBuyAmount],
    );

    const marketRate = useMemo(
        () => computeMarketRate(bestQuote, selectedFrom, selectedTo?.decimals, amountInBigInt),
        [bestQuote, selectedFrom, selectedTo, amountInBigInt],
    );

    const quotesPriceImpact = useMemo(
        () => calculateQuotesPriceImpact(swapRouter, pendleQuote, oneInchQuote),
        [swapRouter, pendleQuote, oneInchQuote]
    );

    // Auto-estimate slippage
    useEffect(() => {
        if (executionType !== "market" || hasAutoSetMarketSlippage) {
            return;
        }
        if (quotesPriceImpact === null) {
            return;
        }
        const suggested = calculateSuggestedSlippage(quotesPriceImpact);
        setSlippage(suggested);
        setHasAutoSetMarketSlippage(true);
    }, [executionType, quotesPriceImpact, hasAutoSetMarketSlippage]);

    useEffect(() => {
        if (executionType !== "limit" || hasAutoSetLimitSlippage) {
            return;
        }
        if (quotesPriceImpact === null) {
            return;
        }
        const suggested = calculateSuggestedSlippage(quotesPriceImpact);
        setLimitSlippage(suggested);
        setHasAutoSetLimitSlippage(true);
    }, [executionType, quotesPriceImpact, hasAutoSetLimitSlippage]);

    useEffect(() => {
        setHasAutoSetLimitSlippage(false);
        setLimitSlippage(0.1);
        setHasAutoSetMarketSlippage(false);
        setSlippage(0.1);
    }, [selectedFrom?.address, selectedTo?.address]);

    // USD fallbacks for price impact
    const srcUsdFallback = useMemo(
        () => computeUsdFallback(selectedFrom?.price, amountIn),
        [selectedFrom?.price, amountIn],
    );

    const dstUsdFallback = useMemo(
        () => computeUsdFallback(selectedTo?.price, amountOut),
        [selectedTo?.price, amountOut],
    );

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

    // Min buy amount
    const minBuyAmount = useMemo(
        () => computeMinBuyAmount(selectedTo, executionType, useCustomBuyAmount, customBuyAmount, bestQuote, limitSlippage, slippage),
        [selectedTo, bestQuote, executionType, limitSlippage, slippage, useCustomBuyAmount, customBuyAmount],
    );

    // Flash loan info for CoW
    const cowFlashLoanInfo = useMemo(
        () => computeCowFlashLoanInfo(executionType, selectedFrom, chainId, amountInBigInt, selectedProvider?.name),
        [executionType, selectedFrom, chainId, amountInBigInt, selectedProvider],
    );

    // Proportional debt for Morpho
    const proportionalDebtAmount = useMemo(
        () => computeProportionalDebt(isMorpho, currentDebtBalance, selectedFrom?.rawBalance, selectedFrom?.decimals, amountIn, isMax),
        [isMorpho, currentDebtBalance, selectedFrom?.rawBalance, selectedFrom?.decimals, amountIn, isMax],
    );

    // ============ Conditional Order Instructions Builder ============
    // Dispatches to extracted protocol-specific builders to keep complexity low.
    // For KapanConditionalOrderManager, post-hook UTXOs are:
    // UTXO[0] = actualSellAmount (what was sold in the swap)
    // UTXO[1] = actualBuyAmount (received from swap)
    const buildConditionalOrderInstructionsData = useMemo((): ConditionalOrderInstructions => {
        if (!selectedFrom?.address || !selectedTo?.address || !userAddress || amountInBigInt === 0n || !conditionalOrderManagerAddress || !cowFlashLoanInfo) {
            return { preInstructions: [], postInstructions: [] };
        }

        const normalizedProtocol = normalizeProtocolName(protocolName);
        const depositOp = getDepositOperation(protocolName);
        const params: ConditionalInstructionParams = {
            normalizedProtocol,
            depositOp,
            selectedFrom,
            selectedTo,
            userAddress,
            conditionalOrderManagerAddress,
            isMax,
        };

        // Morpho flow - needs proper context encoding for both old and new markets
        if (isMorpho && oldMorphoContextEncoded && newMorphoContextEncoded) {
            const hasDebt = currentDebtBalance !== undefined && currentDebtBalance > 0n;
            if (hasDebt && debtTokenAddress) {
                return buildMorphoConditionalWithDebt(params, oldMorphoContextEncoded, newMorphoContextEncoded, debtTokenAddress as Address);
            }
            return buildMorphoConditionalNoDebt(params, oldMorphoContextEncoded, newMorphoContextEncoded);
        }

        // Euler flow
        if (isEuler && oldEulerContextEncoded && newEulerContextEncoded) {
            return buildEulerConditionalInstructions(params, oldEulerContextEncoded, newEulerContextEncoded);
        }

        // Standard flow (Aave, Compound, Venus)
        return buildStandardConditionalInstructions(params, context || "0x");
    }, [
        selectedFrom, selectedTo, userAddress, amountInBigInt, conditionalOrderManagerAddress,
        cowFlashLoanInfo, protocolName, context, isMorpho, oldMorphoContextEncoded,
        newMorphoContextEncoded, isEuler, oldEulerContextEncoded, newEulerContextEncoded,
        currentDebtBalance, debtTokenAddress, isMax
    ]);

    // ============ Conditional Order Trigger Params ============
    const triggerContext = useMemo(
        () => resolveTriggerContext(isMorpho, isEuler, oldMorphoContextEncoded, oldEulerContextEncoded, context),
        [isMorpho, isEuler, oldMorphoContextEncoded, oldEulerContextEncoded, context],
    );

    const conditionalOrderTriggerParams = useMemo(() => {
        if (!selectedFrom?.address || !selectedTo?.address || !limitPriceTriggerAddress || amountInBigInt === 0n || minBuyAmount.raw === 0n) {
            return null;
        }

        // Calculate limit price (8 decimals, Chainlink style)
        const limitPrice = calculateLimitPrice(
            amountInBigInt, selectedFrom.decimals,
            minBuyAmount.raw, selectedTo.decimals
        );

        // Collateral swap is a SELL order: we're selling exact old collateral for min new collateral
        return encodeLimitPriceTriggerParams({
            protocolId: getProtocolId(protocolName),
            protocolContext: triggerContext,
            sellToken: selectedFrom.address,
            buyToken: selectedTo.address,
            sellDecimals: selectedFrom.decimals,
            buyDecimals: selectedTo.decimals,
            limitPrice,
            triggerAbovePrice: false,
            totalSellAmount: amountInBigInt,
            totalBuyAmount: 0n,
            numChunks,
            maxSlippageBps: Math.round(limitSlippage * 100),
            isKindBuy: false,
        });
    }, [
        selectedFrom, selectedTo, limitPriceTriggerAddress, amountInBigInt,
        minBuyAmount.raw, protocolName, triggerContext, numChunks, limitSlippage,
    ]);

    // ============ Market Order Flow Builder ============
    // Dispatches to extracted protocol-specific builders to keep complexity low.
    const buildFlow = useCallback(() => {
        if (!selectedFrom || !selectedTo || !userAddress) {
            return [];
        }

        const swapDataResult = extractSwapDataForRouter(swapRouter, oneInchQuote, pendleQuote, activeAdapter, pendleAdapter);
        if (!swapDataResult) {
            return [];
        }

        const providerEnum = selectedProvider?.providerEnum ?? FlashLoanProvider.BalancerV2;
        const swapProtocol = resolveSwapProtocol(swapRouter);
        const flowParams: MarketFlowParams = {
            selectedFrom,
            selectedTo,
            userAddress,
            amountInBigInt,
            providerEnum,
            swapProtocol,
            swapData: swapDataResult.swapData,
        };

        // Morpho flow
        if (isMorpho && oldMorphoContextEncoded && newMorphoContextEncoded) {
            const swapContext = encodeSwapContext(selectedTo.address, swapDataResult.minOut, swapDataResult.swapData);
            return buildMorphoMarketFlow(
                flowParams, swapContext, oldMorphoContextEncoded, newMorphoContextEncoded,
                currentDebtBalance, debtTokenAddress as Address | undefined,
                proportionalDebtAmount, isMax,
            );
        }

        // Euler flow
        if (isEuler && oldEulerContextEncoded && newEulerContextEncoded) {
            const swapContext = encodeSwapContext(selectedTo.address, swapDataResult.minOut, swapDataResult.swapData);
            return buildEulerMarketFlow(flowParams, swapContext, oldEulerContextEncoded, newEulerContextEncoded);
        }

        // Standard flow (Aave, Compound, Venus)
        return buildCollateralSwapFlow(
            protocolName,
            selectedFrom.address,
            selectedTo.address,
            amountIn,
            swapDataResult.minOut,
            swapDataResult.swapData,
            selectedFrom.decimals,
            context,
            isMax,
            providerEnum,
            false,
            swapProtocol
        );
    }, [
        selectedFrom, selectedTo, userAddress, swapRouter, oneInchQuote, pendleQuote,
        activeAdapter, pendleAdapter, selectedProvider, isMorpho, oldMorphoContextEncoded,
        newMorphoContextEncoded, debtTokenAddress, amountInBigInt, isMax, proportionalDebtAmount,
        isEuler, oldEulerContextEncoded, newEulerContextEncoded, buildCollateralSwapFlow,
        protocolName, amountIn, context, currentDebtBalance
    ]);

    const { handleConfirm: handleSwap, batchingPreference } = useEvmTransactionFlow({
        isOpen,
        chainId,
        onClose,
        buildFlow,
        successMessage: "Collateral Swapped successfully!",
        emptyFlowErrorMessage: "Failed to build swap instructions",
        simulateWhenBatching: true,
    });

    // ============ Conditional Order Execution (New System) ============
    const executeConditionalOrder = useCallback(async (txBeginProps: Record<string, string | number | boolean | null>): Promise<void> => {
        track("collateral_swap_conditional_order_begin", { ...txBeginProps, orderSystem: "conditional" });

        if (!selectedFrom || !selectedTo || !userAddress || !conditionalOrderManagerAddress || !cowFlashLoanInfo || !limitPriceTriggerAddress || !conditionalOrderTriggerParams) {
            throw new Error("Missing required data for conditional order");
        }

        console.log("[CollateralSwap] Creating order with postInstructions count:", buildConditionalOrderInstructionsData.postInstructions.length);
        console.log("[CollateralSwap] Instructions:", buildConditionalOrderInstructionsData.postInstructions.map((p, i) => `[${i}] ${p.protocolName}`).join(", "));
        const result = await buildConditionalOrderCalls({
            triggerAddress: limitPriceTriggerAddress,
            triggerStaticData: conditionalOrderTriggerParams,
            sellToken: selectedFrom.address as Address,
            buyToken: selectedTo.address as Address,
            preInstructions: buildConditionalOrderInstructionsData.preInstructions,
            postInstructions: buildConditionalOrderInstructionsData.postInstructions,
            maxIterations: numChunks,
            flashLoan: {
                lender: cowFlashLoanInfo.lender,
                token: selectedFrom.address as Address,
                amount: amountInBigInt / BigInt(numChunks),
            },
            sellTokenRefundAddress: getKapanCowAdapter(chainId) as Address, // KapanCowAdapter for flash loan repayment
            operationType: "collateral-swap",
            protocolName,
            isKindBuy: false, // SELL order: exact sellAmount, min buyAmount
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
            saveOrderNote(createCollateralSwapNote(
                result.salt,
                protocolName,
                selectedFrom.symbol,
                selectedTo.symbol,
                chainId
            ));
        }

        const notificationId = notification.loading(
            <TransactionToast step="pending" message={`Creating conditional order (${result.calls.length} operations)...`} />
        );

        if (!walletClient || !publicClient) {
            throw new Error("Wallet not connected");
        }

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

        if (result.salt && selectedFrom && selectedTo) {
            saveOrder.mutate({
                orderUid: result.salt,
                orderHash,
                salt: result.salt,
                userAddress,
                chainId,
                orderType: "collateral_swap",
                protocol: protocolName,
                sellToken: selectedFrom.address,
                buyToken: selectedTo.address,
                sellTokenSymbol: selectedFrom.symbol,
                buyTokenSymbol: selectedTo.symbol,
                sellAmount: amountInBigInt.toString(),
                buyAmount: minBuyAmount.raw.toString(),
            });

            if (orderHash && amountInBigInt > 0n && minBuyAmount.raw > 0n) {
                const quoteRate = Number(amountInBigInt) / Number(minBuyAmount.raw);
                storeOrderQuoteRate(chainId, orderHash, quoteRate);
            }
        }

        track("collateral_swap_conditional_order_complete", { ...txBeginProps, status: "success", orderSystem: "conditional" });
        dispatchOrderCreated();
        onClose();
    }, [
        selectedFrom, selectedTo, userAddress, conditionalOrderManagerAddress, cowFlashLoanInfo,
        limitPriceTriggerAddress, conditionalOrderTriggerParams, buildConditionalOrderCalls,
        buildConditionalOrderInstructionsData, numChunks, amountInBigInt, protocolName, chainId,
        walletClient, publicClient, saveOrder, minBuyAmount.raw, onClose
    ]);

    // ============ Main Submit Handler ============
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
                await executeConditionalOrder(txBeginProps);
            } else {
                track("collateral_swap_tx_begin", txBeginProps);
                await handleSwap(amountIn, isMax);
                track("collateral_swap_tx_complete", { ...txBeginProps, status: "success" });
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
        executionType, executeConditionalOrder,
        handleSwap, protocolName, chainId, context,
        selectedFrom, selectedTo, amountIn, isMax, limitSlippage, slippage,
        batchingPreference.enabled, selectedProvider, swapRouter
    ]);

    // ============ Can Submit Logic ============
    const { enabled: preferBatching, setEnabled: setPreferBatching } = batchingPreference;
    const isPendleRouter = swapRouter === "pendle";
    const hasQuote = isPendleRouter ? !!pendleQuote : !!oneInchQuote;
    const hasAdapter = isPendleRouter ? !!pendleAdapter : !!activeAdapter;

    // Only block if Morpho debt info hasn't loaded yet (undefined), not if debt is 0
    const morphoDebtInfoNotLoaded = computeMorphoDebtInfoNotLoaded(isMorpho, isMax, amountIn, currentDebtBalance);

    const canSubmitMarket = computeCanSubmitMarket(hasQuote, hasAdapter, amountIn, morphoDebtInfoNotLoaded);
    const canSubmitLimit = computeCanSubmitLimit(selectedFrom, selectedTo, amountIn, conditionalOrderReady, cowFlashLoanInfo, limitPriceTriggerAddress, conditionalOrderTriggerParams, morphoDebtInfoNotLoaded);
    const canSubmit = executionType === "limit" ? canSubmitLimit : canSubmitMarket;

    // Prefer Morpho for limit orders
    useEffect(() => {
        if (executionType === "limit" && flashLoanProviders && flashLoanProviders.length > 0) {
            const morphoProvider = flashLoanProviders.find(p => p.name.toLowerCase().includes("morpho"));
            if (morphoProvider && selectedProvider?.name !== morphoProvider.name) {
                setSelectedProvider(morphoProvider);
            }
        }
    }, [executionType, flashLoanProviders, selectedProvider, setSelectedProvider]);

    // ============ UI Customization ============
    const handleAmountOutChange = useCallback((value: string) => {
        setCustomBuyAmount(value);
        setUseCustomBuyAmount(true);
    }, []);

    // Info content
    const infoContent: ReactNode = useMemo(() => (
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
                        <div className="bg-base-300 my-1 h-full w-0.5" />
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
                        <div className="bg-base-300 my-1 h-full w-0.5" />
                    </div>
                    <div className="pb-4">
                        <h4 className="text-sm font-medium">Swap</h4>
                        <p className="text-base-content/70 text-xs">
                            We swap your current collateral for the new asset using {swapRouter === "pendle" ? "Pendle" : swapRouter === "kyber" ? "Kyber" : "1inch"}.
                        </p>
                        <div className="bg-base-200 mt-1 inline-block rounded p-1 text-xs">
                            Router: {swapRouter === "pendle" ? "Pendle" : swapRouter === "kyber" ? "Kyber" : "1inch"}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                        <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">3</div>
                        <div className="bg-base-300 my-1 h-full w-0.5" />
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
    const warnings: ReactNode = useMemo(() => (
        <>
            {morphoDebtInfoNotLoaded && (
                <WarningDisplay
                    message="Unable to calculate proportional debt for partial swap. Use the MAX button to swap all collateral."
                    size="sm"
                />
            )}
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
    ), [morphoDebtInfoNotLoaded, swapRouter, oneInchQuote, oneInchAdapter, pendleAdapter, isOpen]);

    // Right panel
    const rightPanel: ReactNode = useMemo(() => {
        return (
            <div className="space-y-3">
                <ExecutionTypeToggle
                    value={executionType}
                    onChange={setExecutionType}
                    limitAvailable={cowAvailable}
                    limitReady={conditionalOrderReady}
                    limitDisabledReason={
                        !conditionalOrderReady
                            ? "CoW contracts not deployed on this chain"
                            : undefined
                    }
                />

                {executionType === "market" && (
                    <div className="space-y-2 text-xs">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Slippage</span>
                                <select
                                    className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                    value={slippage}
                                    onChange={(e) => setSlippage(Number.parseFloat(e.target.value))}
                                >
                                    {(swapRouter === "pendle"
                                        ? [0.1, 0.5, 1, 2, 3, 5, 7, 10, 15, 20]
                                        : [0.05, 0.1, 0.3, 0.5, 1, 2, 3, 5]
                                    ).map(s => (
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
                                            if (p) {
                                                setSelectedProvider(p);
                                            }
                                        }}
                                    >
                                        {flashLoanProviders.map(p => {
                                            const liq = liquidityData?.find(l => l.provider === p.providerEnum);
                                            return (
                                                <option key={p.name} value={p.name}>
                                                    {p.name} {liq ? (liq.hasLiquidity ? "\u2713" : "\u26A0\uFE0F") : ""}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="border-base-300/30 space-y-1 border-t pt-2">
                            {priceImpact !== undefined && priceImpact !== null && (
                                <div className="flex items-center justify-between">
                                    <span className="text-base-content/50">Price Impact</span>
                                    <span className={priceImpact > 1 ? "text-warning" : priceImpact > 3 ? "text-error" : "text-base-content/80"}>
                                        {priceImpact.toFixed(2)}%
                                    </span>
                                </div>
                            )}
                            {amountOut && Number.parseFloat(amountOut) > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-base-content/50">Min Output</span>
                                    <span className="text-base-content/80">
                                        {(Number.parseFloat(amountOut) * (1 - slippage / 100)).toFixed(4)} {selectedTo?.symbol}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {executionType === "limit" && (
                    <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-base-content/50">Order Type</span>
                            <Tooltip content="You are selling your current collateral to buy new collateral. The order executes when someone is willing to buy your collateral at your specified price or better.">
                                <span className="text-base-content/80 flex cursor-help items-center gap-1 font-medium">
                                    Sell Order
                                    <InformationCircleIcon className="text-base-content/40 size-3.5" />
                                </span>
                            </Tooltip>
                        </div>

                        {flashLoanProviders && flashLoanProviders.length > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-base-content/50">Flash Loan</span>
                                <select
                                    className="select select-xs select-ghost text-base-content/80 h-auto min-h-0 py-0.5 text-right font-medium"
                                    value={selectedProvider?.name || ""}
                                    onChange={(e) => {
                                        const provider = flashLoanProviders.find(p => p.name === e.target.value);
                                        if (provider) {
                                            setSelectedProvider(provider);
                                        }
                                    }}
                                >
                                    {flashLoanProviders.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

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
                                        if (absDiff < 0.01) {
                                            return <span className="text-base-content/40">at market price</span>;
                                        }
                                        return (
                                            <span className={isAbove ? "text-success" : "text-warning"}>
                                                {absDiff.toFixed(2)}% {isAbove ? "above" : "below"} market
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

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
                                            const val = Number.parseInt(e.target.value) || 1;
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
        );
    }, [
        executionType, setExecutionType, cowAvailable, conditionalOrderReady, isQuoteLoading,
        marketRate, selectedFrom, selectedTo, minBuyAmount, numChunks,
        amountInBigInt, slippage, priceImpact, amountOut, flashLoanProviders,
        selectedProvider, liquidityData, swapRouter, oneInchAvailable, pendleAvailable,
        setSelectedProvider, setSlippage, setSwapRouter
    ]);

    // Limit price buttons
    const limitPriceButtons: ReactNode = useMemo(() => {
        if (executionType !== "limit") {
            return null;
        }

        const adjustByPercent = (delta: number) => {
            if (!bestQuote || !selectedTo) {
                return;
            }
            const currentAmount = useCustomBuyAmount && customBuyAmount
                ? Number.parseFloat(customBuyAmount)
                : Number(formatUnits(bestQuote.amount, selectedTo.decimals));
            if (Number.isNaN(currentAmount)) {
                return;
            }
            const newAmount = currentAmount * (1 + delta / 100);
            setCustomBuyAmount(newAmount.toFixed(6));
            setUseCustomBuyAmount(true);
        };

        const resetToMarket = () => {
            if (!bestQuote || !selectedTo) {
                return;
            }
            const marketAmount = formatUnits(bestQuote.amount, selectedTo.decimals);
            setCustomBuyAmount(marketAmount);
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
    }, [executionType, bestQuote, selectedTo, useCustomBuyAmount, customBuyAmount]);

    // ============ Flash Loan Config ============
    const flashLoanConfig: FlashLoanConfig = useMemo(() => ({
        providers: flashLoanProviders || [],
        selectedProvider: selectedProvider || null,
        setSelectedProvider,
        liquidityData,
        required: true,
    }), [flashLoanProviders, selectedProvider, setSelectedProvider, liquidityData]);

    // ============ Limit Order Config ============
    const limitOrderConfig: LimitOrderConfig = useMemo(() => ({
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

    // ============ Return Config ============
    return {
        // Operation identity
        operationType: "collateral-swap",
        title: "Swap Collateral",
        protocolName,

        // Token configuration
        fromAssets: userAssets,
        toAssets: targetAssets,
        selectedFrom,
        selectedTo,
        setSelectedFrom,
        setSelectedTo,
        fromReadOnly: false,
        toReadOnly: false,
        fromLabel: "Swap From",
        toLabel: "Swap To",

        // Amount state
        amountIn,
        setAmountIn,
        isMax,
        setIsMax,
        amountOut,

        // Quote state
        isQuoteLoading,
        quoteError: executionType === "market" ? (quoteError ?? null) : null,
        priceImpact: executionType === "market" ? (priceImpact ?? null) : null,

        // Slippage
        slippage: executionType === "limit" ? limitSlippage : slippage,
        setSlippage: executionType === "limit" ? setLimitSlippage : setSlippage,

        // Execution
        executionType,
        setExecutionType,
        isSubmitting,
        canSubmit,
        submitLabel: executionType === "limit" ? "Create Order" : "Swap Collateral",
        onSubmit: handleSwapWrapper,

        // Flash Loan
        flashLoan: flashLoanConfig,

        // Limit Order
        limitOrder: limitOrderConfig,

        // Batching
        preferBatching: executionType === "market" ? preferBatching : undefined,
        setPreferBatching: executionType === "market" ? setPreferBatching : undefined,

        // UI customization
        infoContent,
        warnings,
        rightPanel,
        limitPriceButtons,
        hideDefaultStats: true,
        onAmountOutChange: executionType === "limit" ? handleAmountOutChange : undefined,
    };
}
