import { NextRequest, NextResponse } from "next/server";
import { getKyberChainName } from "~~/utils/kyber";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chainId: string }> }
) {
    const { chainId } = await params;
    const searchParams = request.nextUrl.searchParams;

    const chainIdNum = parseInt(chainId);
    const kyberChain = getKyberChainName(chainIdNum);

    console.log(`Kyber Quote Proxy: chain=${chainId} (${kyberChain}), params=${searchParams.toString()}`);

    if (!kyberChain) {
        return NextResponse.json(
            { error: `Kyber does not support chain ${chainId}` },
            { status: 400 }
        );
    }

    // Build Kyber API URL
    // Kyber uses: https://aggregator-api.kyberswap.com/{chain}/api/v1/routes
    const kyberParams = new URLSearchParams();
    kyberParams.set("tokenIn", searchParams.get("tokenIn") || "");
    kyberParams.set("tokenOut", searchParams.get("tokenOut") || "");
    kyberParams.set("amountIn", searchParams.get("amountIn") || "");

    // Optional params
    if (searchParams.get("saveGas")) kyberParams.set("saveGas", searchParams.get("saveGas") ?? "");
    if (searchParams.get("includedSources")) kyberParams.set("includedSources", searchParams.get("includedSources") ?? "");
    if (searchParams.get("excludedSources")) kyberParams.set("excludedSources", searchParams.get("excludedSources") ?? "");

    const url = `https://aggregator-api.kyberswap.com/${kyberChain}/api/v1/routes?${kyberParams.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
            },
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.error("Kyber Quote: Invalid JSON response:", text.slice(0, 200));
            return NextResponse.json(
                { error: "Kyber API returned invalid response", details: text.slice(0, 200) },
                { status: 500 }
            );
        }

        if (!response.ok) {
            console.error(`Kyber Quote Error: ${JSON.stringify(data)}`);
            return NextResponse.json({
                error: data.error || data.message || "Kyber API error",
                message: data.message || data.error,
            }, { status: response.status });
        }

        // Return the data structure (Kyber returns { code, message, data: { routeSummary, routerAddress } })
        if (data.code !== 0) {
            return NextResponse.json({
                error: data.message || "Kyber routing failed",
                message: data.message,
            }, { status: 400 });
        }

        return NextResponse.json({
            routeSummary: data.data.routeSummary,
            routerAddress: data.data.routerAddress,
        });
    } catch (error) {
        console.error("Kyber Quote Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch from Kyber API" },
            { status: 500 }
        );
    }
}
