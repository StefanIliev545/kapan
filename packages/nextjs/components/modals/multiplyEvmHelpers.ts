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
import { type FlashLoanProviderOption } from "~~/utils/flashLoan";

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
    totalCollateralTokens = Number(minCollateralFormatted);
  } else {
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

  const equity = metrics.totalCollateralUsd - metrics.debtUsd;
  if (equity <= 0) return { netApy: null, netYield30d: null };

  const earnedYield = (metrics.totalCollateralUsd * supplyApy) / 100;
  const paidInterest = (metrics.debtUsd * borrowApy) / 100;
  const netYieldUsd = earnedYield - paidInterest;

  const netApyValue = (netYieldUsd / equity) * 100;
  const netYield30dValue = netYieldUsd * (30 / 365);

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

  const isBalancer = selectedProviderName?.includes("Balancer");
  const flashLoanFeePercent = isBalancer ? 0 : 0.05;
  const flashLoanFeeUsd = flashLoanAmountUsd * (flashLoanFeePercent / 100);

  const priceImpact = swapRouter === "pendle" ? (pendlePriceImpact ?? 0) : 0;
  const priceImpactPercent = Math.abs(priceImpact * 100);
  const priceImpactUsd = flashLoanAmountUsd * Math.abs(priceImpact);

  const totalFeePercent = flashLoanFeePercent + priceImpactPercent;
  const totalFeeUsd = flashLoanFeeUsd + priceImpactUsd;

  const feeOfPositionPercent = totalCollateralUsd > 0 ? (totalFeeUsd / totalCollateralUsd) * 100 : 0;

  return {
    flashLoanFeePercent, flashLoanFeeUsd, priceImpactPercent, priceImpactUsd,
    totalFeePercent, totalFeeUsd, flashLoanAmountUsd, feeOfPositionPercent,
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

  if (executionType === "limit" && customMinPrice && customMinPrice !== "") {
    try {
      const customRaw = parseUnits(customMinPrice, collateral.decimals);
      return { raw: customRaw, formatted: customMinPrice };
    } catch {
      // Invalid input, fall through
    }
  }

  let quoted = 0n;
  if (executionType === "limit") {
    quoted = bestQuote?.amount ?? 0n;
  } else if ((swapRouter === "1inch" || swapRouter === "kyber") && oneInchQuote) {
    quoted = BigInt(oneInchQuote.dstAmount || "0");
  } else if (swapRouter === "pendle" && pendleQuote) {
    const outAmount = pendleQuote.data.amountPtOut || pendleQuote.data.amountTokenOut || "0";
    quoted = BigInt(outAmount);
  }

  if (quoted === 0n) return { raw: 0n, formatted: "0" };

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
      numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw],
      needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0,
      recommendFlashLoan: false, explanation: "",
    };
  }

  const flashLoanLender = limitOrderConfig?.flashLoanLender
    ?? getPreferredFlashLoanLender(chainId, limitOrderConfig?.selectedProvider?.provider)?.address;
  const providerType = limitOrderConfig?.selectedProvider?.provider ?? "morpho";

  if (!flashLoanLender) {
    console.warn("[Limit Order] Flash loans not available on this chain for CoW orders");
    return {
      numChunks: 1, chunkSize: flashLoanAmountRaw, chunkSizes: [flashLoanAmountRaw],
      needsChunking: false, initialBorrowCapacityUsd: 0n, geometricRatio: 0,
      recommendFlashLoan: false,
      explanation: "Flash loans not available for limit orders on this chain",
    };
  }

  const numChunks = flashLoanChunks;
  const baseChunkSize = flashLoanAmountRaw / BigInt(numChunks);
  const remainder = flashLoanAmountRaw % BigInt(numChunks);

  const chunkSizes = Array(numChunks).fill(baseChunkSize).map((size, i) =>
    i === numChunks - 1 ? size + remainder : size
  ) as bigint[];

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
    numChunks, chunkSize: baseChunkSize, chunkSizes,
    needsChunking: numChunks > 1, initialBorrowCapacityUsd: 0n, geometricRatio: 0,
    recommendFlashLoan: true, useFlashLoan: true,
    flashLoanFee: flashLoanFeePerChunk, flashLoanLender, selectedProviderType: providerType,
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

