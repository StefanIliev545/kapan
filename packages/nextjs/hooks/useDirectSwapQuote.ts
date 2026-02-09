import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchSwap, OneInchSwapResponse } from "../utils/1inch";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";
import { is1inchSupported } from "../utils/chainFeatures";
import { queryOptions, DebounceTiming, hasValidAmount, isQueryEnabled } from "../lib/queryConfig";

interface UseDirectSwapQuoteProps {
  chainId: number;
  src: Address;
  dst: Address;
  amount: string; // Raw amount (in token decimals)
  userAddress: Address; // User's wallet address (not router)
  slippage?: number;
  enabled?: boolean;
}

/**
 * Hook for getting 1inch swap quote for direct wallet swaps
 * Unlike use1inchQuote which is designed for router-based swaps,
 * this hook uses the user's wallet address directly
 */
export function useDirectSwapQuote({
  chainId,
  src,
  dst,
  amount,
  userAddress,
  slippage = 1,
  enabled = true,
}: UseDirectSwapQuoteProps) {
  const [debouncedAmount] = useDebounceValue(amount, DebounceTiming.STANDARD);

  // Check if 1inch is supported on this chain
  const chainSupported = is1inchSupported(chainId);
  const isEnabled = isQueryEnabled(
    chainSupported,
    enabled,
    hasValidAmount(debouncedAmount),
    src,
    dst,
    userAddress
  );

  return useQuery<OneInchSwapResponse, Error>({
    queryKey: ["direct-swap-quote", chainId, src, dst, debouncedAmount, userAddress, slippage],
    queryFn: async () => {
      if (!is1inchSupported(chainId)) {
        throw new Error(`1inch is not supported on chain ${chainId}`);
      }
      try {
        return await fetch1inchSwap(getEffectiveChainId(chainId), {
          src,
          dst,
          amount: debouncedAmount,
          from: userAddress,
          slippage,
          disableEstimate: true, // Disable estimate to avoid allowance requirement
          includeTokensInfo: true,
          includeGas: true,
        });
      } catch (e) {
        console.error("[useDirectSwapQuote] 1inch API Error:", e);
        throw e;
      }
    },
    enabled: isEnabled,
    ...queryOptions.quote,
  });
}
