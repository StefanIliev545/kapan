import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchQuote, OneInchQuoteResponse } from "../utils/1inch";
import { fetchKyberQuote } from "../utils/kyber";
import { fetchPendleConvert } from "../utils/pendle";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";
import { is1inchSupported, isKyberSupported, isPendleSupported } from "../utils/chainFeatures";
import { queryOptions, queryKeys, DebounceTiming, hasValidAmount, isQueryEnabled } from "../lib/queryConfig";
import { logger } from "../utils/logger";

type Use1inchQuoteOnlyProps = {
    chainId: number;
    src: Address;
    dst: Address;
    amount: string; // Raw amount
    enabled?: boolean;
};

/**
 * Hook to fetch a 1inch quote (exchange rate only, no tx data).
 * Does not require a `from` address.
 */
export const use1inchQuoteOnly = ({
    chainId,
    src,
    dst,
    amount,
    enabled = true,
}: Use1inchQuoteOnlyProps) => {
    const [debouncedAmount] = useDebounceValue(amount, DebounceTiming.STANDARD);

    // Check if any aggregator is supported on this chain
    const anyAggregatorSupported = is1inchSupported(chainId) || isKyberSupported(chainId) || isPendleSupported(chainId);
    const isEnabled = isQueryEnabled(anyAggregatorSupported, enabled, hasValidAmount(debouncedAmount), src, dst);

    return useQuery<OneInchQuoteResponse, Error>({
        queryKey: queryKeys.oneInchQuoteOnly(chainId, src, dst, debouncedAmount),
        queryFn: async () => {
            const effectiveChainId = getEffectiveChainId(chainId);

            // Try Kyber first (more reliable API)
            if (isKyberSupported(chainId)) {
                try {
                    const kyberResponse = await fetchKyberQuote(effectiveChainId, {
                        tokenIn: src,
                        tokenOut: dst,
                        amountIn: debouncedAmount,
                    });

                    // Convert Kyber response to 1inch-compatible format
                    return {
                        dstAmount: kyberResponse.routeSummary.amountOut,
                        srcToken: { address: src },
                        dstToken: { address: dst },
                    } as unknown as OneInchQuoteResponse;
                } catch (kyberError) {
                    logger.warn("Kyber Quote failed, trying 1inch fallback:", kyberError);
                }
            }

            // Fallback to 1inch
            if (is1inchSupported(chainId)) {
                try {
                    return await fetch1inchQuote(effectiveChainId, {
                        src,
                        dst,
                        amount: debouncedAmount,
                    });
                } catch (e) {
                    logger.warn("1inch Quote failed, trying Pendle fallback:", e);
                }
            }

            // Fallback to Pendle aggregator (for Pendle tokens)
            if (isPendleSupported(chainId)) {
                try {
                    // Use a placeholder receiver since we only need the quote amount
                    const pendleResponse = await fetchPendleConvert(effectiveChainId, {
                        receiver: "0x0000000000000000000000000000000000000001",
                        tokensIn: src,
                        tokensOut: dst,
                        amountsIn: debouncedAmount,
                        slippage: 0.01,
                        enableAggregator: true,
                    });

                    return {
                        dstAmount: pendleResponse.data.amountTokenOut || pendleResponse.data.amountPtOut || "0",
                        srcToken: { address: src },
                        dstToken: { address: dst },
                    } as unknown as OneInchQuoteResponse;
                } catch (pendleError) {
                    logger.error("Pendle fallback also failed:", pendleError);
                }
            }

            throw new Error("Failed to fetch quote from any aggregator");
        },
        enabled: isEnabled,
        ...queryOptions.quote,
        // Override refetch interval to be slightly longer for quote-only (no tx data needed)
        refetchInterval: 15000,
    });
};
