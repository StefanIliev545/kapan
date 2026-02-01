/**
 * Helper functions for MultiplyEvmModal to reduce cognitive complexity.
 * These functions extract complex logic into reusable, testable units.
 */
import { Address, formatUnits, parseUnits } from "viem";
import { SwapAsset } from "./SwapModalShell";
import {
  FlashLoanProvider,
  MorphoMarketContextForEncoding,
  encodeMorphoContext,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodeApprove,
  encodeAdd,
  encodeLendingInstruction,
  encodePushToken,
  LendingOp,
  normalizeProtocolName,
  ProtocolInstruction,
} from "~~/utils/v2/instructionHelpers";
import { calculateFlashLoanFee, getPreferredFlashLoanLender, type ChunkCalculationResult } from "~~/utils/cow";

// TODO: Migrate to new conditional order system - ChunkInstructions defined locally
type ChunkInstructions = { preInstructions: ProtocolInstruction[]; postInstructions: ProtocolInstruction[]; flashLoanRepaymentUtxoIndex?: number };
import { type LimitOrderResult } from "~~/components/LimitOrderConfig";

// Protocol identifier constants
const PROTOCOL_MORPHO = "morpho-blue";

// ==================== Types ====================

export interface QuoteData {
  oneInchQuote?: {
    dstAmount?: string;
    srcUSD?: string;
    dstUSD?: string;
    tx?: { data: string };
  } | null;
  pendleQuote?: {
    data: {
      amountPtOut?: string;
      amountTokenOut?: string;
      minPtOut?: string;
      minTokenOut?: string;
      priceImpact?: number;
    };
    transaction: { data: string };
  } | null;
  cowQuote?: {
    quote?: { buyAmount?: string };
  } | null;
}

export interface FlashLoanChunkConfig {
  useFlashLoan: boolean;
  flashLoanChunks: number;
  limitOrderConfig: LimitOrderResult | null;
  chainId: number;
}

export interface MetricsInput {
  collateral: SwapAsset | undefined;
  debt: SwapAsset | undefined;
  marginAmountRaw: bigint;
  minCollateralFormatted: string;
  flashLoanAmountRaw: bigint;
  effectiveLltvBps: bigint;
  zapMode: boolean;
}

export interface PositionMetrics {
  totalCollateralUsd: number;
  debtUsd: number;
  ltv: number;
  liquidationPrice: number | null;
  healthFactor: number;
  totalCollateralTokens: number;
}

export interface FeeBreakdown {
  flashLoanFeePercent: number;
  flashLoanFeeUsd: number;
  priceImpactPercent: number;
  priceImpactUsd: number;
  totalFeePercent: number;
  totalFeeUsd: number;
  flashLoanAmountUsd: number;
  feeOfPositionPercent: number;
}

// ==================== Quote Helpers ====================

/**
 * Get the best quote from all available sources.
 * Returns the quote with the highest output amount.
 */
export function getBestQuote(quotes: QuoteData): { source: string; amount: bigint } | null {
  const quoteList: { source: string; amount: bigint }[] = [];

  if (quotes.oneInchQuote?.dstAmount) {
    quoteList.push({ source: "1inch", amount: BigInt(quotes.oneInchQuote.dstAmount) });
  }
  if (quotes.pendleQuote?.data) {
    const outAmount = quotes.pendleQuote.data.amountPtOut || quotes.pendleQuote.data.amountTokenOut || "0";
    if (outAmount !== "0") {
      quoteList.push({ source: "Pendle", amount: BigInt(outAmount) });
    }
  }
  if (quotes.cowQuote?.quote?.buyAmount) {
    quoteList.push({ source: "CoW", amount: BigInt(quotes.cowQuote.quote.buyAmount) });
  }

  if (quoteList.length === 0) return null;

  return quoteList.reduce((best, current) =>
    current.amount > best.amount ? current : best
  );
}

/**
 * Calculate market rate from best quote.
 */
export function calculateMarketRate(
  bestQuote: { source: string; amount: bigint } | null,
  debt: SwapAsset | undefined,
  collateral: SwapAsset | undefined,
  swapQuoteAmount: bigint
): number | null {
  if (!bestQuote || !debt || swapQuoteAmount === 0n) return null;

  const sellAmountFloat = Number(formatUnits(swapQuoteAmount, debt.decimals));
  const buyAmountFloat = Number(formatUnits(bestQuote.amount, collateral?.decimals ?? 18));

  if (sellAmountFloat === 0) return null;
  return buyAmountFloat / sellAmountFloat;
}

