import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, bridges } from "~~/lib/db";

interface RouteParams {
  params: Promise<{ routeId: string }>;
}

/**
 * PATCH /api/bridges/[routeId]
 * Updates bridge status, tx hashes, and amounts.
 * Called by the tracking hook and the status poller.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { routeId } = await params;

  let body: {
    status?: "pending" | "done" | "failed";
    sendingTxHash?: string;
    sendingTxLink?: string;
    receivingTxHash?: string;
    receivingTxLink?: string;
    toAmount?: string;
    toAmountUsd?: string;
    completedAt?: string; // ISO date string
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const [existing] = await db
      .select({ id: bridges.id })
      .from(bridges)
      .where(eq(bridges.routeId, routeId))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Bridge not found" }, { status: 404 });
    }

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status) updateFields.status = body.status;
    if (body.sendingTxHash) updateFields.sendingTxHash = body.sendingTxHash;
    if (body.sendingTxLink) updateFields.sendingTxLink = body.sendingTxLink;
    if (body.receivingTxHash) updateFields.receivingTxHash = body.receivingTxHash;
    if (body.receivingTxLink) updateFields.receivingTxLink = body.receivingTxLink;
    if (body.toAmount) updateFields.toAmount = body.toAmount;
    if (body.toAmountUsd) updateFields.toAmountUsd = body.toAmountUsd;
    if (body.completedAt) updateFields.completedAt = new Date(body.completedAt);

    await db
      .update(bridges)
      .set(updateFields)
      .where(eq(bridges.routeId, routeId));

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error updating bridge:", error);
    return Response.json({ error: "Failed to update bridge" }, { status: 500 });
  }
}
