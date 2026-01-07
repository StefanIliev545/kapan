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
  /** Amount to sell (in wei) - use for kind="sell" */
  sellAmount?: string;
  /** Amount to buy (in wei) - use for kind="buy" */
  buyAmount?: string;
  /** Order kind: "sell" (exact sell, min buy) or "buy" (exact buy, max sell) */
  kind?: "sell" | "buy";
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
  buyAmount,
  kind = "sell",
  from,
  enabled = true,
}: UseCowQuoteParams) {
  const chainId = useChainId();

  // Determine the amount based on kind
  const amount = kind === "buy" ? buyAmount : sellAmount;

  return useQuery({
    queryKey: ["cow-quote", chainId, sellToken, buyToken, amount, kind, from],
    queryFn: async (): Promise<CowQuoteResponse | null> => {
      if (!sellToken || !buyToken || !amount || amount === "0" || !from) {
        return null;
      }

      try {
        // Use our Next.js API proxy to bypass browser-level interference
        // (ad blockers, VPNs, corporate proxies can block direct CoW API calls)
        const proxyUrl = `/api/cow/${chainId}/quote`;
        
        // Build request body based on order kind
        // - kind="sell": specify sellAmountBeforeFee, get buyAmount
        // - kind="buy": specify buyAmountAfterFee, get sellAmount
        const requestBody: Record<string, unknown> = {
          sellToken,
          buyToken,
          from,
          kind,
          receiver: from,
          // appData must be valid JSON string, appDataHash is the keccak256 of it
          appData: "{\"version\":\"1.0.0\",\"metadata\":{}}",
          signingScheme: "eip1271",
          onchainOrder: false,
          partiallyFillable: false,
        };

        if (kind === "buy") {
          requestBody.buyAmountAfterFee = amount;
        } else {
          requestBody.sellAmountBeforeFee = amount;
        }
        
        const response = await fetch(proxyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
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
    enabled: enabled && !!sellToken && !!buyToken && !!amount && amount !== "0" && !!from && isChainSupported(chainId),
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
 * Extract the sell amount from a CoW quote (useful for KIND_BUY quotes)
 */
export function getCowQuoteSellAmount(quote: CowQuoteResponse | null | undefined): bigint {
  if (!quote?.quote?.sellAmount) return 0n;
  return BigInt(quote.quote.sellAmount);
}

/**
 * Extract the fee amount from a CoW quote
 */
export function getCowQuoteFeeAmount(quote: CowQuoteResponse | null | undefined): bigint {
  if (!quote?.quote?.feeAmount) return 0n;
  return BigInt(quote.quote.feeAmount);
}