/**
 * Calculate price impact from available quote data.
 */
export function calculateQuotesPriceImpact(
  swapRouter: "1inch" | "kyber" | "pendle",
  pendleQuote: QuoteData["pendleQuote"],
  oneInchQuote: QuoteData["oneInchQuote"]
): number | null {
  // Pendle provides priceImpact directly
  if (swapRouter === "pendle" && pendleQuote?.data?.priceImpact !== undefined) {
    return Math.abs(pendleQuote.data.priceImpact * 100);
  }
  // 1inch/Kyber: calculate from USD values
  if ((swapRouter === "1inch" || swapRouter === "kyber") && oneInchQuote?.srcUSD && oneInchQuote?.dstUSD) {
    const srcUSD = parseFloat(oneInchQuote.srcUSD);
    const dstUSD = parseFloat(oneInchQuote.dstUSD);
    if (srcUSD > 0) {
      return Math.max(0, ((srcUSD - dstUSD) / srcUSD) * 100);
    }
  }
  return null;
}

// ==================== Position Metrics Helpers ====================

/**
 * Calculate position metrics (LTV, collateral, debt, health factor, etc.)
 */
export function calculatePositionMetrics(input: MetricsInput): PositionMetrics {
  const { collateral, debt, marginAmountRaw, minCollateralFormatted, flashLoanAmountRaw, effectiveLltvBps, zapMode } = input;

  if (!collateral || !debt || marginAmountRaw === 0n) {
    return { totalCollateralUsd: 0, debtUsd: 0, ltv: 0, liquidationPrice: null, healthFactor: Infinity, totalCollateralTokens: 0 };
  }

  const cPrice = Number(formatUnits(collateral.price ?? 0n, 8));
  const dPrice = Number(formatUnits(debt.price ?? 0n, 8));

  // In zap mode, all collateral comes from the swap; otherwise margin + swap
  let totalCollateralTokens: number;
  if (zapMode) {
    // All collateral is from the swap (deposit + flash loan -> collateral)
    totalCollateralTokens = Number(minCollateralFormatted);
  } else {
    // Initial margin (in collateral) + swapped collateral
    const marginTokens = Number(formatUnits(marginAmountRaw, collateral.decimals));
    const swappedTokens = Number(minCollateralFormatted);
    totalCollateralTokens = marginTokens + swappedTokens;
  }
  const totalCollateralUsd = totalCollateralTokens * cPrice;

  const debtTokens = Number(formatUnits(flashLoanAmountRaw, debt.decimals));
  const debtUsd = debtTokens * dPrice;

  const ltv = totalCollateralUsd > 0 ? (debtUsd / totalCollateralUsd) * 100 : 0;
  const lltv = Number(effectiveLltvBps) / 10000;
  const healthFactor = debtUsd > 0 ? (totalCollateralUsd * lltv) / debtUsd : Infinity;

  // Liquidation price: price at which collateral * lltv = debt
  const liquidationPrice = debtUsd > 0 && totalCollateralTokens > 0
    ? debtUsd / (totalCollateralTokens * lltv)
    : null;

  return { totalCollateralUsd, debtUsd, ltv, liquidationPrice, healthFactor, totalCollateralTokens };
}

/**
 * Calculate net APY and 30-day yield.
 */
export function calculateNetApyAndYield(
  collateral: SwapAsset | undefined,
  debt: SwapAsset | undefined,
  metrics: PositionMetrics,
  supplyApyMap: Record<string, number>,
  borrowApyMap: Record<string, number>
): { netApy: number | null; netYield30d: number | null } {
  if (!collateral || !debt || metrics.totalCollateralUsd === 0) {
    return { netApy: null, netYield30d: null };
  }

  const supplyApy = supplyApyMap[collateral.address.toLowerCase()] ?? 0;
  const borrowApy = borrowApyMap[debt.address.toLowerCase()] ?? 0;

  // Weighted: (collateral * supplyAPY - debt * borrowAPY) / equity
  const equity = metrics.totalCollateralUsd - metrics.debtUsd;
  if (equity <= 0) return { netApy: null, netYield30d: null };

  const earnedYield = (metrics.totalCollateralUsd * supplyApy) / 100;
  const paidInterest = (metrics.debtUsd * borrowApy) / 100;
  const netYieldUsd = earnedYield - paidInterest; // Annual yield in USD

  const netApyValue = (netYieldUsd / equity) * 100; // as percentage
  const netYield30dValue = netYieldUsd * (30 / 365); // 30 day yield in USD

  return { netApy: netApyValue, netYield30d: netYield30dValue };
}

