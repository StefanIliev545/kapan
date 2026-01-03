import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { isChainSupported } from "~~/utils/cow";
import { logger } from "~~/utils/logger";

/**
 * CoW Protocol quote response
 */
export interface CowQuoteResponse {
  quote: {
    sellToken: string;
    buyToken: string;
    receiver: string;
    sellAmount: string;
    buyAmount: string;
    validTo: number;
    appData: string;
    feeAmount: string;
    kind: string;
    partiallyFillable: boolean;
    sellTokenBalance: string;
    buyTokenBalance: string;
  };
  from: string;
  expiration: string;
  id: number;
}

export interface UseCowQuoteParams {
  /** Token being sold */
  sellToken: string;
  /** Token being bought */
  buyToken: string;
  /** Amount to sell (in wei) */
  sellAmount: string;
  /** Address that will sign the order */
  from: string;
  /** Whether the quote is enabled */
  enabled?: boolean;
}

/**
 * Hook to fetch a quote from CoW Protocol API
 * 
 * @example
 * ```tsx
 * const { data: cowQuote, isLoading } = useCowQuote({
 *   sellToken: debtAddress,
 *   buyToken: collateralAddress,
 *   sellAmount: "1000000000000000000", // 1 token in wei
 *   from: userAddress,
 *   enabled: true,
 * });
 * 
 * // cowQuote.quote.buyAmount is the expected output
 * ```
 */
export function useCowQuote({
  sellToken,
  buyToken,
  sellAmount,
  from,
  enabled = true,
}: UseCowQuoteParams) {
  const chainId = useChainId();

  return useQuery({
    queryKey: ["cow-quote", chainId, sellToken, buyToken, sellAmount, from],
    queryFn: async (): Promise<CowQuoteResponse | null> => {
      if (!sellToken || !buyToken || !sellAmount || sellAmount === "0" || !from) {
        return null;
      }

      try {
        // Use our Next.js API proxy to bypass browser-level interference
        // (ad blockers, VPNs, corporate proxies can block direct CoW API calls)
        const proxyUrl = `/api/cow/${chainId}/quote`;
        
        const response = await fetch(proxyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sellToken,
            buyToken,
            sellAmountBeforeFee: sellAmount,
            from,
            kind: "sell",
            receiver: from,
            appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
            appDataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            signingScheme: "eip1271",
            onchainOrder: false,
            partiallyFillable: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.warn("[useCowQuote] Quote failed:", response.status, errorText);
          return null;
        }

        const data = await response.json();
        return data as CowQuoteResponse;
      } catch (error) {
        logger.error("[useCowQuote] Error fetching quote:", error);
        return null;
      }
    },
    enabled: enabled && !!sellToken && !!buyToken && !!sellAmount && sellAmount !== "0" && !!from && isChainSupported(chainId),
    staleTime: 10000, // 10 seconds
    refetchInterval: 15000, // Refresh every 15 seconds
  });
}

/**
 * Extract the buy amount from a CoW quote
 */
export function getCowQuoteBuyAmount(quote: CowQuoteResponse | null | undefined): bigint {
  if (!quote?.quote?.buyAmount) return 0n;
  return BigInt(quote.quote.buyAmount);
}

/**
 * Extract the fee amount from a CoW quote
 */
export function getCowQuoteFeeAmount(quote: CowQuoteResponse | null | undefined): bigint {
  if (!quote?.quote?.feeAmount) return 0n;
  return BigInt(quote.quote.feeAmount);
}
