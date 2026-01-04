import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for CoW Protocol appData registration API
 * This bypasses browser-level interference (extensions, CORS, etc.)
 */

const COW_API_URLS: Record<number, string> = {
  1: "https://api.cow.fi/mainnet",
  42161: "https://api.cow.fi/arbitrum_one",  // NOT "arbitrum"!
  8453: "https://api.cow.fi/base",
  10: "https://api.cow.fi/optimism",
  100: "https://api.cow.fi/xdai",
  137: "https://api.cow.fi/polygon",
  43114: "https://api.cow.fi/avalanche",
  56: "https://api.cow.fi/bnb",
  59144: "https://api.cow.fi/linea",
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  try {
    const { chainId: chainIdStr } = await params;
    const chainId = parseInt(chainIdStr, 10);
    
    const apiUrl = COW_API_URLS[chainId];
    if (!apiUrl) {
      return NextResponse.json(
        { error: `Chain ${chainId} not supported` },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    const response = await fetch(`${apiUrl}/api/v1/app_data`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    
    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return NextResponse.json(responseData, { status: response.status });
  } catch (error) {
    console.error("[cow/app-data] Proxy error:", error);
    return NextResponse.json(
      { error: `Proxy error: ${error}` },
      { status: 500 }
    );
  }
}
