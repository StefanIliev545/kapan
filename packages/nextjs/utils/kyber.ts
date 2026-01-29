import { Address } from "viem";
import { logger } from "./logger";
import { withRetry, isNetworkError, isRateLimitError } from "./retry";

export const KYBER_API_BASE = "/api/kyber";

export type KyberToken = {
  address: Address;
  symbol: string;
  decimals: number;
  name: string;
  logoURI?: string;
};

export type KyberQuoteParams = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  saveGas?: boolean;
  includedSources?: string;
  excludedSources?: string;
};

export type KyberSwapParams = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  sender: Address; // The address that will execute the swap (adapter)
  recipient: Address; // The address to receive the output tokens
  slippageTolerance?: number; // In basis points (50 = 0.5%)
  deadline?: number; // Unix timestamp
  saveGas?: boolean;
};

// Route returned by Kyber's routing API
export type KyberRoute = {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  swapAmount: string;
  amountOut: string;
  limitReturnAmount: string;
  exchange: string;
  poolLength: number;
  poolType: string;
  extra: string;
};

export type KyberQuoteResponse = {
  routeSummary: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    amountInUsd: string;
    amountOutUsd: string;
    gas: string;
    gasPrice: string;
    gasUsd: string;
    route: KyberRoute[][];
  };
  routerAddress: string;
  error?: string;
  message?: string;
};

export type KyberSwapResponse = {
  amountIn: string;
  amountOut: string;
  gas: string;
  gasUsd: string;
  outputChange: {
    amount: string;
    percent: number;
    level: number;
  };
  data: `0x${string}`;
  routerAddress: Address;
  error?: string;
  message?: string;
};

// Map our chain IDs to Kyber's chain identifiers
const KYBER_CHAIN_MAP: { [key: number]: string } = {
  1: "ethereum",
  42161: "arbitrum",
  10: "optimism",
  137: "polygon",
  56: "bsc",
  8453: "base",
  59144: "linea",
  43114: "avalanche",
  250: "fantom",
  324: "zksync",
  534352: "scroll",
  // Note: Kyber doesn't support Plasma (9745), Unichain (130), etc. as of Jan 2026
};

export function getKyberChainName(chainId: number): string | undefined {
  return KYBER_CHAIN_MAP[chainId];
}

/**
 * Shared fetch handler for Kyber API calls with retry support
 */
const fetchKyberApi = async <T extends { error?: string; message?: string }>(
  endpoint: string,
  logPrefix: string,
  options?: RequestInit,
): Promise<T> => {
  return withRetry(
    async () => {
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      // Handle rate limiting explicitly
      if (response.status === 429) {
        throw new Error("Kyber API rate limit exceeded");
      }

      const json = await response.json();
      logger.debug(`Kyber ${logPrefix} response: ${JSON.stringify(json)}`);
      if (json.error || json.message) {
        throw new Error(json.message || json.error);
      }
      return json;
    },
    {
      retries: 2,
      baseDelay: 1000,
      isRetryable: (error) => isNetworkError(error) || isRateLimitError(error),
      onRetry: (attempt, error, delay) => {
        logger.warn(`[Kyber ${logPrefix}] Retry ${attempt}, waiting ${delay}ms`, error);
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

/**
 * Fetch a quote from Kyber (no tx data, used for price display)
 */
export const fetchKyberQuote = async (
  chainId: number,
  params: KyberQuoteParams,
): Promise<KyberQuoteResponse> => {
  const searchParams = buildSearchParams({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    saveGas: params.saveGas ? "true" : undefined,
    includedSources: params.includedSources,
    excludedSources: params.excludedSources,
  });

  const url = `${KYBER_API_BASE}/${chainId}/quote?${searchParams.toString()}`;
  return fetchKyberApi<KyberQuoteResponse>(url, "quote");
};

/**
 * Build swap transaction data from Kyber
 * This is a two-step process:
 * 1. Get routes from /quote
 * 2. Build transaction data from /swap with the route
 */
export const fetchKyberSwap = async (
  chainId: number,
  params: KyberSwapParams,
): Promise<KyberSwapResponse> => {
  const searchParams = buildSearchParams({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    to: params.recipient,
    slippageTolerance: params.slippageTolerance ?? 50, // 0.5% default
    deadline: params.deadline,
    saveGas: params.saveGas ? "true" : undefined,
  });

  const url = `${KYBER_API_BASE}/${chainId}/swap?${searchParams.toString()}`;
  return fetchKyberApi<KyberSwapResponse>(url, "swap");
};

/**
 * Convert Kyber response to 1inch-compatible format for easier integration
 * This allows using Kyber as a drop-in fallback for 1inch
 */
export const convertKyberToOneInchFormat = (
  kyberQuote: KyberQuoteResponse,
  kyberSwap?: KyberSwapResponse,
) => {
  const { routeSummary } = kyberQuote;

  return {
    dstAmount: routeSummary.amountOut,
    srcAmount: routeSummary.amountIn,
    srcUSD: routeSummary.amountInUsd,
    dstUSD: routeSummary.amountOutUsd,
    gas: parseInt(routeSummary.gas),
    srcToken: { address: routeSummary.tokenIn as Address },
    dstToken: { address: routeSummary.tokenOut as Address },
    tx: kyberSwap ? {
      to: kyberSwap.routerAddress,
      data: kyberSwap.data,
      value: "0",
      from: undefined as Address | undefined,
      gas: parseInt(kyberSwap.gas),
      gasPrice: routeSummary.gasPrice,
    } : undefined,
  };
};
