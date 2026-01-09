/**
 * Leverage/Multiply Math Utilities
 * 
 * This module provides calculations for leverage loops, where:
 * - User deposits collateral C₀
 * - Borrows debt, swaps to more collateral
 * - Repeats to achieve target leverage
 * 
 * Key formulas:
 * - Max leverage = 1 / (1 - LTV × swapEfficiency)
 * - Final collateral = initial × leverage
 * - Total debt = initial × (leverage - 1) in collateral value terms
 */

/**
 * Calculate maximum achievable leverage given LTV and swap efficiency
 * 
 * The geometric series sum: 1 + r + r² + ... = 1 / (1 - r)
 * where r = LTV × swapEfficiency
 * 
 * @param ltvBps - Loan-to-value ratio in basis points (e.g., 8000 = 80%)
 * @param swapEfficiency - Swap efficiency (e.g., 0.997 for 0.3% slippage)
 * @returns Maximum leverage multiplier
 */
export function calculateMaxLeverage(ltvBps: number, swapEfficiency = 1.0): number {
  const ltv = ltvBps / 10000;
  const r = ltv * swapEfficiency;
  
  if (r >= 1) return Infinity;
  if (r <= 0) return 1;
  
  return 1 / (1 - r);
}

/**
 * Calculate flash loan amount needed for target leverage
 * 
 * For leverage L with initial collateral C:
 * - Final collateral = C × L
 * - Additional collateral = C × (L - 1)
 * - Flash loan (in debt) = additionalCollateral × priceRatio / swapEfficiency
 * 
 * @param initialCollateral - Initial collateral amount
 * @param targetLeverage - Desired leverage multiplier
 * @param priceRatio - Debt tokens per collateral token (scaled by 1e18)
 * @param swapEfficiency - Swap efficiency (e.g., 0.997)
 * @param collateralDecimals - Collateral token decimals
 * @param debtDecimals - Debt token decimals
 * @returns Flash loan amount in debt tokens
 */
export function calculateFlashLoanAmount(
  initialCollateral: bigint,
  targetLeverage: number,
  priceRatio: bigint,
  swapEfficiency = 0.997,
  collateralDecimals = 18,
  debtDecimals = 18
): bigint {
  if (targetLeverage <= 1 || initialCollateral === 0n) return 0n;
  
  // Additional collateral needed = initial × (leverage - 1)
  const leverageMinus1Bps = Math.round((targetLeverage - 1) * 10000);
  const additionalCollateral = (initialCollateral * BigInt(leverageMinus1Bps)) / 10000n;
  
  // Flash loan = additionalCollateral × priceRatio / swapEfficiency
  // Adjust for decimals: result should be in debt decimals
  const swapEffBps = Math.round(swapEfficiency * 10000);
  const flashLoanScaled = (additionalCollateral * priceRatio * 10000n) / BigInt(swapEffBps);
  
  // Normalize decimals: flashLoan is in 18 decimals (from priceRatio), adjust to debtDecimals
  return flashLoanScaled / BigInt(10 ** (18 + collateralDecimals - debtDecimals));
}

/**
 * Calculate price ratio from oracle prices
 * 
 * @param collateralPriceUsd - Collateral price in USD (8 decimals)
 * @param debtPriceUsd - Debt price in USD (8 decimals)
 * @returns Debt tokens per collateral token (scaled by 1e18)
 */
export function calculatePriceRatio(
  collateralPriceUsd: bigint,
  debtPriceUsd: bigint
): bigint {
  if (debtPriceUsd === 0n) return 0n;
  // How many debt tokens equal 1 collateral token in value
  return (collateralPriceUsd * BigInt(1e18)) / debtPriceUsd;
}

/**
 * Calculate resulting LTV after leverage
 * 
 * @param totalCollateralUsd - Total collateral value
 * @param totalDebtUsd - Total debt value
 * @returns LTV as a decimal (0-1)
 */
export function calculateLtv(totalCollateralUsd: number, totalDebtUsd: number): number {
  if (totalCollateralUsd <= 0) return 0;
  return totalDebtUsd / totalCollateralUsd;
}

/**
 * Calculate health factor
 * 
 * @param totalCollateralUsd - Total collateral value
 * @param totalDebtUsd - Total debt value
 * @param liquidationLtvBps - Liquidation threshold in basis points
 * @returns Health factor (> 1 is safe)
 */
export function calculateHealthFactor(
  totalCollateralUsd: number,
  totalDebtUsd: number,
  liquidationLtvBps: number
): number {
  if (totalDebtUsd <= 0) return Infinity;
  const liqLtv = liquidationLtvBps / 10000;
  return (totalCollateralUsd * liqLtv) / totalDebtUsd;
}

/**
 * Verify if target leverage is safe
 * 
 * @param targetLeverage - Desired leverage
 * @param maxLtvBps - Maximum LTV in basis points
 * @param liquidationLtvBps - Liquidation threshold in basis points
 * @param swapEfficiency - Swap efficiency
 * @returns Safety check result
 */
export function verifyLeverageSafety(
  targetLeverage: number,
  maxLtvBps: number,
  liquidationLtvBps: number,
  swapEfficiency = 0.997
): { isSafe: boolean; maxLeverage: number; warnings: string[] } {
  const warnings: string[] = [];
  const maxLeverage = calculateMaxLeverage(maxLtvBps, swapEfficiency);
  
  if (targetLeverage > maxLeverage * 0.98) {
    warnings.push(`Leverage ${targetLeverage.toFixed(2)}x exceeds max ${maxLeverage.toFixed(2)}x`);
  }
  
  // Calculate resulting LTV
  // LTV = (L-1) / L after accounting for swap efficiency
  // Actually: totalDebt / totalCollateral = (L-1) × priceRatio / (L × swapEff × priceRatio)
  // Simplified: effectiveLTV ≈ (L-1) / (L × swapEff) for same-price assets
  const effectiveLtv = (targetLeverage - 1) / (targetLeverage * swapEfficiency);
  const maxLtv = maxLtvBps / 10000;
  const liqLtv = liquidationLtvBps / 10000;
  
  if (effectiveLtv > maxLtv) {
    warnings.push(`Effective LTV ${(effectiveLtv * 100).toFixed(1)}% > max ${(maxLtv * 100).toFixed(1)}%`);
  }
  
  const healthFactor = liqLtv / effectiveLtv;
  if (healthFactor < 1.1) {
    warnings.push(`Health factor ${healthFactor.toFixed(2)} is dangerously low`);
  } else if (healthFactor < 1.25) {
    warnings.push(`Health factor ${healthFactor.toFixed(2)} is below recommended 1.25`);
  }
  
  return {
    isSafe: warnings.length === 0,
    maxLeverage,
    warnings,
  };
}
