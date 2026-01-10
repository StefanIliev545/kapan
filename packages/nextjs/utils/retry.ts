/**
 * Shared retry utilities for API calls and async operations
 *
 * This module consolidates retry and backoff patterns used across the codebase:
 * - Exponential backoff for transient failures
 * - Configurable retry counts and delays
 * - Request deduplication helpers
 *
 * @example
 * ```ts
 * // Simple retry with exponential backoff
 * const data = await withRetry(() => fetchApi('/endpoint'), { retries: 3 });
 *
 * // With custom backoff
 * const data = await withRetry(
 *   () => fetchApi('/endpoint'),
 *   { retries: 5, baseDelay: 500, maxDelay: 10000 }
 * );
 *
 * // Fetch with retry
 * const response = await fetchWithRetry('/api/data', { method: 'POST' });
 * ```
 */

import { logger } from "./logger";

/**
 * Configuration for retry behavior
 */
export interface RetryOptions {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to add jitter to delay (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
  /** Optional abort signal */
  signal?: AbortSignal;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'signal'>> = {
  retries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
};

/**
 * Calculate delay for exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  multiplier: number,
  jitter: boolean
): number {
  // Exponential backoff: baseDelay * multiplier^attempt
  let delay = Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay);

  // Add random jitter (0-25% of delay) to prevent thundering herd
  if (jitter) {
    delay = delay + delay * Math.random() * 0.25;
  }

  return Math.round(delay);
}

/**
 * Sleep for a given duration
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}

/**
 * Check if an error is an abort error
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Check if abort signal is triggered
 */
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

/**
 * Determine if we should retry based on attempt count and error
 */
function shouldRetry(
  attempt: number,
  retries: number,
  error: unknown,
  isRetryable: (error: unknown) => boolean
): boolean {
  if (isAbortError(error)) return false;
  return attempt < retries && isRetryable(error);
}

/**
 * Handle retry callback
 */
function handleRetryCallback(
  attempt: number,
  retries: number,
  error: unknown,
  delay: number,
  onRetry?: (attempt: number, error: unknown, delay: number) => void
): void {
  if (onRetry) {
    onRetry(attempt + 1, error, delay);
  } else {
    logger.warn(`[withRetry] Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${delay}ms`, error);
  }
}

/**
 * Execute an async function with retry and exponential backoff
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Promise resolving to function result
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => fetch('/api/data').then(r => r.json()),
 *   { retries: 3, baseDelay: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = DEFAULT_RETRY_OPTIONS.retries,
    baseDelay = DEFAULT_RETRY_OPTIONS.baseDelay,
    maxDelay = DEFAULT_RETRY_OPTIONS.maxDelay,
    backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
    jitter = DEFAULT_RETRY_OPTIONS.jitter,
    isRetryable = DEFAULT_RETRY_OPTIONS.isRetryable,
    onRetry,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    checkAborted(signal);

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(attempt, retries, error, isRetryable)) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay, backoffMultiplier, jitter);
      handleRetryCallback(attempt, retries, error, delay, onRetry);
      await sleep(delay, signal);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Configuration for fetchWithRetry
 */
export interface FetchRetryOptions extends RetryOptions {
  /** HTTP status codes to retry on (default: [408, 429, 500, 502, 503, 504]) */
  retryStatusCodes?: number[];
}

/**
 * Default HTTP status codes to retry
 * - 408: Request Timeout
 * - 429: Too Many Requests (rate limited)
 * - 500: Internal Server Error
 * - 502: Bad Gateway
 * - 503: Service Unavailable
 * - 504: Gateway Timeout
 */
export const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Fetch with automatic retry and exponential backoff
 *
 * Retries on:
 * - Network errors
 * - Specific HTTP status codes (configurable)
 *
 * @param url - URL to fetch
 * @param init - Fetch init options
 * @param retryOptions - Retry configuration
 * @returns Fetch Response
 *
 * @example
 * ```ts
 * const response = await fetchWithRetry('/api/data', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * }, { retries: 3 });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions: FetchRetryOptions = {}
): Promise<Response> {
  const { retryStatusCodes = DEFAULT_RETRY_STATUS_CODES, ...options } = retryOptions;

  return withRetry(
    async () => {
      const response = await fetch(url, init);

      // Check if response status indicates we should retry
      if (retryStatusCodes.includes(response.status)) {
        throw new RetryableHttpError(response.status, response.statusText, url);
      }

      return response;
    },
    {
      ...options,
      isRetryable: (error) => {
        // Retry on network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return true;
        }
        // Retry on our custom retryable HTTP errors
        if (error instanceof RetryableHttpError) {
          return true;
        }
        // Use custom isRetryable if provided
        return options.isRetryable?.(error) ?? false;
      },
    }
  );
}

/**
 * Custom error class for retryable HTTP errors
 */
export class RetryableHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string
  ) {
    super(`HTTP ${status} ${statusText} from ${url}`);
    this.name = 'RetryableHttpError';
  }
}

/**
 * Check if an error is a network/connectivity error worth retrying
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('load failed') ||
      message.includes('networkerror')
    );
  }
  return false;
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof RetryableHttpError) {
    return error.status === 429;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || message.includes('too many requests');
  }
  return false;
}

/**
 * Create a retry predicate for specific error types
 */
export function createRetryPredicate(
  options: {
    retryNetworkErrors?: boolean;
    retryRateLimits?: boolean;
    retryHttpCodes?: number[];
    customPredicate?: (error: unknown) => boolean;
  }
): (error: unknown) => boolean {
  const {
    retryNetworkErrors = true,
    retryRateLimits = true,
    retryHttpCodes = DEFAULT_RETRY_STATUS_CODES,
    customPredicate,
  } = options;

  return (error: unknown) => {
    if (retryNetworkErrors && isNetworkError(error)) return true;
    if (retryRateLimits && isRateLimitError(error)) return true;
    if (error instanceof RetryableHttpError && retryHttpCodes.includes(error.status)) return true;
    if (customPredicate) return customPredicate(error);
    return false;
  };
}

/**
 * Polling configuration
 */
export interface PollOptions<T> {
  /** Polling interval in ms */
  interval: number;
  /** Maximum time to poll in ms (default: Infinity) */
  timeout?: number;
  /** Condition to stop polling - return true to stop */
  until: (result: T) => boolean;
  /** Optional abort signal */
  signal?: AbortSignal;
  /** Callback on each poll */
  onPoll?: (result: T, elapsed: number) => void;
}

/**
 * Poll an async function until a condition is met
 *
 * @param fn - Async function to poll
 * @param options - Polling configuration
 * @returns Final result when condition is met
 * @throws If timeout is exceeded
 *
 * @example
 * ```ts
 * // Poll for transaction confirmation
 * const receipt = await poll(
 *   () => provider.getTransactionReceipt(hash),
 *   {
 *     interval: 1000,
 *     timeout: 60000,
 *     until: (receipt) => receipt !== null,
 *   }
 * );
 * ```
 */
export async function poll<T>(
  fn: () => Promise<T>,
  options: PollOptions<T>
): Promise<T> {
  const { interval, timeout = Infinity, until, signal, onPoll } = options;

  const startTime = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const elapsed = Date.now() - startTime;

    if (elapsed > timeout) {
      throw new Error(`Polling timed out after ${timeout}ms`);
    }

    const result = await fn();

    if (onPoll) {
      onPoll(result, elapsed);
    }

    if (until(result)) {
      return result;
    }

    await sleep(interval, signal);
  }
}

/**
 * Polling with retry - combines polling with retry on failures
 *
 * @example
 * ```ts
 * const result = await pollWithRetry(
 *   () => fetchOrderStatus(orderId),
 *   {
 *     interval: 5000,
 *     timeout: 300000, // 5 minutes
 *     until: (status) => status === 'completed' || status === 'failed',
 *     retries: 2,
 *     baseDelay: 1000,
 *   }
 * );
 * ```
 */
export async function pollWithRetry<T>(
  fn: () => Promise<T>,
  options: PollOptions<T> & RetryOptions
): Promise<T> {
  const { interval, timeout, until, signal, onPoll, ...retryOptions } = options;

  return poll(
    () => withRetry(fn, { ...retryOptions, signal }),
    { interval, timeout, until, signal, onPoll }
  );
}
