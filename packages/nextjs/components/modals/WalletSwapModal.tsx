/**
 * WalletSwapModal - Re-exports WalletSwapModalV2 for backward compatibility.
 *
 * The V2 implementation uses the unified swap modal architecture with config hooks.
 * This file maintains the old import paths while using the new implementation.
 */

export { WalletSwapModalV2 as WalletSwapModal } from "./WalletSwapModalV2";
export type { default } from "./WalletSwapModalV2";
