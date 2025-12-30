import { Address } from "viem";
import { logger } from "./logger";

export const ONE_INCH_API_BASE = "/api/1inch";

export type OneInchToken = {
    address: Address;
    symbol: string;
    decimals: number;
    name: string;
    logoURI: string;
};

export type OneInchQuoteParams = {
    src: Address;
    dst: Address;
    amount: string;
    from?: Address; // Adapter address
    slippage?: number; // 1 = 1%
    disableEstimate?: boolean;
    includeTokensInfo?: boolean;
    includeProtocols?: boolean;
    includeGas?: boolean;
};

export type OneInchSwapResponse = {
    dstAmount: string;
    srcAmount?: string;
    // USD values (if available)
    srcUSD?: string;
    dstUSD?: string;
    // Gas estimates
    gas?: number;
    // Protocols/routes used
    protocols?: Array<Array<Array<{ name: string; part: number; fromTokenAddress: string; toTokenAddress: string }>>>;
    tx: {
        from: Address;
        to: Address;
        data: `0x${string}`;
        value: string;
        gas: number;
        gasPrice: string;
    };
    error?: string;
    description?: string;
};

export type OneInchQuoteResponse = {
    dstAmount: string;
    srcAmount?: string;
    // USD values
    srcUSD?: string;
    dstUSD?: string;
    // Gas estimate
    gas?: number;
    // Token info (if includeTokensInfo=true)
    srcToken?: OneInchToken;
    dstToken?: OneInchToken;
    // Protocols/routes
    protocols?: Array<Array<Array<{ name: string; part: number; fromTokenAddress: string; toTokenAddress: string }>>>;
    error?: string;
    description?: string;
};

// Fetch a quote (no tx data, no from address required)
export const fetch1inchQuote = async (
    chainId: number,
    params: { src: Address; dst: Address; amount: string; includeGas?: boolean }
): Promise<OneInchQuoteResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.append("src", params.src);
    searchParams.append("dst", params.dst);
    searchParams.append("amount", params.amount);
    if (params.includeGas) searchParams.append("includeGas", "true");

    const url = `${ONE_INCH_API_BASE}/${chainId}/quote?${searchParams.toString()}`;

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
        },
    });

    const json = await response.json();
    logger.debug(`1inch quote response: ${JSON.stringify(json)}`);
    if (json.error) {
        throw new Error(json.description || json.error);
    }
    return json;
};

// Fetch swap data (requires from address for tx.data)
export const fetch1inchSwap = async (
    chainId: number,
    params: OneInchQuoteParams
): Promise<OneInchSwapResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.append("src", params.src);
    searchParams.append("dst", params.dst);
    searchParams.append("amount", params.amount);
    if (params.from) searchParams.append("from", params.from);
    if (params.slippage) searchParams.append("slippage", params.slippage.toString());
    if (params.disableEstimate !== undefined) searchParams.append("disableEstimate", params.disableEstimate.toString());

    const url = `${ONE_INCH_API_BASE}/${chainId}/swap?${searchParams.toString()}`;

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
        },
    });

    const json = await response.json();
    logger.debug(`1inch response: ${JSON.stringify(json)}`);
    if (json.error) {
        throw new Error(json.description || json.error);
    }
    return json;
};
