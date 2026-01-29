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

    console.log(`Kyber Swap Proxy: chain=${chainId} (${kyberChain}), params=${searchParams.toString()}`);

    if (!kyberChain) {
        return NextResponse.json(
            { error: `Kyber does not support chain ${chainId}` },
            { status: 400 }
        );
    }

    // Step 1: Get the route first
    const quoteParams = new URLSearchParams();
    quoteParams.set("tokenIn", searchParams.get("tokenIn") || "");
    quoteParams.set("tokenOut", searchParams.get("tokenOut") || "");
    quoteParams.set("amountIn", searchParams.get("amountIn") || "");
    if (searchParams.get("saveGas")) quoteParams.set("saveGas", searchParams.get("saveGas")!);

    const quoteUrl = `https://aggregator-api.kyberswap.com/${kyberChain}/api/v1/routes?${quoteParams.toString()}`;

    try {
        // Get quote/routes first
        const quoteResponse = await fetch(quoteUrl, {
            headers: { Accept: "application/json" },
        });

        const quoteText = await quoteResponse.text();
        let quoteData;
        try {
            quoteData = JSON.parse(quoteText);
        } catch {
            console.error("Kyber Quote: Invalid JSON response:", quoteText.slice(0, 200));
            return NextResponse.json(
                { error: "Kyber API returned invalid response", details: quoteText.slice(0, 200) },
                { status: 500 }
            );
        }

        if (quoteData.code !== 0 || !quoteData.data?.routeSummary) {
            console.error(`Kyber Quote Error: ${JSON.stringify(quoteData)}`);
            return NextResponse.json({
                error: quoteData.message || "Kyber routing failed",
                message: quoteData.message,
            }, { status: 400 });
        }

        // Step 2: Build the swap transaction
        const recipient = searchParams.get("to") || searchParams.get("recipient");
        const slippageTolerance = searchParams.get("slippageTolerance") || "50"; // 0.5% default (in bps)
        const deadline = searchParams.get("deadline");

        const buildBody = {
            routeSummary: quoteData.data.routeSummary,
            sender: recipient, // sender = who executes the swap (our adapter)
            recipient: recipient, // recipient = who receives output tokens
            slippageTolerance: parseInt(slippageTolerance),
            deadline: deadline ? parseInt(deadline) : undefined,
            enableGasEstimation: false,
        };

        const buildUrl = `https://aggregator-api.kyberswap.com/${kyberChain}/api/v1/route/build`;

        const buildResponse = await fetch(buildUrl, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(buildBody),
        });

        const buildText = await buildResponse.text();
        let buildData;
        try {
            buildData = JSON.parse(buildText);
        } catch {
            console.error("Kyber Build: Invalid JSON response:", buildText.slice(0, 200));
            return NextResponse.json(
                { error: "Kyber API returned invalid response", details: buildText.slice(0, 200) },
                { status: 500 }
            );
        }

        console.log(`Kyber Swap Response: status=${buildResponse.status}, body=${buildText.slice(0, 500)}`);

        if (buildData.code !== 0 || !buildData.data) {
            console.error(`Kyber Build Error: ${JSON.stringify(buildData)}`);
            return NextResponse.json({
                error: buildData.message || "Kyber build failed",
                message: buildData.message,
            }, { status: 400 });
        }

        // Return the swap data
        return NextResponse.json({
            amountIn: quoteData.data.routeSummary.amountIn,
            amountOut: quoteData.data.routeSummary.amountOut,
            amountInUsd: quoteData.data.routeSummary.amountInUsd,
            amountOutUsd: quoteData.data.routeSummary.amountOutUsd,
            gas: buildData.data.gas || quoteData.data.routeSummary.gas,
            gasUsd: quoteData.data.routeSummary.gasUsd,
            data: buildData.data.data,
            routerAddress: buildData.data.routerAddress || quoteData.data.routerAddress,
            outputChange: buildData.data.outputChange,
        });
    } catch (error) {
        console.error("Kyber Swap Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch from Kyber API" },
            { status: 500 }
        );
    }
}
