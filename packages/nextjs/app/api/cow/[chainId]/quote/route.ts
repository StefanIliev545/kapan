import { NextRequest, NextResponse } from "next/server";
import { COW_API_URLS } from "~~/utils/constants";

/**
 * Proxy for CoW Protocol quote API
 * This bypasses browser-level interference (extensions, CORS, etc.)
 */

export async function POST(
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
    
    const response = await fetch(`${apiUrl}/api/v1/quote`, {
      method: "POST",
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
    console.error("[cow/quote] Proxy error:", error);
    return NextResponse.json(
      { error: `Proxy error: ${error}` },
      { status: 500 }
    );
  }
}
