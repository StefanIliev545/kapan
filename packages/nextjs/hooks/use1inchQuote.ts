import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Address } from "viem";
import { fetch1inchSwap, OneInchSwapResponse } from "../utils/1inch";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";
import { is1inchSupported } from "../utils/chainFeatures";

type Use1inchQuoteProps = {
    chainId: number;
    src: Address;
    dst: Address;
    amount: string; // Raw amount
    from: Address; // Adapter address
    slippage?: number;
    enabled?: boolean;
};

export const use1inchQuote = ({
    chainId,
    src,
    dst,
    amount,
    from,
    slippage = 1,
    enabled = true,
}: Use1inchQuoteProps) => {
    const [debouncedAmount] = useDebounceValue(amount, 500);
    
    // Check if 1inch is supported on this chain - this is the ultimate failsafe
    const chainSupported = is1inchSupported(chainId);
    const isEnabled = chainSupported && enabled && BigInt(debouncedAmount || "0") > 0n && !!src && !!dst && !!from;

    return useQuery<OneInchSwapResponse, Error>({
        queryKey: ["1inch-quote", chainId, src, dst, debouncedAmount, from, slippage],
        queryFn: async () => {
            // Double-check chain support before making request
            if (!is1inchSupported(chainId)) {
                throw new Error(`1inch is not supported on chain ${chainId}`);
            }
            try {
                return await fetch1inchSwap(
                    getEffectiveChainId(chainId),
                    {
                        src,
                        dst,
                        amount: debouncedAmount,
                        from,
                        slippage,
                        disableEstimate: true, // Always disable for adapter flow
                    }
                );
            } catch (e) {
                console.error("1inch API Error:", e);
                throw e;
            }
        },
        enabled: isEnabled,
        refetchInterval: 10000, // Poll every 10s
        retry: false,
    });
};
