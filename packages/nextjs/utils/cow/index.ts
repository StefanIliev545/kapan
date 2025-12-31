/**
 * CoW Protocol utilities for Kapan Finance
 * 
 * This module provides utilities for creating and managing CoW Protocol orders
 * that execute Kapan lending operations via pre/post hooks.
 * 
 * @example
 * ```ts
 * import { buildOrderParams, buildKapanAppData, computeAppDataHash } from "~~/utils/cow";
 * 
 * // Build order parameters
 * const params = buildOrderParams({
 *   user: userAddress,
 *   sellToken: wethAddress,
 *   buyToken: usdcAddress,
 *   preTotalAmount: "1.0",
 *   chunkSize: "0.1",
 *   minBuyPerChunk: "180",
 *   completion: CompletionType.Iterations,
 *   targetValue: 10,
 * });
 * 
 * // Build and hash AppData (contains hooks)
 * const appData = buildKapanAppData(orderManagerAddress, kapanOrderHash);
 * const appDataHash = computeAppDataHash(appData);
 * ```
 */

// Contract addresses
export {
  COW_PROTOCOL,
  COW_API_URLS,
  COW_EXPLORER_URLS,
  GPV2_ORDER,
  TRADE_FLAGS,
  isChainSupported,
  getCowApiUrl,
  getCowExplorerOrderUrl,
  getCowExplorerAddressUrl,
} from "./addresses";

// AppData utilities
export {
  type CowHook,
  type AppDataDocument,
  buildKapanAppData,
  computeAppDataHash,
  registerAppData,
  buildAndRegisterAppData,
  encodePreHookCall,
  encodePostHookCall,
} from "./appData";

// Order parameter utilities
export {
  CompletionType,
  OrderStatus,
  type KapanOrderInput,
  type KapanOrderParams,
  type OrderContext,
  buildOrderParams,
  generateOrderSalt,
  computeOrderHashPreview,
  encodeInstructions,
  decodeInstructions,
  parseOrderContext,
  calculateOrderProgress,
  getOrderStatusText,
  getCompletionTypeText,
} from "./orderParams";
