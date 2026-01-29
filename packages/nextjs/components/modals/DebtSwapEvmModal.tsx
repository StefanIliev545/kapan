/**
 * DebtSwapEvmModal - Re-exports DebtSwapModalV2 for backward compatibility.
 *
 * The V2 implementation uses the unified swap modal architecture with config hooks.
 * This file maintains the old import paths while using the new implementation.
 */

export { DebtSwapModalV2 as DebtSwapEvmModal } from "./DebtSwapModalV2";
export type { EulerCollateralInfo } from "./DebtSwapModalV2";
export type { default } from "./DebtSwapModalV2";
