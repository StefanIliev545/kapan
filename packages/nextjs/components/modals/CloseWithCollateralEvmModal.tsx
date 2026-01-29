/**
 * CloseWithCollateralEvmModal - Re-exports ClosePositionModalV2 for backward compatibility.
 *
 * The V2 implementation uses the unified swap modal architecture with config hooks.
 * This file maintains the old import paths while using the new implementation.
 */

export { ClosePositionModalV2 as CloseWithCollateralEvmModal } from "./ClosePositionModalV2";
export type { default } from "./ClosePositionModalV2";
