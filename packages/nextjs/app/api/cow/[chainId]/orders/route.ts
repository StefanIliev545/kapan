import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for CoW Protocol orders API
 * 
 * POST /api/cow/[chainId]/orders - Submit an order to the orderbook
 * GET /api/cow/[chainId]/orders/[uid] - Get order details
 */

const COW_API_URLS: Record<number, string> = {
  1: "https://api.cow.fi/mainnet",
  42161: "https://api.cow.fi/arbitrum_one",
  8453: "https://api.cow.fi/base",
  10: "https://api.cow.fi/optimism",
  100: "https://api.cow.fi/xdai",
  137: "https://api.cow.fi/polygon",
  43114: "https://api.cow.fi/avalanche",
  56: "https://api.cow.fi/bnb",
  59144: "https://api.cow.fi/linea",
};

/**
 * POST /api/cow/[chainId]/orders
 * Submit an order to the CoW Protocol orderbook
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
    
    console.log(`[cow/orders] Submitting order to ${apiUrl}/api/v1/orders`);
    console.log(`[cow/orders] Order data:`, JSON.stringify(body, null, 2));
    
    const response = await fetch(`${apiUrl}/api/v1/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`[cow/orders] Response status: ${response.status}`);
    console.log(`[cow/orders] Response body: ${responseText}`);
    
    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return NextResponse.json(responseData, { status: response.status });
  } catch (error) {
    console.error("[cow/orders] Proxy error:", error);
    return NextResponse.json(
      { error: `Proxy error: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cow/[chainId]/orders?uid=xxx
 * Get order details from the CoW Protocol orderbook
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

    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const owner = searchParams.get("owner");
    
    let endpoint: string;
    if (uid) {
      endpoint = `${apiUrl}/api/v1/orders/${uid}`;
    } else if (owner) {
      endpoint = `${apiUrl}/api/v1/account/${owner}/orders`;
    } else {
      return NextResponse.json(
        { error: "Either uid or owner parameter required" },
        { status: 400 }
      );
    }
    
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
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
    console.error("[cow/orders] Proxy error:", error);
    return NextResponse.json(
      { error: `Proxy error: ${error}` },
      { status: 500 }
    );
  }
}
