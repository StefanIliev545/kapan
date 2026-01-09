/**
 * Shared validation utilities for form inputs across modals.
 * Consolidates common validation logic for amounts, balances, and addresses.
 */
import { parseUnits, formatUnits, isAddress as isEvmAddress } from "viem";
import { validateAndParseAddress } from "starknet";

// ============================================================================
// Amount Validation
// ============================================================================

/**
 * Result of parsing an amount string
 */
export interface ParsedAmount {
  /** The parsed bigint value, or null if parsing failed */
  value: bigint | null;
  /** Whether the amount is positive (> 0) */
  isPositive: boolean;
  /** Whether the amount is valid (parseable and non-negative) */
  isValid: boolean;
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Safely parses an amount string into a bigint value.
 * Handles empty strings, invalid input, and decimal conversion.
 *
 * @param amount - The amount string to parse (e.g., "1.5", "0.001")
 * @param decimals - The number of decimals for the token (default: 18)
 * @returns ParsedAmount object with value and validation flags
 *
 * @example
 * ```ts
 * const result = parseAmount("1.5", 18);
 * // { value: 1500000000000000000n, isPositive: true, isValid: true }
 *
 * const empty = parseAmount("", 18);
 * // { value: null, isPositive: false, isValid: false }
 * ```
 */
export function parseAmount(amount: string, decimals: number = 18): ParsedAmount {
  if (!amount || !amount.trim()) {
    return { value: null, isPositive: false, isValid: false };
  }

  try {
    const value = parseUnits(amount, decimals);
    return {
      value,
      isPositive: value > 0n,
      isValid: value >= 0n,
    };
  } catch (e) {
    return {
      value: null,
      isPositive: false,
      isValid: false,
      error: e instanceof Error ? e.message : "Invalid amount format",
    };
  }
}

/**
 * Checks if an amount is positive (greater than zero).
 * Convenience wrapper around parseAmount for simple boolean checks.
 *
 * @param amount - The amount string to check
 * @param decimals - The number of decimals for the token
 * @returns true if the amount parses to a positive value
 *
 * @example
 * ```ts
 * isAmountPositive("1.0", 18) // true
 * isAmountPositive("0", 18)   // false
 * isAmountPositive("", 18)    // false
 * ```
 */
export function isAmountPositive(amount: string, decimals: number = 18): boolean {
  return parseAmount(amount, decimals).isPositive;
}

/**
 * Validates that an amount is within acceptable bounds.
 *
 * @param amount - The amount string to validate
 * @param decimals - Token decimals
 * @param options - Validation options
 * @returns Validation result with specific error messages
 */
export interface AmountValidationOptions {
  /** Minimum allowed amount (inclusive) */
  min?: bigint;
  /** Maximum allowed amount (inclusive) */
  max?: bigint;
  /** User's available balance for insufficient funds check */
  balance?: bigint;
  /** Whether to allow zero amounts */
  allowZero?: boolean;
}

export interface AmountValidationResult {
  isValid: boolean;
  parsedAmount: bigint | null;
  error?: "empty" | "invalid" | "zero" | "below_min" | "above_max" | "insufficient_funds";
  errorMessage?: string;
}

export function validateAmount(
  amount: string,
  decimals: number,
  options: AmountValidationOptions = {}
): AmountValidationResult {
  const { min, max, balance, allowZero = false } = options;
  const parsed = parseAmount(amount, decimals);

  if (parsed.value === null) {
    return {
      isValid: false,
      parsedAmount: null,
      error: amount.trim() ? "invalid" : "empty",
      errorMessage: amount.trim() ? "Invalid amount format" : "Amount is required",
    };
  }

  if (!allowZero && parsed.value === 0n) {
    return {
      isValid: false,
      parsedAmount: 0n,
      error: "zero",
      errorMessage: "Amount must be greater than zero",
    };
  }

  if (min !== undefined && parsed.value < min) {
    return {
      isValid: false,
      parsedAmount: parsed.value,
      error: "below_min",
      errorMessage: `Amount must be at least ${formatUnits(min, decimals)}`,
    };
  }

  if (max !== undefined && parsed.value > max) {
    return {
      isValid: false,
      parsedAmount: parsed.value,
      error: "above_max",
      errorMessage: `Amount cannot exceed ${formatUnits(max, decimals)}`,
    };
  }

  if (balance !== undefined && parsed.value > balance) {
    return {
      isValid: false,
      parsedAmount: parsed.value,
      error: "insufficient_funds",
      errorMessage: "Insufficient funds",
    };
  }

  return {
    isValid: true,
    parsedAmount: parsed.value,
  };
}

// ============================================================================
// Balance Validation
// ============================================================================

/**
 * Checks if the user has sufficient balance for a given amount.
 * Used for deposit/repay operations where wallet balance matters.
 *
 * @param amount - The amount to check (as bigint)
 * @param balance - The user's available balance
 * @returns true if balance >= amount
 */
export function hasSufficientBalance(amount: bigint | null, balance: bigint): boolean {
  if (amount === null) return true; // No amount entered yet
  return balance >= amount;
}

/**
 * Determines if "insufficient funds" should be shown for a given action.
 * Borrow and Withdraw are limited by protocol, not wallet balance.
 *
 * @param action - The action being performed
 * @param parsedAmount - The parsed amount (bigint or null)
 * @param balance - User's wallet balance
 * @returns true if insufficient funds warning should be shown
 */
export function shouldShowInsufficientFunds(
  action: "Borrow" | "Deposit" | "Withdraw" | "Repay",
  parsedAmount: bigint | null,
  balance: bigint
): boolean {
  // Borrow/withdraw amounts are clamped to protocol limits rather than wallet balance
  if (action === "Borrow" || action === "Withdraw") {
    return false;
  }

  if (!parsedAmount || parsedAmount <= 0n) {
    return false;
  }

  return parsedAmount > balance;
}

// ============================================================================
// Address Validation
// ============================================================================

/**
 * Validates an EVM address format.
 * Uses viem's isAddress for proper checksum validation.
 *
 * @param address - The address string to validate
 * @returns true if the address is a valid EVM address
 */
export function isValidEvmAddress(address: string): address is `0x${string}` {
  if (!address) return false;
  return isEvmAddress(address);
}

/**
 * Validates a Starknet address format.
 *
 * @param address - The address string to validate
 * @returns true if the address is a valid Starknet address
 */
export function isValidStarknetAddress(address: string): boolean {
  if (!address) return false;
  try {
    validateAndParseAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an address for either EVM or Starknet networks.
 *
 * @param address - The address string to validate
 * @param network - The network type ("evm" or "stark")
 * @returns true if the address is valid for the specified network
 */
export function isValidAddress(
  address: string,
  network: "evm" | "stark"
): boolean {
  if (network === "evm") {
    return isValidEvmAddress(address);
  }
  return isValidStarknetAddress(address);
}

/**
 * Validates a Starknet address input while typing.
 * More lenient than full validation - allows partial addresses.
 *
 * @param value - The input value being typed
 * @returns true if the value is a valid partial or complete Starknet address
 */
export function isValidStarknetAddressInput(value: string): boolean {
  if (!value) return true; // Empty is valid while typing
  const sanitized = value.toLowerCase();
  if (sanitized === "0x") return true; // Valid start
  return /^0x[a-f0-9]{1,64}$/.test(sanitized);
}

// ============================================================================
// Form Submission Validation
// ============================================================================

/**
 * Checks if a form can be submitted based on common validation criteria.
 * Used by TokenActionModal and similar components.
 *
 * @param options - Validation options
 * @returns true if the form can be submitted
 */
export interface CanSubmitOptions {
  /** Whether the amount is positive */
  isAmountPositive: boolean;
  /** Whether the user has sufficient funds */
  hasSufficientFunds: boolean;
  /** Whether a wallet is connected */
  isWalletConnected: boolean;
  /** Whether the user is on the correct chain */
  isCorrectChain: boolean;
  /** Whether there's a pending transaction */
  isPending?: boolean;
}

export function canSubmitForm(options: CanSubmitOptions): boolean {
  const {
    isAmountPositive,
    hasSufficientFunds,
    isWalletConnected,
    isCorrectChain,
    isPending = false,
  } = options;

  return (
    isAmountPositive &&
    hasSufficientFunds &&
    isWalletConnected &&
    isCorrectChain &&
    !isPending
  );
}

// ============================================================================
// Decimal Normalization
// ============================================================================

/**
 * Resolves token decimals with fallback chain.
 * Prefers explicit token decimals, then fetched decimals, then defaults to 18.
 *
 * @param tokenDecimals - Decimals from token object
 * @param fetchedDecimals - Decimals fetched from chain
 * @param defaultDecimals - Default fallback (default: 18)
 * @returns The resolved decimals value
 */
export function resolveDecimals(
  tokenDecimals: number | undefined | null,
  fetchedDecimals?: number | undefined | null,
  defaultDecimals: number = 18
): number {
  return tokenDecimals ?? fetchedDecimals ?? defaultDecimals;
}
