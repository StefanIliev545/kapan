import type { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, bridges } from "~~/lib/db";

/**
 * GET /api/bridges?wallet=0x...
 * Fetches bridge history for a wallet (limit 50, newest first).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return Response.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  const normalizedWallet = wallet.toLowerCase();

  try {
    const rows = await db
      .select()
      .from(bridges)
      .where(eq(bridges.userAddress, normalizedWallet))
      .orderBy(desc(bridges.createdAt))
      .limit(50);

    return Response.json({ bridges: rows }, { status: 200 });
  } catch (error) {
    console.error("Error fetching bridges:", error);
    return Response.json({ error: "Failed to fetch bridges" }, { status: 500 });
  }
}

/**
 * POST /api/bridges
 * Creates a new bridge record. Upserts on routeId for idempotency.
 */
export async function POST(req: NextRequest) {
  let body: {
    routeId: string;
    userAddress: string;
    fromChainId: number;
    toChainId: number;
    fromTokenSymbol: string;
    toTokenSymbol: string;
    fromTokenLogoUri?: string;
    toTokenLogoUri?: string;
    fromAmount: string;
    toAmount: string;
    fromAmountUsd?: string;
    toAmountUsd?: string;
    sendingTxHash?: string;
    sendingTxLink?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.routeId || !body.userAddress || !body.fromChainId || !body.toChainId || !body.fromTokenSymbol || !body.toTokenSymbol || !body.fromAmount || !body.toAmount) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const normalizedWallet = body.userAddress.toLowerCase();

  try {
    const [inserted] = await db
      .insert(bridges)
      .values({
        routeId: body.routeId,
        userAddress: normalizedWallet,
        fromChainId: body.fromChainId,
        toChainId: body.toChainId,
        fromTokenSymbol: body.fromTokenSymbol,
        toTokenSymbol: body.toTokenSymbol,
        fromTokenLogoUri: body.fromTokenLogoUri,
        toTokenLogoUri: body.toTokenLogoUri,
        fromAmount: body.fromAmount,
        toAmount: body.toAmount,
        fromAmountUsd: body.fromAmountUsd,
        toAmountUsd: body.toAmountUsd,
        sendingTxHash: body.sendingTxHash,
        sendingTxLink: body.sendingTxLink,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: bridges.routeId,
        set: {
          // On duplicate routeId, update fields that may have been missing on first insert
          sendingTxHash: body.sendingTxHash,
          sendingTxLink: body.sendingTxLink,
          updatedAt: new Date(),
        },
      })
      .returning({ id: bridges.id, createdAt: bridges.createdAt });

    return Response.json({ success: true, bridgeId: inserted.id, createdAt: inserted.createdAt }, { status: 201 });
  } catch (error) {
    console.error("Error creating bridge:", error);
    return Response.json({ error: "Failed to create bridge" }, { status: 500 });
  }
}
