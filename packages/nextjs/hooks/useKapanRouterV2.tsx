/**
 * KapanRouter V2 Hook
 *
 * This file re-exports from the modular implementation for backwards compatibility.
 * The actual implementation has been split into focused hooks under ./kapan-router/
 *
 * For new code, consider importing from "~~/hooks/kapan-router" directly:
 * - useTransactionBuilder: For building transaction instructions
 * - useTransactionExecutor: For executing transactions
 * - useAuthorizationManager: For authorization/deauthorization
 * - useTransactionNotifications: For notification handling
 *
 * @example
 * ```typescript
 * // Backwards-compatible import (still works)
 * import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
 *
 * // New modular import (recommended for new code)
 * import { useKapanRouterV2, useTransactionBuilder } from "~~/hooks/kapan-router";
 * ```
 */

// Re-export the facade hook as the default export
export { useKapanRouterV2 } from "./kapan-router";

// Re-export types that were previously exported from this file
export type { ProtocolInstruction } from "~~/utils/v2/instructionHelpers";
