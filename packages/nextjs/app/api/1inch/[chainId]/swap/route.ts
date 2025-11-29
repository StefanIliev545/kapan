import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chainId: string }> }
) {
    const { chainId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const apiKey = process.env.ONE_INCH_API_KEY || process.env.NEXT_PUBLIC_ONE_INCH_API_KEY;
    console.log(`1inch API Proxy: Request for chain ${chainId}, hasKey: ${!!apiKey}`);

    if (!apiKey) {
        return NextResponse.json(
            { error: "API Key missing in server environment" },
            { status: 500 }
        );
    }

    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap?${searchParams.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("1inch Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch from 1inch API" },
            { status: 500 }
        );
    }
}
