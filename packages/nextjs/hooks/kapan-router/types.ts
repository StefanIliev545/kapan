/**
 * Shared types and utilities for KapanRouter hooks
 */
import {
  decodeAbiParameters,
  decodeFunctionData,
  type Address,
  type Hex
} from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { decodeRevertReason, formatErrorForDisplay } from "~~/utils/errorDecoder";

// --- ABI FIXES ---
// Local definition of deauthorizeInstructions/authorizeInstructions signatures
// to ensure stability even if artifacts are slightly stale.
export const DEAUTH_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "protocolName", type: "string" },
          { name: "data", type: "bytes" },
        ],
        name: "instructions",
        type: "tuple[]",
      },
      { name: "caller", type: "address" },
    ],
    name: "deauthorizeInstructions",
    outputs: [
      { name: "targets", type: "address[]" },
      { name: "data", type: "bytes[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Interface for authorization calls returned by authorizeInstructions
 */
export interface AuthorizationCall {
  target: Address;
  data: `0x${string}`;
}

/**
 * Options for useKapanRouterV2 and related hooks
 */
export interface UseKapanRouterV2Options {
  /** Override chainId (for hardhat/local dev). If not provided, uses wallet's chainId */
  chainId?: number;
}

// Constants
export const APPROVE_SELECTOR = "0x095ea7b3";

export const CONFIRMATIONS_BY_CHAIN: Record<number, number> = {
  8453: 1,   // Base mainnet
  84531: 1,  // Base Sepolia
  84532: 1,  // Base Sepolia
  10: 1,     // Optimism
  420: 1,    // Optimism Goerli
  11155420: 1, // Optimism Sepolia
  42161: 1,  // Arbitrum One
  421614: 1, // Arbitrum Sepolia
  59144: 1,  // Linea
  59141: 1,  // Linea Sepolia
  31337: 1,  // Hardhat
  130: 1,    // Unichain
};

// OP Stack chains with fast block times need a delay for RPC to index new state
export const OP_STACK_FAST_CHAINS = new Set([10, 8453, 130]); // Optimism, Base, Unichain

// Chains where deauthorization is disabled due to batching issues
export const DEAUTH_DISABLED_CHAINS = [59144, 9745]; // Linea, Plasma

// Aave flash loan fee buffer: 9 bps (0.09%) - slightly higher than typical 5 bps for safety
export const AAVE_FEE_BUFFER_BPS = 9;

// --- Helper Functions ---

/**
 * Helper to detect if an authorization call is just approving "0" (which we can skip for gas efficiency)
 */
export const isZeroAmountApproval = (data: `0x${string}` | undefined): boolean => {
  if (!data || data === "0x" || data.length < 10) {
    return false;
  }

  try {
    const decoded = decodeFunctionData({ abi: ERC20ABI, data: data as Hex });
    if (decoded.functionName === "approve") {
      const amount = decoded.args?.[1] as bigint | undefined;
      return amount === 0n;
    }
    return false;
  } catch {
    try {
      // Fallback manual decode
      const selector = data.slice(0, 10).toLowerCase();
      if (selector !== APPROVE_SELECTOR) {
        return false;
      }
      const [, amount] = decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        data.slice(10) as `0x${string}`
      );
      return (amount as bigint) === 0n;
    } catch {
      return false;
    }
  }
};

/**
 * Check if an error represents a user rejection
 */
export const isUserRejection = (error: any): boolean => {
  const errorMessage = error?.message || "";
  const lowerMessage = errorMessage.toLowerCase();

  const rejectionPhrases = [
    "user rejected",
    "user denied",
    "user cancelled",
    "rejected",
    "denied",
    "cancelled",
  ];

  const rejectionCodes = [4001, "ACTION_REJECTED", "USER_REJECTED"];

  return (
    rejectionPhrases.some(phrase => lowerMessage.includes(phrase)) ||
    rejectionCodes.includes(error?.code)
  );
};

/**
 * Extract hex data from various error formats
 */
export const extractHexData = (data: unknown): string => {
  if (!data) return "";
  if (typeof data === "string" && data.startsWith("0x")) return data;

  if (typeof data === "object" && data !== null) {
    if ("data" in data && typeof (data as any).data === "string") {
      return (data as any).data;
    }
    const str = String(data);
    const match = str.match(/(0x[a-fA-F0-9]{8,})/);
    return match ? match[1] : "";
  }

  return "";
};

/**
 * Extract revert data from an error object
 */
export const extractRevertData = (error: any): string => {
  const errorMessage = error?.message || "";

  // Try various sources for revert data
  let revertData = extractHexData(error?.cause?.data) ||
                   extractHexData(error?.data) ||
                   "";

  // Try to extract from error message if not found
  if (!revertData && errorMessage) {
    const match = errorMessage.match(/return data: (0x[a-fA-F0-9]+)/i) ||
                  errorMessage.match(/data: (0x[a-fA-F0-9]+)/i) ||
                  errorMessage.match(/(0x[a-fA-F0-9]{8,})/);
    if (match) {
      revertData = match[1];
    }
  }

  return revertData;
};

/**
 * Format an error into a user-friendly message
 */
export const formatExecutionError = (error: any): string => {
  if (isUserRejection(error)) {
    return "User rejected the request";
  }

  const revertData = extractRevertData(error);

  if (revertData && revertData.length >= 10) {
    const decoded = decodeRevertReason(revertData);
    const formatted = formatErrorForDisplay(decoded);
    return formatted.suggestion
      ? `${formatted.title}: ${formatted.description} ${formatted.suggestion}`
      : `${formatted.title}: ${formatted.description}`;
  }

  return error.shortMessage || error.message || "Failed to execute instructions";
};

/**
 * Check if an authorization call should be skipped
 */
export const shouldSkipAuthCall = (authCall: AuthorizationCall): boolean => {
  if (!authCall.target || !authCall.data || authCall.data.length === 0) return true;
  if (isZeroAmountApproval(authCall.data)) return true;
  return false;
};

/**
 * Check if deauthorization should be performed on this chain
 * Disabled for Linea (59144) and Plasma (9745) due to batching issues
 */
export const shouldRevokeOnChain = (chainId: number, revokePermissions?: boolean): boolean => {
  if (!revokePermissions) return false;
  return !DEAUTH_DISABLED_CHAINS.includes(chainId);
};

/**
 * Filter authorization calls to remove invalid/zero-amount approvals and deduplicate
 */
export const filterValidAuthCalls = (authCalls: AuthorizationCall[]): AuthorizationCall[] => {
  const seen = new Set<string>();
  return authCalls.filter(call => {
    if (shouldSkipAuthCall(call)) return false;
    // Deduplicate by (target, data) pair
    const key = `${call.target.toLowerCase()}:${call.data.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Filter deauthorization calls to remove invalid ones and deduplicate
 */
export const filterValidDeauthCalls = (deauthCalls: AuthorizationCall[]): AuthorizationCall[] => {
  const seen = new Set<string>();
  return deauthCalls.filter(({ target, data }) => {
    if (!target || !data || data.length === 0) return false;
    // Deduplicate by (target, data) pair
    const key = `${target.toLowerCase()}:${data.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Check if a simulation error is definitely not related to missing approvals
 * These are errors that would still occur even after approvals are executed
 */
export const isDefinitelyNotApprovalRelated = (errorText: string): boolean => {
  // Include patterns from Aave, Compound, Euler, etc.
  const nonApprovalPatterns = /health.?factor|liquidation|borrow.?cap|supply.?cap|frozen|paused|insufficient.?collateral|siloed|isolation.?mode|debt.?ceiling|e_accountliquidity|e_badcollateral|e_borrowcapexceeded|e_supplycapexceeded|e_insufficientcash|e_pricefeednoset|e_badprice|e_pricefeedstale|oracle|liquidity/i;
  return nonApprovalPatterns.test(errorText);
};

/**
 * Check if an auth error is expected/benign (e.g., "already enabled" states in Euler)
 * These errors will succeed in the actual batch because they're no-ops when state already exists
 */
export const isExpectedAuthError = (errorText: string): boolean => {
  // Euler EVC: controller/collateral already enabled, or trying to re-enable
  const expectedPatterns = /controllerviolation|already.*enabled|collateraldisabled|controllerdisabled|notauthorized/i;
  return expectedPatterns.test(errorText);
};

/**
 * Format a simulation error with title, description, and optional suggestion
 */
export const formatSimulationError = (formatted: ReturnType<typeof formatErrorForDisplay>): string => {
  return formatted.suggestion
    ? `${formatted.title}: ${formatted.description} ${formatted.suggestion}`
    : `${formatted.title}: ${formatted.description}`;
};
