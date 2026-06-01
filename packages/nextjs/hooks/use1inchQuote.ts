import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchSwap, OneInchSwapResponse } from "../utils/1inch";
import { fetchKyberSwap } from "../utils/kyber";
import { fetchPendleConvert } from "../utils/pendle";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";
import {
    is1inchSupported,
    isKyberSupported,
    isPendleSupported,
    getOneInchAdapterAddress,
    getKyberAdapterAddress,
    getPendleAdapterAddress,
} from "../utils/chainFeatures";
import { queryOptions, queryKeys, DebounceTiming, hasValidAmount, isQueryEnabled } from "../lib/queryConfig";
import { logger } from "../utils/logger";

export type SwapAggregator = "1inch" | "kyber" | "pendle";

// All call sites consume `OneInchSwapResponse`; we tag the winner so callers can
// route the downstream `swapRouter` (approve target) to the right on-chain adapter.
export type SwapQuoteResponse = OneInchSwapResponse & { aggregator: SwapAggregator };

type Use1inchQuoteProps = {
    chainId: number;
    src: Address;
    dst: Address;
    amount: string; // Raw amount
    from: Address; // Adapter address (used directly in legacy modes; in "best" mode the hook
                   // overrides per-racer with the aggregator-specific adapter address)
    slippage?: number;
    enabled?: boolean;
    // - "kyber" / "1inch": pin to one aggregator (caller is responsible for matching `from`
    //   to that aggregator's adapter and passing the same swapRouter to buildFlow downstream).
    // - "best": race 1inch + Kyber in parallel and return the higher dstAmount. Pendle stays a
    //   last-resort fallback (PT/YT chains). Caller should read `aggregator` off the response
    //   and feed it into the build-flow swapRouter selection.
    preferredRouter?: "kyber" | "1inch" | "best";
};

const fetchKyberQuote = async (
    chainId: number,
    src: Address,
    dst: Address,
    amount: string,
    from: Address,
    slippage: number,
): Promise<SwapQuoteResponse> => {
    const r = await fetchKyberSwap(chainId, {
        tokenIn: src,
        tokenOut: dst,
        amountIn: amount,
        sender: from,
        recipient: from,
        slippageTolerance: slippage * 100, // Kyber uses bps (100 = 1%)
    });
    return {
        dstAmount: r.amountOut,
        srcToken: { address: src },
        dstToken: { address: dst },
        // Kyber's /swap endpoint includes amountInUsd/amountOutUsd on the route summary, but
        // fetchKyberSwap currently only exposes the build-tx fields. Surfacing them as
        // srcUSD/dstUSD here keeps useAutoSlippage's price-impact calc working uniformly
        // across 1inch and Kyber wins. See utils/kyber.ts:KyberSwapResponse — extending that
        // wrapper to expose amountInUsd/amountOutUsd is a follow-up.
        tx: {
            to: r.routerAddress,
            data: r.data,
            value: "0",
            from,
            gas: parseInt(r.gas),
            gasPrice: "0",
        },
        aggregator: "kyber",
    } as unknown as SwapQuoteResponse;
};

const fetchOneInchQuote = async (
    chainId: number,
    src: Address,
    dst: Address,
    amount: string,
    from: Address,
    slippage: number,
): Promise<SwapQuoteResponse> => {
    const r = await fetch1inchSwap(chainId, {
        src,
        dst,
        amount,
        from,
        slippage,
        disableEstimate: true,
        includeTokensInfo: true,
    });
    return { ...r, aggregator: "1inch" };
};

