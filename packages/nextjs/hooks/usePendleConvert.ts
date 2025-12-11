import { useQuery } from "@tanstack/react-query";
import { useDebounceValue } from "usehooks-ts";
import { getEffectiveChainId } from "../utils/forkChain";
import { PendleConvertParams, PendleConvertResponse, fetchPendleConvert } from "../utils/pendle";

type UsePendleConvertProps = PendleConvertParams & {
    chainId: number;
    enabled?: boolean;
};

const hasPositiveAmount = (amounts: string | string[]): boolean => {
    if (Array.isArray(amounts)) {
        return amounts.some(amount => {
            try {
                return BigInt(amount || "0") > 0n;
            } catch {
                return false;
            }
        });
    }

    try {
        return BigInt(amounts || "0") > 0n;
    } catch {
        return false;
    }
};

export const usePendleConvert = ({
    chainId,
    enabled = true,
    ...params
}: UsePendleConvertProps) => {
    const [debouncedAmounts] = useDebounceValue(params.amountsIn, 400);

    const isReady =
        enabled &&
        !!params.receiver &&
        hasPositiveAmount(params.amountsIn) &&
        (Array.isArray(params.tokensIn) ? params.tokensIn.length > 0 : !!params.tokensIn) &&
        (Array.isArray(params.tokensOut) ? params.tokensOut.length > 0 : !!params.tokensOut);

    return useQuery<PendleConvertResponse, Error>({
        queryKey: [
            "pendle-convert",
            chainId,
            params.receiver,
            JSON.stringify(params.tokensIn),
            JSON.stringify(params.tokensOut),
            JSON.stringify(debouncedAmounts),
            params.slippage,
            params.enableAggregator,
            params.aggregators,
        ],
        queryFn: () =>
            fetchPendleConvert(getEffectiveChainId(chainId), {
                ...params,
                amountsIn: debouncedAmounts,
            }),
        enabled: isReady,
        refetchInterval: 10000,
        retry: false,
    });
};
