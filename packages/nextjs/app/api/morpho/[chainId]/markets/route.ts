import { NextRequest, NextResponse } from "next/server";

const MORPHO_GRAPHQL_API = "https://blue-api.morpho.org/graphql";

const MARKETS_QUERY = `
  query GetMarkets($chainId: Int!, $first: Int) {
    markets(where: { chainId_in: [$chainId] }, first: $first) {
      items {
        id
        uniqueKey
        collateralAsset {
          address
          symbol
          decimals
          priceUsd
        }
        loanAsset {
          address
          symbol
          decimals
          priceUsd
        }
        oracle {
          address
        }
        irmAddress
        lltv
        state {
          supplyAssets
          borrowAssets
          utilization
          supplyApy
          borrowApy
          liquidityAssets
        }
      }
    }
  }
`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string }> }
) {
  const { chainId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const first = parseInt(searchParams.get("first") || "50", 10);

  try {
    const response = await fetch(MORPHO_GRAPHQL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: MARKETS_QUERY,
        variables: {
          chainId: parseInt(chainId, 10),
          first,
        },
      }),
    });

    const text = await response.text();
    let data: unknown;

    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Morpho API returned non-JSON", error, text);
      return NextResponse.json(
        { error: "Morpho API returned invalid response", details: text },
        { status: 500 }
      );
    }

    const parsed = data as { data?: unknown; errors?: Array<{ message: string }> };

    if (!response.ok || parsed.errors) {
      const errorMessage = parsed.errors?.[0]?.message || "Morpho API error";
      console.error("Morpho API error", errorMessage, data);
      return NextResponse.json(
        { error: errorMessage, statusCode: response.status },
        { status: response.status }
      );
    }

    return NextResponse.json(parsed.data);
  } catch (error) {
    console.error("Morpho markets proxy error", error);
    return NextResponse.json(
      { error: "Failed to fetch from Morpho API" },
      { status: 500 }
    );
  }
}