const fetchPendleQuote = async (
    chainId: number,
    src: Address,
    dst: Address,
    amount: string,
    from: Address,
    slippage: number,
): Promise<SwapQuoteResponse> => {
    const r = await fetchPendleConvert(chainId, {
        receiver: from,
        tokensIn: src,
        tokensOut: dst,
        amountsIn: amount,
        slippage: slippage / 100, // Pendle uses decimal (0.01 = 1%)
        enableAggregator: true,
    });
    return {
        dstAmount: r.data.amountTokenOut || r.data.amountPtOut || "0",
        srcToken: { address: src },
        dstToken: { address: dst },
        tx: {
            to: r.transaction.to,
            data: r.transaction.data,
            value: r.transaction.value || "0",
            from: r.transaction.from || from,
        },
        aggregator: "pendle",
    } as unknown as SwapQuoteResponse;
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

    const anyAggregatorSupported =
        is1inchSupported(chainId) || isKyberSupported(chainId) || isPendleSupported(chainId);
    const isEnabled = isQueryEnabled(anyAggregatorSupported, enabled, hasValidAmount(debouncedAmount), src, dst, from);

    return useQuery<SwapQuoteResponse, Error>({
        queryKey: queryKeys.oneInchQuote(chainId, src, dst, debouncedAmount, from, slippage, preferredRouter),
        queryFn: async () => {
            const effectiveChainId = getEffectiveChainId(chainId);

            if (preferredRouter === "best") {
                // Race 1inch + Kyber in parallel — different routers price illiquid pairs
                // (especially alAssets, pegged-stables, and low-volume markets) very differently.
                // Each fetch uses ITS OWN adapter address as recipient, since the encoded swap
                // calldata is decoded by that aggregator-specific adapter on-chain.
                const oneInchAdapter = getOneInchAdapterAddress(chainId);
                const kyberAdapter = getKyberAdapterAddress(chainId);

                const racers: Array<Promise<SwapQuoteResponse>> = [];
                const racerNames: SwapAggregator[] = [];
                if (is1inchSupported(chainId) && oneInchAdapter) {
                    racers.push(fetchOneInchQuote(effectiveChainId, src, dst, debouncedAmount, oneInchAdapter, slippage));
                    racerNames.push("1inch");
                }
                if (isKyberSupported(chainId) && kyberAdapter) {
                    racers.push(fetchKyberQuote(effectiveChainId, src, dst, debouncedAmount, kyberAdapter, slippage));
                    racerNames.push("kyber");
                }

                if (racers.length > 0) {
                    const settled = await Promise.allSettled(racers);
                    const winners: SwapQuoteResponse[] = [];
                    settled.forEach((r, i) => {
                        if (r.status === "fulfilled") {
                            winners.push(r.value);
                        } else {
                            logger.warn(`[swap-quote race] ${racerNames[i]} failed:`, r.reason);
                        }
                    });

                    if (winners.length > 0) {
                        winners.sort((a, b) => {
                            const av = BigInt(a.dstAmount || "0");
                            const bv = BigInt(b.dstAmount || "0");
                            if (av === bv) return 0;
                            return av > bv ? -1 : 1;
                        });
                        const best = winners[0];
                        if (winners.length > 1) {
                            logger.debug(
                                `[swap-quote race] winner=${best.aggregator} dst=${best.dstAmount} | losers=` +
                                winners.slice(1).map(w => `${w.aggregator}:${w.dstAmount}`).join(","),
                            );
                        }
                        return best;
                    }
                }
                // fall through to Pendle fallback below
            } else {
                // Legacy single-router path: try preferred, then the other, then Pendle.
                let kyberFailed = false;

                if (preferredRouter === "kyber" && isKyberSupported(chainId)) {
                    try {
                        return await fetchKyberQuote(effectiveChainId, src, dst, debouncedAmount, from, slippage);
                    } catch (kyberError) {
                        logger.warn("Kyber Swap failed, trying 1inch fallback:", kyberError);
                        kyberFailed = true;
                    }
                }

                if ((preferredRouter === "1inch" || kyberFailed || !isKyberSupported(chainId)) && is1inchSupported(chainId)) {
                    try {
                        return await fetchOneInchQuote(effectiveChainId, src, dst, debouncedAmount, from, slippage);
                    } catch (e) {
                        logger.warn("1inch Swap failed:", e);
                    }
                }
            }

            // Pendle last-resort fallback (PT/YT chains). Uses the Pendle adapter as receiver
            // because Pendle's transaction calldata is decoded by PendleAdapter on-chain.
            if (isPendleSupported(chainId)) {
                try {
                    const pendleReceiver = preferredRouter === "best"
                        ? (getPendleAdapterAddress(chainId) ?? from)
                        : from;
                    return await fetchPendleQuote(effectiveChainId, src, dst, debouncedAmount, pendleReceiver, slippage);
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
