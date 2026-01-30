/**
 * Deadline and time-related utilities for swaps and orders
 *
 * This module consolidates deadline calculation patterns used across:
 * - CoW Protocol orders (validTo field)
 * - Pendle swaps (deadline parameter)
 * - Order display (timeAgo, formatDate)
 */

// ============ Constants ============

/**
 * Default chunk window duration in seconds (30 minutes)
 * Matches DEFAULT_CHUNK_WINDOW in KapanConditionalOrderManager.sol
 * @dev Increased to 30 minutes to allow sufficient time for solver competition and fills
 */
export const CHUNK_WINDOW_SECONDS = 30 * 60; // 30 minutes

/**
 * Default swap deadline in seconds (20 minutes)
 * Used for one-off swaps like Pendle conversions
 */
export const DEFAULT_SWAP_DEADLINE_SECONDS = 20 * 60; // 20 minutes

/**
 * Time units in seconds for calculations
 */
export const TIME_UNITS = {
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
  WEEK: 604800,
} as const;

// ============ Deadline Calculation ============

/**
 * Calculate a Unix timestamp deadline from now
 *
 * @param durationSeconds - How many seconds from now the deadline should be
 * @returns Unix timestamp (seconds since epoch)
 *
 * @example
 * // Get deadline 20 minutes from now
 * const deadline = calculateDeadline(20 * 60);
 */
export function calculateDeadline(durationSeconds: number): number {
  return Math.floor(Date.now() / 1000) + durationSeconds;
}

/**
 * Calculate default swap deadline (20 minutes from now)
 * Used for one-off swaps like Pendle conversions
 */
export function getDefaultSwapDeadline(): number {
  return calculateDeadline(DEFAULT_SWAP_DEADLINE_SECONDS);
}

/**
 * Calculate validTo timestamp for a CoW order chunk
 * Uses fixed time windows for deterministic order hashes (TWAP-style)
 *
 * @param createdAt - Order creation timestamp (Unix seconds)
 * @param iterationCount - Current chunk index (0-based)
 * @param windowSeconds - Window duration in seconds (default: 30 min)
 * @returns validTo timestamp for this chunk
 *
 * @example
 * // Calculate validTo for first chunk
 * const validTo = calculateChunkValidTo(orderCreatedAt, 0);
 */
export function calculateChunkValidTo(
  createdAt: number,
  iterationCount: number,
  windowSeconds: number = CHUNK_WINDOW_SECONDS
): number {
  // Calculate the ideal window for this chunk
  const chunkWindowStart = createdAt + (iterationCount * windowSeconds);
  const chunkWindowEnd = chunkWindowStart + windowSeconds - 1;

  const now = Math.floor(Date.now() / 1000);

  // If we're still within the chunk's ideal window, use it
  if (now <= chunkWindowEnd) {
    return chunkWindowEnd;
  }

  // Chunk didn't fill in time - extend to current window
  // This allows the order to remain valid and retry
  const elapsedSinceCreate = now - createdAt;
  const currentWindowIndex = Math.floor(elapsedSinceCreate / windowSeconds);
  return createdAt + ((currentWindowIndex + 1) * windowSeconds) - 1;
}

/**
 * Check if a deadline/validTo has expired
 *
 * @param deadline - Unix timestamp (seconds)
 * @returns true if deadline has passed
 */
export function isDeadlineExpired(deadline: number): boolean {
  return Math.floor(Date.now() / 1000) > deadline;
}

/**
 * Calculate remaining time until deadline
 *
 * @param deadline - Unix timestamp (seconds)
 * @returns Remaining seconds (negative if expired)
 */
export function getRemainingTime(deadline: number): number {
  return deadline - Math.floor(Date.now() / 1000);
}

// ============ Time Display ============

/**
 * Format a Unix timestamp as a human-readable date
 *
 * @param timestamp - Unix timestamp (seconds or bigint)
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 *
 * @example
 * formatTimestamp(1704067200n) // "Jan 1, 2024"
 * formatTimestamp(1704067200, { dateStyle: 'full' }) // "Monday, January 1, 2024"
 */
export function formatTimestamp(
  timestamp: bigint | number,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  const date = new Date(ts * 1000);
  return date.toLocaleDateString(undefined, options);
}

/**
 * Format a Unix timestamp as a full date-time string
 *
 * @param timestamp - Unix timestamp (seconds or bigint)
 * @returns Locale-formatted date and time string
 */
export function formatDateTime(timestamp: bigint | number): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Format elapsed time as human-readable relative time (e.g., "5m ago", "2h ago")
 *
 * @param timestamp - Unix timestamp (seconds or bigint)
 * @param compact - If true, use compact format without "ago" (e.g., "5m" vs "5m ago")
 * @returns Relative time string
 *
 * @example
 * timeAgo(recentTimestamp) // "just now"
 * timeAgo(olderTimestamp) // "5h ago"
 * timeAgo(olderTimestamp, true) // "5h"
 */
export function timeAgo(timestamp: bigint | number, compact = false): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;

  const suffix = compact ? '' : ' ago';
  const justNow = compact ? 'now' : 'just now';

  if (diff < TIME_UNITS.MINUTE) {
    return justNow;
  }
  if (diff < TIME_UNITS.HOUR) {
    return `${Math.floor(diff / TIME_UNITS.MINUTE)}m${suffix}`;
  }
  if (diff < TIME_UNITS.DAY) {
    return `${Math.floor(diff / TIME_UNITS.HOUR)}h${suffix}`;
  }
  if (diff < TIME_UNITS.WEEK) {
    return `${Math.floor(diff / TIME_UNITS.DAY)}d${suffix}`;
  }

  // Fall back to formatted date for older timestamps
  return formatTimestamp(ts);
}

/**
 * Format remaining time until a deadline
 *
 * @param deadline - Unix timestamp (seconds)
 * @returns Human-readable remaining time or "expired"
 *
 * @example
 * formatRemainingTime(futureDeadline) // "15m remaining"
 * formatRemainingTime(pastDeadline) // "expired"
 */
export function formatRemainingTime(deadline: number): string {
  const remaining = getRemainingTime(deadline);

  if (remaining <= 0) {
    return 'expired';
  }

  if (remaining < TIME_UNITS.MINUTE) {
    return `${remaining}s remaining`;
  }
  if (remaining < TIME_UNITS.HOUR) {
    return `${Math.floor(remaining / TIME_UNITS.MINUTE)}m remaining`;
  }
  if (remaining < TIME_UNITS.DAY) {
    return `${Math.floor(remaining / TIME_UNITS.HOUR)}h remaining`;
  }

  return `${Math.floor(remaining / TIME_UNITS.DAY)}d remaining`;
}

// ============ Days to Expiry ============

/**
 * Calculate days until a given date/timestamp
 * Commonly used for Pendle PT expiry calculations
 *
 * @param expiryDate - Date object or Unix timestamp (milliseconds)
 * @returns Days remaining (0 if expired)
 */
export function daysToExpiry(expiryDate: Date | number): number {
  const expiry = typeof expiryDate === 'number' ? expiryDate : expiryDate.getTime();
  const now = Date.now();
  const diffMs = expiry - now;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Check if an expiry date has passed
 *
 * @param expiryDate - Date object or Unix timestamp (milliseconds)
 * @returns true if expired
 */
export function isExpired(expiryDate: Date | number): boolean {
  const expiry = typeof expiryDate === 'number' ? expiryDate : expiryDate.getTime();
  return Date.now() >= expiry;
}