/**
 * Calculate fee breakdown for the position.
 */
export function calculateFeeBreakdown(
  shortAmount: number,
  debtPrice: number,
  selectedProviderName: string | undefined,
  swapRouter: "1inch" | "kyber" | "pendle",
  pendlePriceImpact: number | undefined,
  totalCollateralUsd: number
): FeeBreakdown {
  const flashLoanAmountUsd = shortAmount * debtPrice;

  // Flash loan fee: Aave = 0.05%, Balancer = 0%
  const isBalancer = selectedProviderName?.includes("Balancer");
  const flashLoanFeePercent = isBalancer ? 0 : 0.05;
  const flashLoanFeeUsd = flashLoanAmountUsd * (flashLoanFeePercent / 100);

  // Swap price impact from Pendle (already a decimal like -0.0001)
  const priceImpact = swapRouter === "pendle" ? (pendlePriceImpact ?? 0) : 0;
  const priceImpactPercent = Math.abs(priceImpact * 100); // Convert to positive percentage
  const priceImpactUsd = flashLoanAmountUsd * Math.abs(priceImpact);

  // Total fee
  const totalFeePercent = flashLoanFeePercent + priceImpactPercent;
  const totalFeeUsd = flashLoanFeeUsd + priceImpactUsd;

  // Fee as percentage of total position
  const feeOfPositionPercent = totalCollateralUsd > 0 ? (totalFeeUsd / totalCollateralUsd) * 100 : 0;

  return {
    flashLoanFeePercent,
    flashLoanFeeUsd,
    priceImpactPercent,
    priceImpactUsd,
    totalFeePercent,
    totalFeeUsd,
    flashLoanAmountUsd,
    feeOfPositionPercent,
  };
}

// ==================== Min Collateral Calculation ====================

export interface MinCollateralResult {
  raw: bigint;
  formatted: string;
}

/**
 * Calculate minimum collateral output with slippage buffer.
 */
export function calculateMinCollateralOut(
  collateral: SwapAsset | undefined,
  executionType: "market" | "limit",
  customMinPrice: string,
  bestQuote: { amount: bigint } | null,
  swapRouter: "1inch" | "kyber" | "pendle",
  oneInchQuote: QuoteData["oneInchQuote"],
  pendleQuote: QuoteData["pendleQuote"],
  limitSlippage: number,
  slippage: number
): MinCollateralResult {
  if (!collateral) return { raw: 0n, formatted: "0" };

  // For limit orders with custom min price
  if (executionType === "limit" && customMinPrice && customMinPrice !== "") {
    try {
      const customRaw = parseUnits(customMinPrice, collateral.decimals);
      return { raw: customRaw, formatted: customMinPrice };
    } catch {
      // Invalid input, fall through to calculated value
    }
  }

  // Get the relevant quote
  let quoted = 0n;
  if (executionType === "limit") {
    // For limit orders, use best quote from any source
    quoted = bestQuote?.amount ?? 0n;
  } else if ((swapRouter === "1inch" || swapRouter === "kyber") && oneInchQuote) {
    quoted = BigInt(oneInchQuote.dstAmount || "0");
  } else if (swapRouter === "pendle" && pendleQuote) {
    const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
    quoted = BigInt(outAmount);
  }

  if (quoted === 0n) return { raw: 0n, formatted: "0" };

  // Apply slippage tolerance
  const slippageToUse = executionType === "limit" ? limitSlippage : slippage;
  const bufferBps = BigInt(Math.round(slippageToUse * 100));
  const buffered = (quoted * (10000n - bufferBps)) / 10000n;

  return { raw: buffered, formatted: formatUnits(buffered, collateral.decimals) };
}

// ==================== Flash Loan Chunk Helpers ====================

export interface ChunkParamsResult extends ChunkCalculationResult {
  useFlashLoan?: boolean;
  flashLoanFee?: bigint;
  flashLoanLender?: string;
  /** The selected provider type (e.g., "morpho", "balancerV3", "aaveV3") for fee calculation */
  selectedProviderType?: string;
}

/**
 * Calculate flash loan chunk parameters for limit orders.
 */
