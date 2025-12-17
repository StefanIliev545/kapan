import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchQuote, OneInchQuoteResponse } from "../utils/1inch";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";
import { is1inchSupported } from "../utils/chainFeatures";

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
    const [debouncedAmount] = useDebounceValue(amount, 500);
    
    // Check if 1inch is supported on this chain
    const chainSupported = is1inchSupported(chainId);
    const isEnabled = chainSupported && enabled && BigInt(debouncedAmount || "0") > 0n && !!src && !!dst;

    return useQuery<OneInchQuoteResponse, Error>({
        queryKey: ["1inch-quote-only", chainId, src, dst, debouncedAmount],
        queryFn: async () => {
            if (!is1inchSupported(chainId)) {
                throw new Error(`1inch is not supported on chain ${chainId}`);
            }
            try {
                return await fetch1inchQuote(
                    getEffectiveChainId(chainId),
                    {
                        src,
                        dst,
                        amount: debouncedAmount,
                    }
                );
            } catch (e) {
                console.error("1inch Quote API Error:", e);
                throw e;
            }
        },
        enabled: isEnabled,
        refetchInterval: 15000, // Poll every 15s
        retry: false,
    });
};

