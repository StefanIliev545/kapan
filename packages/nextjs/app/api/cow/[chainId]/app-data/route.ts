import { NextRequest, NextResponse } from "next/server";
import { COW_API_URLS } from "~~/utils/constants";

/**
 * Proxy for CoW Protocol appData API
 * This bypasses browser-level interference (extensions, CORS, etc.)
 */

/**
 * GET /api/cow/[chainId]/app-data?hash=0x...
 * Fetches appData document from CoW API by hash
 */
export async function GET(
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

    const hash = request.nextUrl.searchParams.get("hash");
    if (!hash) {
      return NextResponse.json(
        { error: "Missing hash parameter" },
        { status: 400 }
      );
    }

    const response = await fetch(`${apiUrl}/api/v1/app_data/${hash}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "AppData not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `CoW API error: ${response.status}` },
        { status: response.status }
      );
    }

    const responseData = await response.json();
    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("[cow/app-data] GET error:", error);
    return NextResponse.json(
      { error: `Fetch error: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/cow/[chainId]/app-data
 * Registers appData with CoW API
 */
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