function buildDepositInstructions(
  normalizedProtocol: string,
  collateralAddress: Address,
  userAddress: Address,
  context: string
): ProtocolInstruction[] {
  const isCompound = normalizedProtocol === "compound";
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;

  return [
    createRouterInstruction(encodeApprove(1, normalizedProtocol)),
    createProtocolInstruction(
      normalizedProtocol,
      encodeLendingInstruction(depositOp, collateralAddress, userAddress, 0n, context, 1)
    ),
  ];
}

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
  const selectedProviderType = chunkParams.selectedProviderType ?? "morpho";

  const baseMarginPerChunk = marginAmountRaw / BigInt(numChunks);
  const marginRemainder = marginAmountRaw % BigInt(numChunks);

  const chunks: ChunkInstructions[] = [];

  for (let i = 0; i < numChunks; i++) {
    const isLastChunk = i === numChunks - 1;
    const marginThisChunk = isLastChunk ? baseMarginPerChunk + marginRemainder : baseMarginPerChunk;
    const chunkSize = chunkParams.chunkSizes[i];
    const feeThisChunk = calculateFlashLoanFee(chunkSize, selectedProviderType);
    const chunkRepayAmount = chunkSize + feeThisChunk;

    const postInstructions: ProtocolInstruction[] = [
      createRouterInstruction(encodePullToken(marginThisChunk, collateral.address, userAddress)),
      createRouterInstruction(encodeAdd(1, 2)),
      createRouterInstruction(encodeApprove(3, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 3)
      ),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, chunkRepayAmount, context, 999)
      ),
      createRouterInstruction(encodePushToken(5, params.orderManagerAddress)),
    ];

    chunks.push({
      preInstructions: [],
      postInstructions,
      flashLoanRepaymentUtxoIndex: 5,
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
    flow: "[0]=sellAmt, [1]=buyAmt, [2]=pull margin, [3]=add(1+2), [4]=approve, [5]=borrow -> push to OrderManager",
  });

  return chunks;
}

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
      chunks.push({
        preInstructions: [],
        postInstructions: [...depositInstructions],
      });
    } else {
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

export function buildCowChunkInstructions(params: CowInstructionsBuildParams): ChunkInstructions[] {
  const { collateral, debt, userAddress, flashLoanAmountRaw, orderManagerAddress, chunkParams } = params;

  if (!collateral || !debt || !userAddress || flashLoanAmountRaw === 0n || !orderManagerAddress) {
    return [{ preInstructions: [], postInstructions: [] }];
  }

  if (chunkParams.useFlashLoan && chunkParams.flashLoanLender) {
    return buildFlashLoanModeChunks(params);
  }

  return buildMultiChunkModeChunks(params);
}

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
    createRouterInstruction(encodePullToken(marginAmountRaw, collateral.address, userAddress)),
    createRouterInstruction(encodeApprove(0, normalizedProtocol)),
    createProtocolInstruction(
      normalizedProtocol,
      encodeLendingInstruction(depositOp, collateral.address, userAddress, 0n, context, 0)
    ),
  ];
}

// ==================== Flash Loan Provider Helpers ====================

export type { FlashLoanProviderOption } from "~~/utils/flashLoan";

export function getDefaultFlashLoanProviders(
  chainId: number,
  isAaveV3Supported: (chainId: number) => boolean,
  isBalancerV2Supported: (chainId: number) => boolean
): FlashLoanProviderOption[] {
  if (isAaveV3Supported(chainId) && !isBalancerV2Supported(chainId)) {
    return [{
      name: "Aave", icon: "/logos/aave.svg", version: "aave" as const,
      providerEnum: FlashLoanProvider.Aave, feeBps: 5,
    }];
  }
  return [{
    name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2" as const,
    providerEnum: FlashLoanProvider.BalancerV2, feeBps: 0,
  }];
}

// ==================== Wallet Balance Helpers ====================

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

const PROTOCOL_DEFAULT_LTV: Record<string, number> = {
  aave: 8000, compound: 7500, venus: 7500, euler: 8500, default: 7500,
};

export function getProtocolDefaultLtv(protocolName: string): bigint {
  const key = protocolName.toLowerCase();
  for (const [protocol, ltv] of Object.entries(PROTOCOL_DEFAULT_LTV)) {
    if (key.includes(protocol)) return BigInt(ltv);
  }
  return BigInt(PROTOCOL_DEFAULT_LTV.default);
}

