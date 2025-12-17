import { Address, Hex, encodeAbiParameters } from "viem";
import { ProtocolInstruction } from "./v2/instructionHelpers";

export const PENDLE_API_BASE = "/api/pendle";

export type PendleConvertParams = {
    receiver: Address;
    tokensIn: Address | Address[];
    tokensOut: Address | Address[];
    amountsIn: string | string[];
    slippage?: number;
    enableAggregator?: boolean;
    aggregators?: string | string[];
    deadline?: number;
};

export type PendleConvertTransaction = {
    to: Address;
    data: Hex;
    from?: Address;
    value?: string;
    gas?: string;
};

export type PendleConvertData = {
    amountPtOut?: string;
    amountTokenOut?: string;
    minPtOut?: string;
    minTokenOut?: string;
};

// Normalized response type (converted from raw API response)
export type PendleConvertResponse = {
    transaction: PendleConvertTransaction;
    data: PendleConvertData;
};

// Raw API response types (v2 API structure)
type PendleRouteOutput = {
    token: Address;
    amount: string;
};

type PendleRoute = {
    tx: {
        data: Hex;
        to: Address;
        from: Address;
    };
    outputs: PendleRouteOutput[];
    contractParamInfo?: {
        method: string;
        contractCallParams: unknown[];
    };
};

type PendleRawResponse = {
    action: string;
    routes: PendleRoute[];
};

const appendValue = (searchParams: URLSearchParams, key: string, value?: string | number | boolean | string[]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, v));
        return;
    }

    searchParams.append(key, value.toString());
};

export const fetchPendleConvert = async (
    chainId: number,
    params: PendleConvertParams
): Promise<PendleConvertResponse> => {
    const searchParams = new URLSearchParams();

    appendValue(searchParams, "receiver", params.receiver);
    appendValue(searchParams, "slippage", params.slippage);
    appendValue(searchParams, "enableAggregator", params.enableAggregator);
    appendValue(searchParams, "deadline", params.deadline);

    appendValue(searchParams, "tokensIn", Array.isArray(params.tokensIn) ? params.tokensIn : [params.tokensIn]);
    appendValue(searchParams, "tokensOut", Array.isArray(params.tokensOut) ? params.tokensOut : [params.tokensOut]);
    appendValue(searchParams, "amountsIn", Array.isArray(params.amountsIn) ? params.amountsIn : [params.amountsIn]);
    appendValue(searchParams, "aggregators", params.aggregators);
    appendValue(searchParams, "enableAggregator", "true");

    const url = `${PENDLE_API_BASE}/${chainId}/convert?${searchParams.toString()}`;

    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
        },
    });

    const json = await response.json();

    if (!response.ok || (json as { error?: string }).error) {
        const error = json as { error?: string; description?: string; message?: string };
        throw new Error(error.error || error.description || error.message || "Pendle convert request failed");
    }

    // Transform raw API response to normalized format
    const raw = json as PendleRawResponse;
    
    if (!raw.routes || raw.routes.length === 0) {
        throw new Error("Pendle API returned no routes");
    }

    const bestRoute = raw.routes[0];
    const outputAmount = bestRoute.outputs?.[0]?.amount || "0";

    return {
        transaction: {
            to: bestRoute.tx.to,
            data: bestRoute.tx.data,
            from: bestRoute.tx.from,
        },
        data: {
            amountTokenOut: outputAmount,
            amountPtOut: outputAmount, // Use same value for compatibility
        },
    } as PendleConvertResponse;
};

export const encodePendleContext = (tokenOut: Address, minAmountOut: bigint, callData: Hex): Hex => {
    return encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
        [tokenOut, minAmountOut, callData]
    );
};

export type BuildPendleInstructionParams = PendleConvertParams & {
    chainId: number;
    tokenOut: Address;
    minAmountOut?: string | bigint;
    tokensOutOverride?: Address | Address[];
};

export const buildPendleInstruction = async ({
    chainId,
    tokenOut,
    minAmountOut,
    tokensOutOverride,
    ...convertParams
}: BuildPendleInstructionParams): Promise<{ instruction: ProtocolInstruction; response: PendleConvertResponse }> => {
    const response = await fetchPendleConvert(chainId, {
        ...convertParams,
        tokensOut: tokensOutOverride ?? convertParams.tokensOut,
    });

    const effectiveMinOut =
        minAmountOut ??
        response.data.minPtOut ??
        response.data.minTokenOut ??
        response.data.amountPtOut ??
        response.data.amountTokenOut;

    if (!effectiveMinOut) {
        throw new Error("Pendle convert response missing output amount");
    }

    const context = encodePendleContext(tokenOut, BigInt(effectiveMinOut), response.transaction.data);

    return {
        instruction: {
            protocolName: "pendle",
            data: context,
        },
        response,
    };
};
