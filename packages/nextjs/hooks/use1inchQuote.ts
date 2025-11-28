import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetch1inchSwap, OneInchSwapResponse } from "../utils/1inch";
import { useDebounceValue } from "usehooks-ts";

type Use1inchQuoteProps = {
    chainId: number;
    src: Address;
    dst: Address;
    amount: string; // Raw amount
    from: Address; // Adapter address
    slippage?: number;
    enabled?: boolean;
    apiKey?: string;
};

export const use1inchQuote = ({
    chainId,
    src,
    dst,
    amount,
    from,
    slippage = 1,
    enabled = true,
    apiKey,
}: Use1inchQuoteProps) => {
    const [debouncedAmount] = useDebounceValue(amount, 500);

    return useQuery<OneInchSwapResponse, Error>({
        queryKey: ["1inch-quote", chainId, src, dst, debouncedAmount, from, slippage],
        queryFn: async () => {
            if (!apiKey) throw new Error("API Key missing");
            try {
                return await fetch1inchSwap(
                    chainId === 31337 ? 42161 : chainId,
                    {
                        src,
                        dst,
                        amount: debouncedAmount,
                        from,
                        slippage,
                        disableEstimate: true, // Always disable for adapter flow
                    },
                    apiKey
                );
            } catch (e) {
                console.error("1inch API Error:", e);
                throw e;
            }
        },
        enabled: enabled && !!apiKey && BigInt(debouncedAmount || "0") > 0n && !!src && !!dst && !!from,
        refetchInterval: 10000, // Poll every 10s
        retry: false,
    });
};