export function calculateMaxLeverageFromLtv(ltvBps: bigint, protocolName: string): number {
  const minReasonableLtv = 5000n;
  const effectiveLtvBps = ltvBps >= minReasonableLtv ? ltvBps : getProtocolDefaultLtv(protocolName);
  const effectiveLtv = Number(effectiveLtvBps) / 10000;
  if (effectiveLtv <= 0) return 1;
  if (effectiveLtv >= 0.99) return 100;
  return Math.round((1 / (1 - effectiveLtv)) * 100) / 100;
}

export function adjustMaxLeverageForSlippage(baseLeverage: number, slippagePercent: number): number {
  const slippageDecimal = slippagePercent / 100;
  const targetLtv = (baseLeverage - 1) / baseLeverage;

  if (targetLtv >= 0.99 || slippageDecimal >= 1) return baseLeverage;

  const adjustedLeverage = (1 + targetLtv * slippageDecimal) / (1 - targetLtv * (1 - slippageDecimal));
  return Math.round(Math.min(adjustedLeverage, baseLeverage) * 100) / 100;
}

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

export function buildPreOrderInstructions(params: PreOrderInstructionsParams): ProtocolInstruction[] {
  const {
    isFlashLoanMode, marginAmountRaw, collateral, debt, userAddress,
    flashLoanAmountRaw, flashLoanFee, numChunks, protocolName,
    morphoContext, market, buildInitialDepositFlow, seedBorrowInstruction,
  } = params;

  const normalizedProtocol = normalizeProtocolName(protocolName);
  const isMorpho = normalizedProtocol === PROTOCOL_MORPHO;
  const isCompound = normalizedProtocol === "compound";
  const context = isMorpho && morphoContext
    ? encodeMorphoContext(morphoContext)
    : (isCompound && market ? market : "0x");

  const preOrderInstructions: ProtocolInstruction[] = [];

  if (isFlashLoanMode) {
    if (marginAmountRaw > 0n && collateral) {
      preOrderInstructions.push(
        createRouterInstruction(encodePullToken(marginAmountRaw, collateral.address, userAddress))
      );
    }
    const totalFlashLoanFee = flashLoanFee * BigInt(numChunks);
    const flashLoanRepayAmount = flashLoanAmountRaw + totalFlashLoanFee;
    preOrderInstructions.push(
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, debt.address, userAddress, flashLoanRepayAmount, context, 999)
      )
    );
  } else {
    if (marginAmountRaw > 0n && buildInitialDepositFlow.length > 0) {
      preOrderInstructions.push(buildInitialDepositFlow[0]);
    }
    if (seedBorrowInstruction) {
      preOrderInstructions.push(seedBorrowInstruction);
    }
  }

  return preOrderInstructions;
}

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
    encodeLendingInstruction(LendingOp.Borrow, debtAddress, userAddress, seedAmount, context, 999)
  );
}

// ==================== Limit Order Helpers ====================

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

export function handleLimitOrderBuildError(
  result: { success: boolean; error?: string; errorDetails?: { apiResponse?: string } } | null | undefined
): string | null {
  if (!result) return "Failed to build CoW order calls";
  if (!result.success) return result.error || "Unknown error building order";
  return null;
}

export function prepareLimitOrderFlashLoanConfig(
  isFlashLoanMode: boolean,
  flashLoanLender: string | undefined,
  debtAddress: Address,
  chunkSize: bigint
): { lender: Address; token: Address; amount: bigint } | undefined {
  if (!isFlashLoanMode || !flashLoanLender) return undefined;
  return { lender: flashLoanLender as Address, token: debtAddress, amount: chunkSize };
}

// ==================== Metrics Display Formatting Helpers ====================

export function formatLtvDisplay(ltv: number): string {
  return ltv > 0 ? `${ltv.toFixed(1)}%` : "-";
}

export function formatPriceDisplay(price: number): string {
  return price > 0 ? `$${price.toFixed(2)}` : "-";
}

export function getApyColorClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "text-success";
  if (value < 0) return "text-error";
  return "";
}

export function formatApyDisplay(apy: number | null): string {
  if (apy === null) return "-";
  const sign = apy > 0 ? "+" : "";
  return `${sign}${apy.toFixed(2)}%`;
}

