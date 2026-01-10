import { Address } from "viem";
import { logger } from "./logger";
import { withRetry, isNetworkError, isRateLimitError } from "./retry";

export const ONE_INCH_API_BASE = "/api/1inch";

export type OneInchToken = {
  address: Address;
  symbol: string;
  decimals: number;
  name: string;
  logoURI: string;
};

export type OneInchQuoteParams = {
  src: Address;
  dst: Address;
  amount: string;
  from?: Address; // Adapter address
  slippage?: number; // 1 = 1%
  disableEstimate?: boolean;
  includeTokensInfo?: boolean;
  includeProtocols?: boolean;
  includeGas?: boolean;
};

export type OneInchSwapResponse = {
  dstAmount: string;
  srcAmount?: string;
  // USD values (if available)
  srcUSD?: string;
  dstUSD?: string;
  // Gas estimates
  gas?: number;
  // Protocols/routes used
  protocols?: Array<
    Array<Array<{ name: string; part: number; fromTokenAddress: string; toTokenAddress: string }>>
  >;
  tx: {
    from: Address;
    to: Address;
    data: `0x${string}`;
    value: string;
    gas: number;
    gasPrice: string;
  };
  error?: string;
  description?: string;
};

export type OneInchQuoteResponse = {
  dstAmount: string;
  srcAmount?: string;
  // USD values
  srcUSD?: string;
  dstUSD?: string;
  // Gas estimate
  gas?: number;
  // Token info (if includeTokensInfo=true)
  srcToken?: OneInchToken;
  dstToken?: OneInchToken;
  // Protocols/routes
  protocols?: Array<
    Array<Array<{ name: string; part: number; fromTokenAddress: string; toTokenAddress: string }>>
  >;
  error?: string;
  description?: string;
};

/**
 * Shared fetch handler for 1inch API calls with retry support
 * Retries on network errors and rate limits (429)
 */
const fetch1inchApi = async <T extends { error?: string; description?: string }>(
  endpoint: string,
  logPrefix: string,
): Promise<T> => {
  return withRetry(
    async () => {
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
        },
      });

      // Handle rate limiting explicitly
      if (response.status === 429) {
        throw new Error("1inch API rate limit exceeded");
      }

      const json = await response.json();
      logger.debug(`1inch ${logPrefix} response: ${JSON.stringify(json)}`);
      if (json.error) {
        throw new Error(json.description || json.error);
      }
      return json;
    },
    {
      retries: 2,
      baseDelay: 1000,
      isRetryable: (error) => isNetworkError(error) || isRateLimitError(error),
      onRetry: (attempt, error, delay) => {
        logger.warn(`[1inch ${logPrefix}] Retry ${attempt}, waiting ${delay}ms`, error);
      },
    }
  );
};

/**
 * Build URL search params from an object, filtering out undefined/null values
 */
const buildSearchParams = (
  params: Record<string, string | number | boolean | undefined>,
): URLSearchParams => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  return searchParams;
};

// Fetch a quote (no tx data, no from address required)
export const fetch1inchQuote = async (
  chainId: number,
  params: { src: Address; dst: Address; amount: string; includeGas?: boolean },
): Promise<OneInchQuoteResponse> => {
  const searchParams = buildSearchParams({
    src: params.src,
    dst: params.dst,
    amount: params.amount,
    includeGas: params.includeGas ? "true" : undefined,
  });

  const url = `${ONE_INCH_API_BASE}/${chainId}/quote?${searchParams.toString()}`;
  return fetch1inchApi<OneInchQuoteResponse>(url, "quote");
};

// Fetch swap data (requires from address for tx.data)
export const fetch1inchSwap = async (
  chainId: number,
  params: OneInchQuoteParams,
): Promise<OneInchSwapResponse> => {
  const searchParams = buildSearchParams({
    src: params.src,
    dst: params.dst,
    amount: params.amount,
    from: params.from,
    slippage: params.slippage,
    disableEstimate: params.disableEstimate,
    includeTokensInfo: params.includeTokensInfo,
    includeProtocols: params.includeProtocols,
    includeGas: params.includeGas,
  });

  const url = `${ONE_INCH_API_BASE}/${chainId}/swap?${searchParams.toString()}`;
  return fetch1inchApi<OneInchSwapResponse>(url, "swap");
};