export function calculateFlashLoanChunkParams(
  flashLoanAmountRaw: bigint,
  debt: SwapAsset,
  config: FlashLoanChunkConfig
): ChunkParamsResult {
  const { useFlashLoan, flashLoanChunks, limitOrderConfig, chainId } = config;

  if (!useFlashLoan) {
    return {
      numChunks: 1,
      chunkSize: flashLoanAmountRaw,
      chunkSizes: [flashLoanAmountRaw],
      needsChunking: false,
      initialBorrowCapacityUsd: 0n,
      geometricRatio: 0,
      recommendFlashLoan: false,
      explanation: "",
    };
  }

  const flashLoanLender = limitOrderConfig?.flashLoanLender
    ?? getPreferredFlashLoanLender(chainId, limitOrderConfig?.selectedProvider?.provider)?.address;
  const providerType = limitOrderConfig?.selectedProvider?.provider ?? "morpho";

  if (!flashLoanLender) {
    console.warn("[Limit Order] Flash loans not available on this chain for CoW orders");
    return {
      numChunks: 1,
      chunkSize: flashLoanAmountRaw,
      chunkSizes: [flashLoanAmountRaw],
      needsChunking: false,
      initialBorrowCapacityUsd: 0n,
      geometricRatio: 0,
      recommendFlashLoan: false,
      explanation: "Flash loans not available for limit orders on this chain",
    };
  }

  // Use user-specified chunk count
  const numChunks = flashLoanChunks;
  const baseChunkSize = flashLoanAmountRaw / BigInt(numChunks);
  const remainder = flashLoanAmountRaw % BigInt(numChunks);

  // Build chunk sizes array - last chunk gets remainder
  const chunkSizes = Array(numChunks).fill(baseChunkSize).map((size, i) =>
    i === numChunks - 1 ? size + remainder : size
  ) as bigint[];

  // Calculate fee per chunk
  const flashLoanFeePerChunk = limitOrderConfig?.flashLoanFee
    ?? calculateFlashLoanFee(baseChunkSize, providerType);

  console.log(`[Limit Order] Flash loan mode (CoW/${providerType}):`, {
    totalDebt: formatUnits(flashLoanAmountRaw, debt.decimals),
    numChunks,
    chunkSize: formatUnits(baseChunkSize, debt.decimals),
    flashLoanFeePerChunk: formatUnits(flashLoanFeePerChunk, debt.decimals),
    lender: flashLoanLender,
    lenderType: providerType,
  });

  return {
    numChunks,
    chunkSize: baseChunkSize,
    chunkSizes,
    needsChunking: numChunks > 1,
    initialBorrowCapacityUsd: 0n,
    geometricRatio: 0,
    recommendFlashLoan: true,
    useFlashLoan: true,
    flashLoanFee: flashLoanFeePerChunk,
    flashLoanLender,
    selectedProviderType: providerType,
    explanation: numChunks === 1
      ? (flashLoanFeePerChunk > 0n
          ? `Flash loan: single tx execution (fee: ${formatUnits(flashLoanFeePerChunk, debt.decimals)} ${debt.symbol})`
          : `Flash loan: single tx execution (no fee)`)
      : `Flash loan: ${numChunks} chunks of ~${formatUnits(baseChunkSize, debt.decimals)} ${debt.symbol}`,
  };
}

// ==================== CoW Instruction Building ====================

export interface CowInstructionsBuildParams {
  collateral: SwapAsset;
  debt: SwapAsset;
  userAddress: Address;
  flashLoanAmountRaw: bigint;
  marginAmountRaw: bigint;
  protocolName: string;
  morphoContext?: MorphoMarketContextForEncoding;
  market?: Address;
  orderManagerAddress: Address;
  chunkParams: ChunkParamsResult;
  chainId: number;
}

/**
 * Build deposit instructions for CoW orders.
 */
function buildDepositInstructions(
  normalizedProtocol: string,
  collateralAddress: Address,
  userAddress: Address,
  context: string
): ProtocolInstruction[] {
  const isCompound = normalizedProtocol === "compound";
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;

  // UTXO layout (KapanConditionalOrderManager prepends two ToOutput instructions):
  // UTXO[0] = actualSellAmount (debt tokens sold in swap)
  // UTXO[1] = actualBuyAmount (collateral received from swap, already transferred to router)
  // UTXO[2] = Approve output
  // (Deposit produces NO output)
  return [
    // 1. Approve collateral for lending protocol - amount from UTXO[1] (swap output)
    createRouterInstruction(encodeApprove(1, normalizedProtocol)),
    // 2. Deposit collateral received from swap (UTXO[1])
    createProtocolInstruction(
      normalizedProtocol,
      encodeLendingInstruction(depositOp, collateralAddress, userAddress, 0n, context, 1)
    ),
  ];
}