export function formatYield30dDisplay(yield30d: number | null): string {
  if (yield30d === null) return "-";
  const sign = yield30d >= 0 ? "+" : "";
  return `${sign}$${Math.abs(yield30d).toFixed(2)}`;
}

// ==================== Swap Router Fallback Helper ====================

/**
 * Resolve the best available swap router when the current one is unavailable.
 * Returns the new router to use, or null if no change is needed.
 */
export function resolveSwapRouterFallback(
  currentRouter: string,
  availability: { kyber: boolean; oneInch: boolean; pendle: boolean },
): string | null {
  const { kyber, oneInch, pendle } = availability;
  if (currentRouter === "kyber" && !kyber) {
    return oneInch ? "1inch" : pendle ? "pendle" : null;
  }
  if (currentRouter === "1inch" && !oneInch) {
    return kyber ? "kyber" : pendle ? "pendle" : null;
  }
  if (currentRouter === "pendle" && !pendle) {
    return kyber ? "kyber" : oneInch ? "1inch" : null;
  }
  return null;
}

// ==================== Limit Order Rate Calculation Helper ====================

/**
 * Calculate the effective rate for limit order min collateral output.
 * Handles custom price input, price inversion, and fallback to market rate.
 */
export function calculateLimitOrderRate(
  customMinPrice: string,
  priceInputInverted: boolean,
  collateralDecimals: number,
  debtDecimals: number,
  marketRateRaw: bigint | undefined,
): bigint {
  if (!customMinPrice || customMinPrice === "") {
    return marketRateRaw ?? 0n;
  }
  try {
    if (priceInputInverted) {
      const inputRate = parseUnits(customMinPrice, debtDecimals);
      if (inputRate === 0n) {
        return marketRateRaw ?? 0n;
      }
      // Invert: collPerDebt = 10^collDecimals * 10^debtDecimals / inputRate
      return (BigInt(10 ** collateralDecimals) * BigInt(10 ** debtDecimals)) / inputRate;
    }
    // Normal mode: "1 DEBT = X COLL"
    return parseUnits(customMinPrice, collateralDecimals);
  } catch {
    return marketRateRaw ?? 0n;
  }
}

/**
 * Apply slippage to a rate and calculate total min collateral output.
 */
export function applySlippageToRate(
  rateToUse: bigint,
  swapQuoteAmount: bigint,
  limitSlippage: number,
  collateralDecimals: number,
  debtDecimals: number,
): MinCollateralResult {
  if (rateToUse === 0n || swapQuoteAmount === 0n) {
    return { raw: 0n, formatted: "0" };
  }
  const slippageBps = BigInt(Math.round(limitSlippage * 100));
  const rateWithSlippage = (rateToUse * (10000n - slippageBps)) / 10000n;
  const totalRaw = (rateWithSlippage * swapQuoteAmount) / BigInt(10 ** debtDecimals);
  return { raw: totalRaw, formatted: formatUnits(totalRaw, collateralDecimals) };
}

// ==================== Protocol Name Normalization for CoW ====================

const COW_PROTOCOL_NAMES = ["aave", "compound", "venus", "morpho"] as const;

/**
 * Normalize protocol name for CoW conditional order trigger.
 */
export function normalizeProtocolForCow(protocolName: string): string {
  const lower = protocolName.toLowerCase();
  for (const protocol of COW_PROTOCOL_NAMES) {
    if (lower.includes(protocol)) return protocol;
  }
  return "aave";
}

// ==================== Limit Order Chunk Params Helper ====================

/**
 * Default chunk params result when chunking is not applicable.
 */
export function createDefaultChunkParams(flashLoanAmountRaw: bigint, explanation = ""): ChunkParamsResult {
  return {
    numChunks: 1,
    chunkSize: flashLoanAmountRaw,
    chunkSizes: [flashLoanAmountRaw],
    needsChunking: false,
    initialBorrowCapacityUsd: 0n,
    geometricRatio: 0,
    recommendFlashLoan: false,
    explanation,
  };
}

/**
 * Resolve effective LTV basis points from collateral config, eMode, or default.
 */
export function resolveEffectiveLtvBps(
  collateralConfig: { ltv?: string | number } | null | undefined,
  isEModeActive: boolean,
  eMode: { ltv: number } | null | undefined,
  maxLtvBps: bigint,
): number {
  if (collateralConfig?.ltv) return Number(collateralConfig.ltv);
  if (isEModeActive && eMode) return eMode.ltv;
  return Number(maxLtvBps);
}

