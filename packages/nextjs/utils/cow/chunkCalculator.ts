/**
 * Calculate optimal chunk size for limit order loops
 * 
 * The challenge: When leveraging up, each chunk:
 * 1. Borrows debt tokens (limited by current borrow capacity)
 * 2. Swaps debt → collateral
 * 3. Deposits collateral (increases borrow capacity for next chunk)
 * 
 * We need to calculate how much we can safely borrow per chunk based on
 * the collateral value that will be deposited.
 */

export interface ChunkCalculationInput {
  /** Initial collateral deposit in native units */
  initialCollateralAmount: bigint;
  /** Price of collateral token (8 decimals, like Aave oracle) */
  collateralPrice: bigint;
  /** Decimals of collateral token */
  collateralDecimals: number;
  /** Price of debt token (8 decimals) */
  debtPrice: bigint;
  /** Decimals of debt token */
  debtDecimals: number;
  /** Total debt amount to borrow across all chunks */
  totalDebtAmount: bigint;
  /** LTV in basis points (e.g., 8000 = 80%) */
  ltvBps: number;
  /** Expected swap rate: how much collateral per debt token (scaled by 1e18) */
  swapRate: bigint;
  /** Safety buffer (0.90 = 90% of max) */
  safetyBuffer?: number;
}

export interface ChunkCalculationResult {
  /** Number of chunks needed */
  numChunks: number;
  /** Size of each chunk in debt token units */
  chunkSize: bigint;
  /** Whether chunking is needed (false if single chunk works) */
  needsChunking: boolean;
  /** Max borrow capacity after initial deposit (in USD, 8 decimals) */
  initialBorrowCapacityUsd: bigint;
  /** Explanation for UI display */
  explanation: string;
}

/**
 * Calculate the optimal chunk configuration for a leverage-up loop
 * 
 * The math:
 * - After depositing C collateral worth $V at LTV%, borrow capacity = V * LTV
 * - Each chunk borrows D debt, swaps to C' collateral, deposits C'
 * - New capacity = (V + C'_value) * LTV - D_value
 * 
 * For safety, we use a conservative approach:
 * - Max borrow per chunk = initial_collateral_value * LTV * safety_buffer
 * - This is conservative but ensures we never exceed limits
 */
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
    safetyBuffer = 0.90,
  } = input;

  // Edge cases
  if (totalDebtAmount === 0n) {
    return {
      numChunks: 0,
      chunkSize: 0n,
      needsChunking: false,
      initialBorrowCapacityUsd: 0n,
      explanation: "No debt to borrow",
    };
  }

  if (initialCollateralAmount === 0n) {
    return {
      numChunks: 1,
      chunkSize: totalDebtAmount,
      needsChunking: false,
      initialBorrowCapacityUsd: 0n,
      explanation: "No initial collateral - single chunk (may fail if no existing position)",
    };
  }

  // Calculate initial collateral value in USD (8 decimals)
  // collateralValueUsd = (amount * price) / 10^decimals
  const initialCollateralUsd = (initialCollateralAmount * collateralPrice) / BigInt(10 ** collateralDecimals);
  
  // Calculate initial borrow capacity in USD
  // borrowCapacityUsd = collateralValueUsd * LTV%
  const initialBorrowCapacityUsd = (initialCollateralUsd * BigInt(ltvBps)) / 10000n;

  // Calculate total debt value in USD
  const totalDebtUsd = (totalDebtAmount * debtPrice) / BigInt(10 ** debtDecimals);

  // If total debt fits within initial capacity (with safety buffer), single chunk
  const safeCapacityUsd = (initialBorrowCapacityUsd * BigInt(Math.round(safetyBuffer * 10000))) / 10000n;
  
  if (totalDebtUsd <= safeCapacityUsd) {
    return {
      numChunks: 1,
      chunkSize: totalDebtAmount,
      needsChunking: false,
      initialBorrowCapacityUsd,
      explanation: `Total borrow ($${formatUsd(totalDebtUsd)}) fits within initial capacity ($${formatUsd(safeCapacityUsd)})`,
    };
  }

  // Need chunking - calculate how many chunks
  // Each chunk should borrow roughly (safeCapacityUsd / debtPrice) in debt tokens
  // But after each chunk, capacity increases by the deposited collateral value * LTV
  
  // Conservative approach: assume each chunk can only borrow based on CURRENT capacity
  // This is pessimistic but safe - actual execution may complete in fewer chunks
  // because collateral deposited increases capacity for subsequent chunks
  
  // Max debt per chunk = safeCapacityUsd / debtPrice * 10^debtDecimals
  const maxDebtPerChunk = (safeCapacityUsd * BigInt(10 ** debtDecimals)) / debtPrice;
  
  // Number of chunks needed
  const numChunksRaw = Number(totalDebtAmount) / Number(maxDebtPerChunk);
  const numChunks = Math.ceil(numChunksRaw);
  
  // Spread evenly across chunks for smoother execution
  const chunkSize = totalDebtAmount / BigInt(numChunks);
  
  // Calculate expected collateral gained per chunk (for explanation)
  // collateralPerChunk = chunkSize * swapRate / 1e18
  const expectedCollateralPerChunk = (chunkSize * swapRate) / BigInt(1e18);
  const expectedCollateralValueUsd = (expectedCollateralPerChunk * collateralPrice) / BigInt(10 ** collateralDecimals);
  const expectedCapacityGainUsd = (expectedCollateralValueUsd * BigInt(ltvBps)) / 10000n;

  return {
    numChunks,
    chunkSize,
    needsChunking: true,
    initialBorrowCapacityUsd,
    explanation: `Splitting into ${numChunks} chunks. Each chunk borrows ~$${formatUsd((chunkSize * debtPrice) / BigInt(10 ** debtDecimals))} and adds ~$${formatUsd(expectedCapacityGainUsd)} capacity.`,
  };
}

/**
 * Format USD value (8 decimals) for display
 */
function formatUsd(value: bigint): string {
  const num = Number(value) / 1e8;
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(2);
}

/**
 * Calculate swap rate from quote data
 * Returns collateral per debt token scaled by 1e18
 */
export function calculateSwapRate(
  sellAmount: bigint,
  sellDecimals: number,
  buyAmount: bigint,
  buyDecimals: number,
): bigint {
  if (sellAmount === 0n) return 0n;
  
  // Normalize to 18 decimals for precision
  // rate = (buyAmount * 1e18 * 10^sellDecimals) / (sellAmount * 10^buyDecimals)
  const normalizedBuy = buyAmount * BigInt(10 ** (18 + sellDecimals));
  const normalizedSell = sellAmount * BigInt(10 ** buyDecimals);
  
  return normalizedBuy / normalizedSell;
}