/**
 * Build flash loan mode chunk instructions.
 */
function buildFlashLoanModeChunks(params: CowInstructionsBuildParams): ChunkInstructions[] {
  const { collateral, debt, userAddress, flashLoanAmountRaw, marginAmountRaw, protocolName, morphoContext, market, chunkParams } = params;

  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const isCompound = normalizedProtocol === "compound";

  const context = isMorpho && morphoContext
    ? encodeMorphoContext(morphoContext)
    : (isCompound && market ? market : "0x");

  const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;

  const numChunks = chunkParams.numChunks;
  // Use the selected provider type from chunkParams for correct fee calculation
  const selectedProviderType = chunkParams.selectedProviderType ?? "morpho";

  // Split margin across chunks (last chunk gets remainder)
  const baseMarginPerChunk = marginAmountRaw / BigInt(numChunks);
  const marginRemainder = marginAmountRaw % BigInt(numChunks);

  const chunks: ChunkInstructions[] = [];

  for (let i = 0; i < numChunks; i++) {
    const isLastChunk = i === numChunks - 1;
    const marginThisChunk = isLastChunk ? baseMarginPerChunk + marginRemainder : baseMarginPerChunk;
    const chunkSize = chunkParams.chunkSizes[i];
    const feeThisChunk = calculateFlashLoanFee(chunkSize, selectedProviderType);
    const chunkRepayAmount = chunkSize + feeThisChunk;

    // UTXO layout (KapanConditionalOrderManager prepends two ToOutput instructions):
    // UTXO[0] = actualSellAmount (debt tokens sold in swap)
    // UTXO[1] = actualBuyAmount (collateral received from swap, already transferred to router)
    // UTXO[2] = Pull margin output
    // UTXO[3] = Add output (swap collateral + margin)
    // UTXO[4] = Approve output
    // UTXO[5] = Borrow output (for flash loan repayment)
    // PushToken(5) → zeroes UTXO[5], transfers to OrderManager (no new UTXO created)
    const postInstructions: ProtocolInstruction[] = [
      // 1. Pull this chunk's margin from user -> UTXO[2]
      createRouterInstruction(encodePullToken(marginThisChunk, collateral.address, userAddress)),

      // 2. Add swap output (UTXO[1]) + margin (UTXO[2]) -> UTXO[3]
      createRouterInstruction(encodeAdd(1, 2)),

      // 3. Approve total collateral for lending protocol -> UTXO[4]
      createRouterInstruction(encodeApprove(3, normalizedProtocol)),

      // 4. Deposit all collateral using UTXO[3]
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 3)
      ),

      // 5. Borrow to repay this chunk's flash loan -> UTXO[5]
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, chunkRepayAmount, context, 999)
      ),

      // 6. PushToken: push borrowed debt (UTXO[5]) back to OrderManager
      // OrderManager will refund excess to sellTokenRefundAddress (Adapter)
      // Adapter uses it to repay flash loan
      createRouterInstruction(encodePushToken(5, params.orderManagerAddress)),
    ];

    chunks.push({
      preInstructions: [],
      postInstructions,
      flashLoanRepaymentUtxoIndex: 5, // Borrow output at UTXO[5], pushed to OrderManager
    });
  }

  console.log("[buildCowInstructions] Flash loan mode:", {
    totalFlashLoan: formatUnits(flashLoanAmountRaw, debt.decimals),
    numChunks,
    chunkSize: formatUnits(chunkParams.chunkSize, debt.decimals),
    flashLoanFeePerChunk: formatUnits(chunkParams.flashLoanFee ?? 0n, debt.decimals),
    marginPerChunk: formatUnits(baseMarginPerChunk, collateral.decimals),
    totalMargin: formatUnits(marginAmountRaw, collateral.decimals),
    lender: chunkParams.flashLoanLender,
    flow: "[0]=sellAmt, [1]=buyAmt, [2]=pull margin, [3]=add(1+2), [4]=approve, [5]=borrow → push to OrderManager",
  });

  return chunks;
}

/**
 * Build multi-chunk mode (no flash loan) instructions.
 */