// ==================== Limit Order Validation Helper ====================

/**
 * Validate all prerequisites for submitting a limit order.
 * Throws an error with a descriptive message if validation fails.
 */
export function validateLimitOrderPrerequisites(params: {
  collateral: SwapAsset | undefined;
  debt: SwapAsset | undefined;
  userAddress: Address | undefined;
  conditionalOrderManagerAddress: Address | undefined;
  walletClient: unknown;
  publicClient: unknown;
  limitPriceTriggerAddress: Address | undefined;
  conditionalOrderTriggerParams: unknown;
  flashLoanAmountRaw: bigint;
  minCollateralOutRaw: bigint;
}): void {
  const {
    collateral, debt, userAddress, conditionalOrderManagerAddress,
    walletClient, publicClient,
    limitPriceTriggerAddress, conditionalOrderTriggerParams,
    flashLoanAmountRaw, minCollateralOutRaw,
  } = params;

  if (!collateral || !debt || !userAddress || !conditionalOrderManagerAddress || !walletClient || !publicClient) {
    throw new Error("Missing required data for conditional order");
  }

  if (!limitPriceTriggerAddress || !conditionalOrderTriggerParams) {
    console.error("[Conditional Order] Missing config:", {
      limitPriceTriggerAddress,
      conditionalOrderTriggerParams: !!conditionalOrderTriggerParams,
      flashLoanAmountRaw: flashLoanAmountRaw.toString(),
      minCollateralOut: minCollateralOutRaw.toString(),
    });
    const reason = !limitPriceTriggerAddress ? "trigger not deployed" : "params not ready (check amounts)";
    throw new Error("Missing trigger configuration: " + reason);
  }
}

// ==================== Active Adapter Resolution ====================

/**
 * Resolve the active swap adapter based on the current swap router selection.
 * Flattens a nested ternary into a clear lookup.
 */
export function resolveActiveAdapter<T>(
  swapRouter: string,
  adapters: { kyber: T; oneInch: T; pendle: T },
): T {
  if (swapRouter === "kyber") return adapters.kyber;
  if (swapRouter === "pendle") return adapters.pendle;
  return adapters.oneInch;
}

// ==================== Swap Data Resolution for Build Flow ====================

interface SwapDataResult {
  swapData: string;
  minOut: string;
}

interface QuoteRefs {
  oneInchQuote: { dstAmount?: string; tx: { data: string; to?: string; from?: string } } | null | undefined;
  pendleQuote: { data: { minPtOut?: string; minTokenOut?: string }; transaction: { data: string } } | null | undefined;
  activeAdapter: { address: string } | null | undefined;
  pendleAdapter: { address: string } | null | undefined;
}

/**
 * Resolve swap data and minOut from the current quotes based on the active swap router.
 * Returns null if the required quote data is not available.
 */
export function resolveSwapDataForFlow(
  swapRouter: string,
  refs: QuoteRefs,
  minCollateralOutFormatted: string,
): SwapDataResult | null {
  if (swapRouter === "1inch" || swapRouter === "kyber") {
    if (!refs.oneInchQuote || !refs.activeAdapter) {
      console.warn("[buildFlow] Swap not ready:", { oneInchQuote: !!refs.oneInchQuote, activeAdapter: !!refs.activeAdapter, swapRouter });
      return null;
    }
    const swapData = refs.oneInchQuote.tx.data;
    console.log("[buildFlow] Kyber/1inch swap params:", {
      swapRouter,
      adapterAddress: refs.activeAdapter.address,
      swapDataLength: swapData?.length || 0,
      swapDataPrefix: swapData?.slice(0, 20) || "empty",
      minOut: minCollateralOutFormatted,
      dstAmount: refs.oneInchQuote.dstAmount,
      txTo: refs.oneInchQuote.tx?.to,
      txFrom: refs.oneInchQuote.tx?.from,
    });
    return { swapData, minOut: minCollateralOutFormatted };
  }
  // Pendle router
  if (!refs.pendleQuote || !refs.pendleAdapter) {
    console.warn("[buildFlow] Pendle not ready:", { pendleQuote: !!refs.pendleQuote, pendleAdapter: !!refs.pendleAdapter });
    return null;
  }
  return {
    swapData: refs.pendleQuote.transaction.data,
    minOut: refs.pendleQuote.data.minPtOut || refs.pendleQuote.data.minTokenOut || minCollateralOutFormatted,
  };
}

