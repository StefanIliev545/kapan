import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chainId: string }> }
) {
    const { chainId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const apiKey =
        process.env.ONE_INCH_API_KEY ||
        process.env.NEXT_PUBLIC_ONE_INCH_API_KEY ||
        process.env.NEXT_ONE_INCH_API_KEY;
    
    console.log(`1inch Swap Proxy: chain=${chainId}, hasKey=${!!apiKey}, params=${searchParams.toString()}`);

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

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.error(`1inch API returned non-JSON: ${text}`);
            return NextResponse.json({ error: "1inch API returned invalid response", details: text }, { status: 500 });
        }
        
        console.log(`1inch Swap Response: status=${response.status}, body=${text.slice(0, 500)}`);

        if (!response.ok) {
            console.error(`1inch API Error: ${JSON.stringify(data)}`);
            // Pass through the 1inch error with details
            return NextResponse.json({
                error: data.error || "1inch API error",
                description: data.description || data.message || text,
                statusCode: data.statusCode || response.status,
            }, { status: response.status });
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