function buildMultiChunkModeChunks(params: CowInstructionsBuildParams): ChunkInstructions[] {
  const { collateral, debt, userAddress, protocolName, morphoContext, market, orderManagerAddress, chunkParams } = params;

  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const isCompound = normalizedProtocol === "compound";

  const context = isMorpho && morphoContext
    ? encodeMorphoContext(morphoContext)
    : (isCompound && market ? market : "0x");

  const depositInstructions = buildDepositInstructions(normalizedProtocol, collateral.address, userAddress, context);

  const numChunks = chunkParams.numChunks;
  const chunkSize = chunkParams.chunkSize;
  const chunks: ChunkInstructions[] = [];

  for (let i = 0; i < numChunks; i++) {
    if (i === numChunks - 1) {
      // Last chunk - deposit only
      chunks.push({
        preInstructions: [],
        postInstructions: [...depositInstructions],
      });
    } else {
      // Non-final chunk - deposit + borrow + push to OrderManager
      // UTXO layout after depositInstructions:
      // [0]=sellAmt, [1]=buyAmt(collateral), [2]=approve, (deposit produces NO output), [3]=borrow
      const postInstructionsWithBorrow: ProtocolInstruction[] = [
        ...depositInstructions,
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, chunkSize, context, 999)
        ),
        createRouterInstruction(encodePushToken(3, orderManagerAddress)),
      ];
      chunks.push({
        preInstructions: [],
        postInstructions: postInstructionsWithBorrow,
      });
    }
  }

  if (chunks.length === 0) {
    chunks.push({
      preInstructions: [],
      postInstructions: [...depositInstructions],
    });
  }

  console.log("[buildCowInstructions] Multi-chunk mode:", numChunks, "chunks");

  return chunks;
}

/**
 * Build per-iteration pre/post instructions for CoW limit order loop.
 */
export function buildCowChunkInstructions(params: CowInstructionsBuildParams): ChunkInstructions[] {
  const { collateral, debt, userAddress, flashLoanAmountRaw, orderManagerAddress, chunkParams } = params;

  if (!collateral || !debt || !userAddress || flashLoanAmountRaw === 0n || !orderManagerAddress) {
    return [{ preInstructions: [], postInstructions: [] }];
  }

  // Flash loan mode vs multi-chunk mode
  if (chunkParams.useFlashLoan && chunkParams.flashLoanLender) {
    return buildFlashLoanModeChunks(params);
  }

  return buildMultiChunkModeChunks(params);
}

/**
 * Build initial deposit flow for CoW limit orders (multi-chunk mode only).
 */
export function buildInitialDepositInstructions(
  collateral: SwapAsset | undefined,
  userAddress: Address | undefined,
  marginAmountRaw: bigint,
  protocolName: string,
  morphoContext?: MorphoMarketContextForEncoding,
  market?: Address
): ProtocolInstruction[] {
  if (!collateral || !userAddress || marginAmountRaw <= 0n) return [];

  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const isCompound = normalizedProtocol === "compound";

  const context = isMorpho && morphoContext
    ? encodeMorphoContext(morphoContext)
    : (isCompound && market ? market : "0x");

  const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;

  return [
    // Pull collateral from user
    createRouterInstruction(encodePullToken(marginAmountRaw, collateral.address, userAddress)),
    // Approve lending protocol
    createRouterInstruction(encodeApprove(0, normalizedProtocol)),
    // Deposit collateral
    createProtocolInstruction(
      normalizedProtocol,
      encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 0)
    ),
  ];
}

// ==================== Flash Loan Provider Helpers ====================

// Re-export FlashLoanProviderOption from utils for convenience
export type { FlashLoanProviderOption } from "~~/utils/flashLoan";

/**
 * Get default flash loan providers for a chain.
 * Note: Import FlashLoanProviderOption from ~~/utils/flashLoan if needed
 */
export function getDefaultFlashLoanProviders(
  chainId: number,
  isAaveV3Supported: (chainId: number) => boolean,
  isBalancerV2Supported: (chainId: number) => boolean
) {
  if (isAaveV3Supported(chainId) && !isBalancerV2Supported(chainId)) {
    return [{
      name: "Aave",
      icon: "/logos/aave.svg",
      version: "aave" as const,
      providerEnum: FlashLoanProvider.Aave,
      feeBps: 5
    }];
  }
  return [{
    name: "Balancer V2",
    icon: "/logos/balancer.svg",
    version: "v2" as const,
    providerEnum: FlashLoanProvider.BalancerV2,
    feeBps: 0
  }];
}

// ==================== Wallet Balance Helpers ====================

/**
 * Add wallet balances to assets and sort by balance descending.
 */
