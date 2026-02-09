/**
 * CollateralSwapModal - Re-exports CollateralSwapModalV2 for backward compatibility.
 *
 * The V2 implementation uses the unified swap modal architecture with config hooks.
 * This file maintains the old import paths while using the new implementation.
 */

export { CollateralSwapModalV2 as CollateralSwapModal } from "./CollateralSwapModalV2";
export type { default } from "./CollateralSwapModalV2";
