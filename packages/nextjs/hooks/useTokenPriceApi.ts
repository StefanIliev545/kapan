/**
 * @deprecated Use useTokenPrice from '~~/hooks/useTokenPrice' instead.
 *
 * This file is maintained for backward compatibility.
 * The new useTokenPrice hook provides better caching via React Query
 * and additional features like batch fetching.
 */

import { useTokenPrice } from "./useTokenPrice";

/**
 * @deprecated Use useTokenPrice from '~~/hooks/useTokenPrice' instead.
 *
 * This hook fetches the price of a token by symbol.
 * It's a thin wrapper around the new useTokenPrice hook for backward compatibility.
 *
 * @param symbol - Token symbol (e.g., "ETH", "USDC")
 */
export function useTokenPriceApi(symbol: string) {
  const result = useTokenPrice(symbol);

  return {
    status: result.isLoading ? "loading" : result.isSuccess ? "success" : result.isError ? "error" : "idle",
    price: result.price,
    error: result.error ?? undefined,
    isLoading: result.isLoading,
    isError: result.isError,
    isSuccess: result.isSuccess,
    refetch: result.refetch,
  };
}