export function addWalletBalancesAndSort<T extends { address: Address; decimals: number }>(
  assets: T[],
  walletBalances: Record<string, { balance: bigint }>
): (T & { walletBalance: bigint })[] {
  const withBalance = assets.map(asset => ({
    ...asset,
    walletBalance: walletBalances[asset.address.toLowerCase()]?.balance ?? 0n,
  }));

  return withBalance.sort((a, b) => {
    if (a.walletBalance > b.walletBalance) return -1;
    if (a.walletBalance < b.walletBalance) return 1;
    return 0;
  });
}

// ==================== Leverage Calculation Helpers ====================

/**
 * Protocol default LTV values (in basis points).
 */
const PROTOCOL_DEFAULT_LTV: Record<string, number> = {
  aave: 8000,
  compound: 7500,
  venus: 7500,
  euler: 8500,
  default: 7500,
};

/**
 * Get default LTV for a protocol.
 */
export function getProtocolDefaultLtv(protocolName: string): bigint {
  const key = protocolName.toLowerCase();
  for (const [protocol, ltv] of Object.entries(PROTOCOL_DEFAULT_LTV)) {
    if (key.includes(protocol)) return BigInt(ltv);
  }
  return BigInt(PROTOCOL_DEFAULT_LTV.default);
}

/**
 * Calculate max leverage from LTV.
 */
export function calculateMaxLeverageFromLtv(ltvBps: bigint, protocolName: string): number {
  const minReasonableLtv = 5000n;
  const effectiveLtvBps = ltvBps >= minReasonableLtv ? ltvBps : getProtocolDefaultLtv(protocolName);
  const effectiveLtv = Number(effectiveLtvBps) / 10000;
  if (effectiveLtv <= 0) return 1;
  if (effectiveLtv >= 0.99) return 100;
  return Math.round((1 / (1 - effectiveLtv)) * 100) / 100;
}

/**
 * Adjust max leverage for slippage.
 */
export function adjustMaxLeverageForSlippage(baseLeverage: number, slippagePercent: number): number {
  const slippageDecimal = slippagePercent / 100;
  const targetLtv = (baseLeverage - 1) / baseLeverage;

  if (targetLtv >= 0.99 || slippageDecimal >= 1) return baseLeverage;

  const adjustedLeverage = (1 + targetLtv * slippageDecimal) / (1 - targetLtv * (1 - slippageDecimal));
  return Math.round(Math.min(adjustedLeverage, baseLeverage) * 100) / 100;
}

/**
 * Calculate flash loan amount based on leverage.
 */
export function calculateFlashLoanAmount(
  marginCollateral: bigint,
  leverage: number,
  collateralPrice: bigint,
  debtPrice: bigint,
  collateralDecimals: number,
  debtDecimals: number
): bigint {
  if (leverage <= 1 || marginCollateral === 0n || collateralPrice === 0n || debtPrice === 0n) return 0n;
  const marginUsd = (marginCollateral * collateralPrice) / BigInt(10 ** collateralDecimals);
  const leverageMultiplier = Math.round((leverage - 1) * 10000);
  const additionalExposureUsd = (marginUsd * BigInt(leverageMultiplier)) / 10000n;
  return (additionalExposureUsd * BigInt(10 ** debtDecimals)) / debtPrice;
}

// ==================== Pre-Order Instructions Building ====================

export interface PreOrderInstructionsParams {
  isFlashLoanMode: boolean;
  marginAmountRaw: bigint;
  collateral: SwapAsset;
  debt: SwapAsset;
  userAddress: Address;
  flashLoanAmountRaw: bigint;
  flashLoanFee: bigint;
  numChunks: number;
  protocolName: string;
  morphoContext?: MorphoMarketContextForEncoding;
  market?: Address;
  buildInitialDepositFlow: ProtocolInstruction[];
  seedBorrowInstruction?: ProtocolInstruction;
}

/**
 * Build pre-order instructions for authorization.
 * These are instructions that need user authorization (ERC20 approve, credit delegation)
 */
