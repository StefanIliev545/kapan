import type { SwapRouter } from "../SwapModalShell";

/**
 * Resolves the swap router when the currently selected one is unavailable on the chain.
 * Uses a per-current fallback table (keep the user's preference where possible) instead of
 * nested ternaries. Returns `current` unchanged when it's available.
 *
 * Extracted from useCollateralSwapConfig + useClosePositionConfig, which had byte-identical
 * copies. NOTE: debtSwapHelpers.resolveAvailableRouter intentionally differs (flat order,
 * nullable return) — do not fold it in here without re-verifying debt-swap behavior.
 */
export function resolveSwapRouter(
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
