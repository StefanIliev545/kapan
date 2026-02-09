import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchSwap, OneInchSwapResponse } from "../utils/1inch";
import { fetchKyberSwap } from "../utils/kyber";
import { fetchPendleConvert } from "../utils/pendle";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";
import { is1inchSupported, isKyberSupported, isPendleSupported } from "../utils/chainFeatures";
import { queryOptions, queryKeys, DebounceTiming, hasValidAmount, isQueryEnabled } from "../lib/queryConfig";
import { logger } from "../utils/logger";

type Use1inchQuoteProps = {
    chainId: number;
    src: Address;
    dst: Address;
    amount: string; // Raw amount
    from: Address; // Adapter address
    slippage?: number;
    enabled?: boolean;
    preferredRouter?: "kyber" | "1inch"; // Which aggregator to use (affects swap data encoding)
};

export const use1inchQuote = ({
    chainId,
    src,
    dst,
    amount,
    from,
    slippage = 1,
    enabled = true,
    preferredRouter = "kyber", // Default to kyber for backwards compatibility
}: Use1inchQuoteProps) => {
    const [debouncedAmount] = useDebounceValue(amount, DebounceTiming.STANDARD);

    // Check if any aggregator is supported on this chain (1inch, Kyber, or Pendle fallback)
    const anyAggregatorSupported = is1inchSupported(chainId) || isKyberSupported(chainId) || isPendleSupported(chainId);
    const isEnabled = isQueryEnabled(anyAggregatorSupported, enabled, hasValidAmount(debouncedAmount), src, dst, from);

    return useQuery<OneInchSwapResponse, Error>({
        queryKey: queryKeys.oneInchQuote(chainId, src, dst, debouncedAmount, from, slippage, preferredRouter),
        queryFn: async () => {
            const effectiveChainId = getEffectiveChainId(chainId);

            // Try preferred router first, with fallback to alternatives
            let kyberFailed = false;

            if (preferredRouter === "kyber" && isKyberSupported(chainId)) {
                try {
                    const kyberResponse = await fetchKyberSwap(effectiveChainId, {
                        tokenIn: src,
                        tokenOut: dst,
                        amountIn: debouncedAmount,
                        sender: from,
                        recipient: from,
                        slippageTolerance: slippage * 100, // Kyber uses basis points (100 = 1%)
                    });

                    // Convert Kyber response to 1inch-compatible format
                    return {
                        dstAmount: kyberResponse.amountOut,
                        srcToken: { address: src },
                        dstToken: { address: dst },
                        tx: {
                            to: kyberResponse.routerAddress,
                            data: kyberResponse.data,
                            value: "0",
                            from: from,
                            gas: parseInt(kyberResponse.gas),
                            gasPrice: "0",
                        },
                    } as unknown as OneInchSwapResponse;
                } catch (kyberError) {
                    logger.warn("Kyber Swap failed, trying 1inch fallback:", kyberError);
                    kyberFailed = true;
                }
            }

            // Try 1inch if preferred, or as fallback when Kyber failed or isn't supported
            if ((preferredRouter === "1inch" || kyberFailed || !isKyberSupported(chainId)) && is1inchSupported(chainId)) {
                try {
                    return await fetch1inchSwap(effectiveChainId, {
                        src,
                        dst,
                        amount: debouncedAmount,
                        from,
                        slippage,
                        disableEstimate: true,
                        includeTokensInfo: true,
                    });
                } catch (e) {
                    logger.warn("1inch Swap failed:", e);
                }
            }

            // Fallback to Pendle aggregator (for Pendle tokens)
            if (isPendleSupported(chainId)) {
                try {
                    const pendleResponse = await fetchPendleConvert(effectiveChainId, {
                        receiver: from,
                        tokensIn: src,
                        tokensOut: dst,
                        amountsIn: debouncedAmount,
                        slippage: slippage / 100, // Pendle uses decimal (0.01 = 1%)
                        enableAggregator: true,
                    });

                    // Convert Pendle response to 1inch-compatible format
                    return {
                        dstAmount: pendleResponse.data.amountTokenOut || pendleResponse.data.amountPtOut || "0",
                        srcToken: { address: src },
                        dstToken: { address: dst },
                        tx: {
                            to: pendleResponse.transaction.to,
                            data: pendleResponse.transaction.data,
                            value: pendleResponse.transaction.value || "0",
                            from: pendleResponse.transaction.from || from,
                        },
                    } as unknown as OneInchSwapResponse;
                } catch (pendleError) {
                    logger.error("Pendle fallback also failed:", pendleError);
                }
            }

            throw new Error("Failed to fetch swap quote from any aggregator");
        },
        enabled: isEnabled,
        ...queryOptions.quote,
    });
};