// ==================== Swap Router Mapping ====================

/**
 * Map the UI swap router name to the flow parameter format.
 */
export function mapSwapRouterToFlowParam(swapRouter: string): "oneinch" | "kyber" | "pendle" {
  if (swapRouter === "1inch") return "oneinch";
  if (swapRouter === "kyber") return "kyber";
  return "pendle";
}

// ==================== Max Leverage Computation ====================

/**
 * Compute the effective max leverage from predictive data or LTV-based fallback,
 * then adjust for slippage.
 */
export function computeMaxLeverage(
  predictiveMaxLeverage: number,
  collateralConfig: unknown,
  isEModeActive: boolean,
  maxLtvBps: bigint,
  protocolName: string,
  slippage: number,
  calculateMaxLeverageFromLtvFn: (maxLtvBps: bigint, protocolName: string) => number,
  adjustMaxLeverageForSlippageFn: (baseLeverage: number, slippage: number) => number,
): number {
  let baseLeverage: number;
  if (predictiveMaxLeverage > 1 && (collateralConfig || isEModeActive)) {
    baseLeverage = predictiveMaxLeverage;
  } else {
    baseLeverage = calculateMaxLeverageFromLtvFn(maxLtvBps, protocolName);
  }
  return adjustMaxLeverageForSlippageFn(baseLeverage, slippage);
}

// ==================== Provider Options Resolution ====================

/**
 * Resolve flash loan provider options from available sources.
 */
export function resolveProviderOptions(
  flashLoanProviders: FlashLoanProviderOption[] | undefined,
  defaultFlashLoanProvider: FlashLoanProviderOption | undefined,
  chainId: number,
  isAaveV3SupportedFn: (chainId: number) => boolean,
  isBalancerV2SupportedFn: (chainId: number) => boolean,
  getDefaultFlashLoanProvidersFn: (
    chainId: number,
    isAaveV3Supported: (chainId: number) => boolean,
    isBalancerV2Supported: (chainId: number) => boolean,
  ) => FlashLoanProviderOption[],
): FlashLoanProviderOption[] {
  if (flashLoanProviders?.length) return flashLoanProviders;
  if (defaultFlashLoanProvider) return [defaultFlashLoanProvider];
  return getDefaultFlashLoanProvidersFn(chainId, isAaveV3SupportedFn, isBalancerV2SupportedFn);
}

// ==================== Submit State Flags ====================

/**
 * Compute derived submit-related flags (hasQuote, hasAdapter, canSubmit, etc.)
 * to flatten nested ternary expressions in the component body.
 */
export function computeSubmitFlags(params: {
  swapRouter: string;
  pendleQuote: unknown;
  oneInchQuote: unknown;
  kyberAdapter: unknown;
  oneInchAdapter: unknown;
  pendleAdapter: unknown;
  executionType: "market" | "limit";
  collateral: unknown;
  debt: unknown;
  marginAmountRaw: bigint;
  leverage: number;
  isSwapQuoteLoading: boolean;
  conditionalOrderReady: boolean;
  conditionalOrderTriggerParams: unknown;
}): { hasQuote: boolean; hasAdapter: boolean; canSubmit: boolean } {
  const hasQuote = params.swapRouter === "pendle" ? !!params.pendleQuote : !!params.oneInchQuote;
  const hasAdapter = params.swapRouter === "kyber"
    ? !!params.kyberAdapter
    : params.swapRouter === "1inch"
      ? !!params.oneInchAdapter
      : !!params.pendleAdapter;

  const baseValid = !!params.collateral && !!params.debt && params.marginAmountRaw > 0n && params.leverage > 1;

  const canSubmitMarket = baseValid && hasQuote && hasAdapter && !params.isSwapQuoteLoading;
  const canSubmitLimit = baseValid && params.conditionalOrderReady && !!params.conditionalOrderTriggerParams;
  const canSubmit = params.executionType === "limit" ? canSubmitLimit : canSubmitMarket;

  return { hasQuote, hasAdapter, canSubmit };
}