export function buildPreOrderInstructions(params: PreOrderInstructionsParams): ProtocolInstruction[] {
  const {
    isFlashLoanMode,
    marginAmountRaw,
    collateral,
    debt,
    userAddress,
    flashLoanAmountRaw,
    flashLoanFee,
    numChunks,
    protocolName,
    morphoContext,
    market,
    buildInitialDepositFlow,
    seedBorrowInstruction,
  } = params;

  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const isCompound = normalizedProtocol === "compound";
  const context = isMorpho && morphoContext
    ? encodeMorphoContext(morphoContext)
    : (isCompound && market ? market : "0x");

  const preOrderInstructions: ProtocolInstruction[] = [];

  if (isFlashLoanMode) {
    // Flash loan mode: collateral is pulled in post-hook, so we need approval for that
    if (marginAmountRaw > 0n && collateral) {
      const pullForAuth = createRouterInstruction(
        encodePullToken(marginAmountRaw, collateral.address, userAddress)
      );
      preOrderInstructions.push(pullForAuth);
    }

    // Credit delegation for flash loan repayment borrow
    const totalFlashLoanFee = flashLoanFee * BigInt(numChunks);
    const flashLoanRepayAmount = flashLoanAmountRaw + totalFlashLoanFee;
    const borrowForAuth = createProtocolInstruction(
      normalizedProtocol,
      encodeLendingInstruction(
        LendingOp.Borrow,
        debt.address,
        userAddress,
        flashLoanRepayAmount,
        context,
        999
      )
    );
    preOrderInstructions.push(borrowForAuth);
  } else {
    // Multi-chunk mode: initial deposit before order creation
    if (marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
      preOrderInstructions.push(buildInitialDepositFlow[0]);
    }

    // Seed borrow (covers post-hook borrows too)
    if (seedBorrowInstruction) {
      preOrderInstructions.push(seedBorrowInstruction);
    }
  }

  return preOrderInstructions;
}

/**
 * Create a seed borrow instruction for multi-chunk mode.
 */
export function createSeedBorrowInstruction(
  protocolName: string,
  debtAddress: Address,
  userAddress: Address,
  seedAmount: bigint,
  morphoContext?: MorphoMarketContextForEncoding,
  market?: Address
): ProtocolInstruction {
  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const isCompound = normalizedProtocol === "compound";
  const context = isMorpho && morphoContext
    ? encodeMorphoContext(morphoContext)
    : (isCompound && market ? market : "0x");

  return createProtocolInstruction(
    normalizedProtocol,
    encodeLendingInstruction(
      LendingOp.Borrow,
      debtAddress,
      userAddress,
      seedAmount,
      context,
      999 // No UTXO reference - fixed amount
    )
  );
}

// ==================== Limit Order Helpers ====================

/**
 * Calculate min buy per chunk from total min collateral and chunk count.
 */
export function calculateMinBuyPerChunk(
  minCollateralRaw: bigint,
  numChunks: number,
  collateralDecimals: number
): { raw: bigint; formatted: string } {
  if (minCollateralRaw <= 0n || numChunks <= 0) {
    return { raw: 0n, formatted: "0" };
  }
  const raw = minCollateralRaw / BigInt(numChunks);
  return { raw, formatted: formatUnits(raw, collateralDecimals) };
}

/**
 * Handle limit order build result errors.
 * Returns true if there was an error, false otherwise.
 */
export function handleLimitOrderBuildError(
  result: { success: boolean; error?: string; errorDetails?: { apiResponse?: string } } | null | undefined
): string | null {
  if (!result) {
    return "Failed to build CoW order calls";
  }
  if (!result.success) {
    return result.error || "Unknown error building order";
  }
  return null;
}

/**
 * Prepare flash loan config for limit order.
 */
export function prepareLimitOrderFlashLoanConfig(
  isFlashLoanMode: boolean,
  flashLoanLender: string | undefined,
  debtAddress: Address,
  chunkSize: bigint
): { lender: Address; token: Address; amount: bigint } | undefined {
  if (!isFlashLoanMode || !flashLoanLender) return undefined;
  return {
    lender: flashLoanLender as Address,
    token: debtAddress,
    amount: chunkSize,
  };
}

// ==================== Metrics Display Formatting Helpers ====================

/**
 * Format LTV display value
 */
export function formatLtvDisplay(ltv: number): string {
  return ltv > 0 ? `${ltv.toFixed(1)}%` : "-";
}

/**
 * Format price display value
 */
export function formatPriceDisplay(price: number): string {
  return price > 0 ? `$${price.toFixed(2)}` : "-";
}

/**
 * Get CSS class for APY-based coloring
 */
export function getApyColorClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "text-success";
  if (value < 0) return "text-error";
  return "";
}

/**
 * Format APY display value with sign
 */
export function formatApyDisplay(apy: number | null): string {
  if (apy === null) return "-";
  const sign = apy > 0 ? "+" : "";
  return `${sign}${apy.toFixed(2)}%`;
}

/**
 * Format 30-day yield display value
 */
export function formatYield30dDisplay(yield30d: number | null): string {
  if (yield30d === null) return "-";
  const sign = yield30d >= 0 ? "+" : "";
  return `${sign}$${Math.abs(yield30d).toFixed(2)}`;
}
