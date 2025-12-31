/**
 * Chunk Calculator for CoW Protocol Leverage Loops
 * 
 * CONSTRAINT: The CoW contract uses EQUAL chunk sizes (sells min(remaining, chunkSize)).
 * Post-hook borrows must match sell amounts to ensure OrderManager has enough tokens.
 * 
 * Challenge: With equal chunks and each chunk reducing capacity by chunk*(1-r),
 * high leverage requires many chunks. The limiting factor is:
 * - Initial capacity = C0 * LTV
 * - After n chunks: capacity = C0*LTV - n*chunk*(1-r)
 * - For capacity >= chunk: C0*LTV >= chunk*(1 + n*(1-r))
 * - Max chunks: n_max = (C0*LTV/chunk - 1) / (1-r)
 * 
 * For target debt D with n equal chunks of size D/n:
 * - Need: C0*LTV >= (D/n)*(1 + (n-1)*(1-r))
 * - Solving for n gives minimum chunks needed.
 */

export interface ChunkCalculationInput {
  /** Initial collateral deposit in native units */
  initialCollateralAmount: bigint;
  /** Price of collateral token (8 decimals) */
  collateralPrice: bigint;
  /** Decimals of collateral token */
  collateralDecimals: number;
  /** Price of debt token (8 decimals) */
  debtPrice: bigint;
  /** Decimals of debt token */
  debtDecimals: number;
  /** Total debt amount to borrow */
  totalDebtAmount: bigint;
  /** LTV in basis points (e.g., 8000 = 80%) */
  ltvBps: number;
  /** Expected swap rate: collateral per debt token (scaled by 1e18) */
  swapRate: bigint;
  /** Safety buffer (0.95 = use 95% of capacity) */
  safetyBuffer?: number;
}

export interface ChunkCalculationResult {
  /** Number of chunks needed */
  numChunks: number;
  /** Size of each chunk in debt token units */
  chunkSize: bigint;
  /** All chunk sizes (equal for CoW compatibility) */
  chunkSizes: bigint[];
  /** Whether multi-chunk needed */
  needsChunking: boolean;
  /** Initial borrow capacity (USD, 8 decimals) */
  initialBorrowCapacityUsd: bigint;
  /** Capacity restoration ratio r = LTV * swapEfficiency */
  geometricRatio: number;
  /** Explanation for UI */
  explanation: string;
}

