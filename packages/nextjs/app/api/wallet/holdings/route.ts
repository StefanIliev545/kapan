import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import scaffoldConfig from "~~/scaffold.config";
import { scanHoldings } from "~~/utils/wallet/holdings.server";
import { incompleteScan } from "~~/utils/wallet/holdings";
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner") ?? "";
  const chain = request.nextUrl.searchParams.get("chainId") ?? "";
  const chainId = Number(chain);
  if (
    !isAddress(owner, {
      strict: false,
    }) ||
    !/^[1-9][0-9]*$/.test(chain) ||
    !Number.isSafeInteger(chainId)
  ) {
    return NextResponse.json(
      {
        error: "Invalid wallet or chain",
      },
      {
        status: 400,
      },
    );
  }
  try {
    const scan = await scanHoldings(chainId, owner, scaffoldConfig.alchemyApiKey, request.signal);
    return NextResponse.json(scan, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    request.signal.throwIfAborted();
    return NextResponse.json(incompleteScan(chainId, owner, "unavailable"), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
