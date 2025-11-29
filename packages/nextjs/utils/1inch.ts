import { Address } from "viem";

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
    console.log(`1inch response: ${JSON.stringify(json)}`);
    if (json.error) {
        throw new Error(json.description || json.error);
    }
    return json;
};
