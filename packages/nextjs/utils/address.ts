import { getAddress as getEvmAddress, isAddress as isEvmAddress } from "viem";
import { validateAndParseAddress } from "starknet";

// ============================================================================
// Address Truncation / Formatting
// ============================================================================

/**
 * Truncates an address to show the first and last few characters with ellipsis.
 * Standard format: "0x1234...5678"
 *
 * @param address - The address string to truncate
 * @param startChars - Number of characters to show at start (default: 6, includes "0x")
 * @param endChars - Number of characters to show at end (default: 4)
 * @returns The truncated address string, or empty string if address is falsy
 *
 * @example
 * ```ts
 * truncateAddress("0x1234567890abcdef1234567890abcdef12345678")
 * // Returns: "0x1234...5678"
 *
 * truncateAddress("0x1234567890abcdef1234567890abcdef12345678", 10, 6)
 * // Returns: "0x12345678...345678"
 * ```
 */
export function truncateAddress(
  address: string | undefined | null,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address) return "";
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Formats an address for display, with optional ENS/profile name fallback.
 * If a display name is provided, returns it; otherwise truncates the address.
 *
 * @param address - The address to format
 * @param displayName - Optional ENS or profile name to show instead
 * @param format - "short" for truncated, "full" for complete address
 * @returns The formatted display string
 *
 * @example
 * ```ts
 * formatAddressForDisplay("0x1234...5678", "vitalik.eth")
 * // Returns: "vitalik.eth"
 *
 * formatAddressForDisplay("0x1234567890abcdef1234567890abcdef12345678")
 * // Returns: "0x1234...5678"
 *
 * formatAddressForDisplay("0x1234567890abcdef1234567890abcdef12345678", undefined, "full")
 * // Returns: "0x1234567890abcdef1234567890abcdef12345678"
 * ```
 */
export function formatAddressForDisplay(
  address: string | undefined | null,
  displayName?: string | null,
  format: "short" | "full" = "short"
): string {
  if (displayName) return displayName;
  if (!address) return "";
  return format === "full" ? address : truncateAddress(address);
}

// ============================================================================
// Address Normalization
// ============================================================================

/**
 * Attempts to normalize a user-provided address for either EVM or Starknet networks.
 * Returns a checksum address for EVM inputs or the canonical Starknet representation when valid.
 *
 * @param value - The address string to normalize
 * @returns The normalized address with checksum, or undefined if invalid
 *
 * @example
 * ```ts
 * normalizeUserAddress("0x1234567890abcdef1234567890abcdef12345678")
 * // Returns: "0x1234567890AbcdEF1234567890aBcDeF12345678" (checksummed)
 * ```
 */
export const normalizeUserAddress = (value: string | null | undefined): `0x${string}` | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    if (isEvmAddress(trimmed as `0x${string}`)) {
      return getEvmAddress(trimmed as `0x${string}`) as `0x${string}`;
    }
  } catch {
    // If getAddress throws we fall back to Starknet validation below.
  }

  try {
    return validateAndParseAddress(trimmed) as `0x${string}`;
  } catch {
    return undefined;
  }
};

/**
 * Checks if a value is a valid user address (EVM or Starknet).
 *
 * @param value - The address string to validate
 * @returns true if the address is valid
 */
export const isValidUserAddress = (value: string | null | undefined): value is `0x${string}` => {
  return normalizeUserAddress(value) !== undefined;
};

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export viem's address utilities for EVM
export { getAddress as getEvmAddress, isAddress as isEvmAddress } from "viem";

// Re-export starknet's address utilities
export { validateAndParseAddress as parseStarknetAddress } from "starknet";