export function calculateChunkParams(input: ChunkCalculationInput): ChunkCalculationResult {
  const {
    initialCollateralAmount,
    collateralPrice,
    collateralDecimals,
    debtPrice,
    debtDecimals,
    totalDebtAmount,
    ltvBps,
    swapRate,
    safetyBuffer = 0.95,
  } = input;

  // Edge cases
  if (totalDebtAmount === 0n) {
    return makeResult(0, 0n, [], false, 0n, 0, "No debt to borrow");
  }

  if (initialCollateralAmount === 0n) {
    return makeResult(1, totalDebtAmount, [totalDebtAmount], false, 0n, 0, "No initial collateral");
  }

  // Calculate USD values (8 decimals)
  const C0_usd = (initialCollateralAmount * collateralPrice) / BigInt(10 ** collateralDecimals);
  const D_usd = (totalDebtAmount * debtPrice) / BigInt(10 ** debtDecimals);
  
  // Sanitize LTV
  let effectiveLtvBps = ltvBps;
  if (ltvBps < 1000 || ltvBps > 9900) {
    console.warn(`[chunkCalculator] Invalid ltvBps ${ltvBps}, using 7500`);
    effectiveLtvBps = 7500;
  }
  
  const ltv = effectiveLtvBps / 10000;
  const safeLtv = ltv * safetyBuffer;
  
  // Swap efficiency from quote
  let swapEff = 0.997;
  if (swapRate > 0n && debtPrice > 0n) {
    swapEff = Number(swapRate) * Number(collateralPrice) / (1e18 * Number(debtPrice));
    swapEff = Math.min(Math.max(swapEff, 0.90), 1.05);
  }

  const r = safeLtv * swapEff;
  const C0 = Number(C0_usd) / 1e8;
  const D = Number(D_usd) / 1e8;
  const capacity0 = C0 * safeLtv;
  const initialCapacityUsd = BigInt(Math.round(capacity0 * 1e8));

  console.log(`[chunkCalculator] C0=$${C0.toFixed(2)}, D=$${D.toFixed(2)}, capacity=$${capacity0.toFixed(2)}, r=${r.toFixed(4)}`);

  // Single chunk if debt fits in initial capacity
  if (D <= capacity0) {
    return makeResult(1, totalDebtAmount, [totalDebtAmount], false, initialCapacityUsd, r,
      `Single chunk: $${D.toFixed(2)} <= capacity $${capacity0.toFixed(2)}`);
  }

  // Calculate minimum chunks needed for equal-sized chunks
  // Constraint: capacity after chunk i >= chunkSize for all i
  // capacity_i = capacity0 - i * chunk * (1 - r)
  // Need: capacity0 - (n-1) * (D/n) * (1 - r) >= D/n
  // capacity0 >= D/n * (1 + (n-1)*(1-r))
  // capacity0 >= D/n * (1 + (n-1) - (n-1)*r)
  // capacity0 >= D/n * (n - (n-1)*r)
  // capacity0 * n >= D * (n - (n-1)*r)
  // capacity0 * n >= D*n - D*(n-1)*r
  // n * (capacity0 - D + D*r) >= D*r - D*r  ... this is getting complex
  //
  // Simpler: iterative approach
  let n = 1;
  const maxChunks = 100;
  
  while (n < maxChunks) {
    const chunk = D / n;
    // Capacity after last chunk (n-1 chunks already done)
    const capacityAtEnd = capacity0 - (n - 1) * chunk * (1 - r);
    
    if (capacityAtEnd >= chunk * 0.99) {
      // This n works
      break;
    }
    n++;
  }

  if (n >= maxChunks) {
    // Can't achieve with reasonable chunks
    // Calculate theoretical max leverage
    const maxD = capacity0 / (1 - r) * 0.95; // Leave some buffer
    const maxLev = 1 + maxD / C0;
    console.warn(`[chunkCalculator] Needs ${n}+ chunks, exceeds practical limit. Max leverage ~${maxLev.toFixed(1)}x`);
    return makeResult(0, 0n, [], true, initialCapacityUsd, r,
      `Too many chunks needed (>${maxChunks}). Try lower leverage or use Market order.`);
  }

  // Calculate chunk size
  const chunkSize = totalDebtAmount / BigInt(n);
  const chunkSizes = Array(n).fill(chunkSize) as bigint[];
  
  // Handle remainder
  const remainder = totalDebtAmount - chunkSize * BigInt(n);
  if (remainder > 0n && chunkSizes.length > 0) {
    chunkSizes[chunkSizes.length - 1] = chunkSize + remainder;
  }

  const chunkUsd = Number(chunkSize * debtPrice / BigInt(10 ** debtDecimals)) / 1e8;
  
  console.log(`[chunkCalculator] Result: ${n} chunks of ~$${chunkUsd.toFixed(2)}`);

  return makeResult(n, chunkSize, chunkSizes, n > 1, initialCapacityUsd, r,
    `${n} chunks of ~$${chunkUsd.toFixed(2)} each`);
}

function makeResult(
  numChunks: number,
  chunkSize: bigint,
  chunkSizes: bigint[],
  needsChunking: boolean,
  initialBorrowCapacityUsd: bigint,
  geometricRatio: number,
  explanation: string
): ChunkCalculationResult {
  return {
    numChunks,
    chunkSize,
    chunkSizes,
    needsChunking,
    initialBorrowCapacityUsd,
    geometricRatio,
    explanation,
  };
}

/**
 * Calculate swap rate from quote data
 */
export function calculateSwapRate(
  sellAmount: bigint,
  sellDecimals: number,
  buyAmount: bigint,
  buyDecimals: number,
): bigint {
  if (sellAmount === 0n) return 0n;
  const normalizedBuy = buyAmount * BigInt(10 ** (18 + sellDecimals));
  const normalizedSell = sellAmount * BigInt(10 ** buyDecimals);
  return normalizedBuy / normalizedSell;
}
