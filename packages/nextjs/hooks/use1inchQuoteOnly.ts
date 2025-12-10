import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchQuote, OneInchQuoteResponse } from "../utils/1inch";
import { getEffectiveChainId } from "../utils/forkChain";
import { useDebounceValue } from "usehooks-ts";

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
    const isEnabled = enabled && BigInt(debouncedAmount || "0") > 0n && !!src && !!dst;

    return useQuery<OneInchQuoteResponse, Error>({
        queryKey: ["1inch-quote-only", chainId, src, dst, debouncedAmount],
        queryFn: async () => {
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

