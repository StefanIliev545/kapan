import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chainId: string }> }
) {
    const { chainId } = await params;
    const apiKey =
        process.env.ONE_INCH_API_KEY ||
        process.env.NEXT_PUBLIC_ONE_INCH_API_KEY ||
        process.env.NEXT_ONE_INCH_API_KEY;

    if (!apiKey) {
        return NextResponse.json(
            { error: "API Key missing in server environment" },
            { status: 500 }
        );
    }

    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/tokens`;

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
            },
            // Cache for 5 minutes - token list doesn't change often
            next: { revalidate: 300 },
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.error("1inch Tokens: Invalid JSON response:", text.slice(0, 200));
            return NextResponse.json(
                { error: "1inch API returned invalid response", details: text.slice(0, 200) },
                { status: 500 }
            );
        }

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("1inch Tokens Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch from 1inch API" },
            { status: 500 }
        );
    }
}
