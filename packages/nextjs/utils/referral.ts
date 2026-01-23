import { addrKey } from "./address";

/**
 * Referral code format: KAP-XXXX-XXXX
 * Uses uppercase alphanumeric characters (excluding ambiguous characters like 0, O, I, L)
 */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_SEGMENT_LENGTH = 4;

/**
 * Normalizes a wallet address to lowercase for consistent storage and comparison.
 * Re-exports addrKey from address.ts for convenience.
 */
export const normalizeAddress = addrKey;

/**
 * Generates a random referral code in the format KAP-XXXX-XXXX.
 * Uses characters that are unambiguous (no 0/O/I/L confusion).
 */
export function generateReferralCode(): string {
  const segment1 = generateRandomSegment();
  const segment2 = generateRandomSegment();
  return `KAP-${segment1}-${segment2}`;
}

/**
 * Generates a random segment of alphanumeric characters.
 */
function generateRandomSegment(): string {
  let result = "";
  for (let i = 0; i < CODE_SEGMENT_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CODE_CHARS.length);
    result += CODE_CHARS[randomIndex];
  }
  return result;
}

/**
 * Validates that a referral code matches the expected format: KAP-XXXX-XXXX
 * where X is an uppercase alphanumeric character.
 */
export function isValidReferralCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;

  // Check format: KAP-XXXX-XXXX (exact pattern)
  const pattern = /^KAP-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  return pattern.test(code.toUpperCase());
}

/**
 * Formats a referral code to uppercase for consistency.
 */
export function formatReferralCode(code: string): string {
  return code.toUpperCase().trim();
}

/**
 * Query keys for referral-related React Query hooks.
 */
export const referralKeys = {
  all: ["referral"] as const,
  code: (wallet: string) => [...referralKeys.all, "code", normalizeAddress(wallet)] as const,
  stats: (wallet: string) => [...referralKeys.all, "stats", normalizeAddress(wallet)] as const,
  validate: (code: string) => [...referralKeys.all, "validate", formatReferralCode(code)] as const,
};
