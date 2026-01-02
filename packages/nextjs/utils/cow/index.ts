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
 * const appData = buildKapanAppData(orderManagerAddress, user, salt, chainId);
 * const appDataHash = computeAppDataHash(appData);
 * ```
 */

// Contract addresses and flash loan utilities
export {
  COW_PROTOCOL,
  COW_FLASH_LOAN_ROUTER,
  COW_AAVE_BORROWERS,
  COW_API_URLS,
  COW_EXPLORER_URLS,
  GPV2_ORDER,
  TRADE_FLAGS,
  FLASH_LOAN_LENDERS,
  FLASH_LOAN_FEES,
  COW_FLASH_LOAN_LENDERS,
  MORPHO_BLUE,
  AAVE_V3_POOLS,
  isChainSupported,
  getCowApiUrl,
  getCowExplorerOrderUrl,
  getCowExplorerAddressUrl,
  getFlashLoanLender,
  getFlashLoanFeeBps,
  calculateFlashLoanFee,
  getCowFlashLoanLender,
  getKapanCowAdapter,
  getPreferredFlashLoanLender,
  isMorphoLender,
} from "./addresses";

// AppData utilities
export {
  type CowHook,
  type AppDataDocument,
  type FlashLoanMetadata,
  buildKapanAppData,
  computeAppDataHash,
  registerAppData,
  buildAndRegisterAppData,
  buildFlashLoanOptions,
  encodePreHookCall,
  encodePostHookCall,
  encodeAdapterFundOrder,
  getCowBorrower,
  encodeBorrowerApprove,
  encodeTokenTransfer,
  encodeTokenTransferFrom,
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

// Chunk calculation utilities
export {
  type ChunkCalculationInput,
  type ChunkCalculationResult,
  calculateChunkParams,
  calculateSwapRate,
} from "./chunkCalculator";
