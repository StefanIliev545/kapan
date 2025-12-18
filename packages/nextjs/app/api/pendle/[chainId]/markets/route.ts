import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chainId: string }> }
) {
    const { chainId } = await params;
    const searchParams = request.nextUrl.searchParams;

    // Build URL with query params
    const queryString = searchParams.toString();
    const url = `https://api-v2.pendle.finance/core/v1/${chainId}/markets${queryString ? `?${queryString}` : ""}`;

    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
            },
        });

        const text = await response.text();
        let data: unknown;

        try {
            data = JSON.parse(text);
        } catch (error) {
            console.error("Pendle markets returned non-JSON", error, text);
            return NextResponse.json(
                { error: "Pendle API returned invalid response", details: text },
                { status: 500 }
            );
        }

        const parsed = data as { error?: string; message?: string };

        if (!response.ok || parsed.error) {
            const errorMessage = parsed.error || parsed.message || "Pendle API error";
            console.error("Pendle markets API error", errorMessage, data);
            return NextResponse.json(
                {
                    error: errorMessage,
                    description: parsed.message || text,
                    statusCode: response.status,
                },
                { status: response.status }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Pendle markets proxy error", error);
        return NextResponse.json(
            { error: "Failed to fetch from Pendle markets API" },
            { status: 500 }
        );
    }
}
