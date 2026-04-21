import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy to Pendle's portfolio/positions dashboard endpoint.
 *
 * Pendle's own app uses this to render per-user open/closed positions with
 * entry prices, current valuation and unrealized P&L. We proxy through the
 * app so there's no CORS issue and so we can swap endpoints in one place if
 * Pendle restructures them (they've moved dashboard data around before).
 *
 * Upstream: GET /core/v1/dashboard/positions/database/{address}?filterUsd=0.1
 * Response shape (abridged, subject to change — consumers must parse defensively):
 *   {
 *     "positions": [
 *       {
 *         "chainId": 1,
 *         "marketAddress": "0x...",
 *         "openPositions": [
 *           {
 *             "pt": {
 *               "address": "0x...",
 *               "balance": "123456...",
 *               "activeBalance": "123456...",
 *               "valuation": 1234.56
 *             },
 *             "yt": {...},
 *             "lp": {...},
 *             "impliedApyAtEntry"?: 0.152,
 *             "pnl"?: { "pnl": 12.34, "entryPrice": 0.92 }
 *           }
 *         ]
 *       }
 *     ]
 *   }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const url = `https://api-v2.pendle.finance/core/v1/dashboard/positions/database/${address}?filterUsd=0.1`;

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Pendle portfolio returned non-JSON", error, text);
      return NextResponse.json(
        { error: "Pendle API returned invalid response", details: text },
        { status: 502 }
      );
    }

    if (!response.ok) {
      const parsed = data as { error?: string; message?: string };
      return NextResponse.json(
        { error: parsed.error || parsed.message || "Pendle API error", statusCode: response.status },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Pendle portfolio proxy error", error);
    return NextResponse.json({ error: "Failed to fetch Pendle portfolio" }, { status: 500 });
  }
}
