import { useQuery } from "@tanstack/react-query";
import { useDebounceValue } from "usehooks-ts";
import { getEffectiveChainId } from "../utils/forkChain";
import { PendleConvertParams, PendleConvertResponse, fetchPendleConvert } from "../utils/pendle";
import { isPendleSupported } from "../utils/chainFeatures";
import { queryOptions, queryKeys, DebounceTiming, isQueryEnabled } from "../lib/queryConfig";

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
    const [debouncedAmounts] = useDebounceValue(params.amountsIn, DebounceTiming.FAST);

    // Check chain support and use debounced amounts for consistency
    const chainSupported = isPendleSupported(chainId);
    const hasTokensIn = Array.isArray(params.tokensIn) ? params.tokensIn.length > 0 : !!params.tokensIn;
    const hasTokensOut = Array.isArray(params.tokensOut) ? params.tokensOut.length > 0 : !!params.tokensOut;
    const isReady = isQueryEnabled(
        chainSupported,
        enabled,
        params.receiver,
        hasPositiveAmount(debouncedAmounts),
        hasTokensIn,
        hasTokensOut
    );

    return useQuery<PendleConvertResponse, Error>({
        queryKey: queryKeys.pendleConvert(
            chainId,
            params.receiver,
            params.tokensIn,
            params.tokensOut,
            debouncedAmounts,
            params.slippage
        ),
        queryFn: () =>
            fetchPendleConvert(getEffectiveChainId(chainId), {
                ...params,
                amountsIn: debouncedAmounts,
            }),
        enabled: isReady,
        ...queryOptions.quote,
    });
};
