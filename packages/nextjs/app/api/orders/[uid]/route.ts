import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, orders, orderFills } from "~~/lib/db";

interface RouteParams {
  params: Promise<{ uid: string }>;
}

/**
 * GET /api/orders/[uid]
 * Fetches a single order with its fills.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { uid } = await params;

  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderUid, uid))
      .limit(1);

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    // Get fills for this order
    const fills = await db
      .select()
      .from(orderFills)
      .where(eq(orderFills.orderId, order.id));

    return Response.json({ order, fills }, { status: 200 });
  } catch (error) {
    console.error("Error fetching order:", error);
    return Response.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

/**
 * PATCH /api/orders/[uid]
 * Updates order status and fill amounts.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { uid } = await params;

  let body: {
    status?: "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "expired";
    filledSellAmount?: string;
    filledBuyAmount?: string;
    // For recording a new fill
    fill?: {
      txHash: string;
      fillSellAmount: string;
      fillBuyAmount: string;
      executionPrice?: string;
    };
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Get current order
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderUid, uid))
      .limit(1);

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    // Update order fields
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status) {
      updateFields.status = body.status;
    }
    if (body.filledSellAmount) {
      updateFields.filledSellAmount = body.filledSellAmount;
    }
    if (body.filledBuyAmount) {
      updateFields.filledBuyAmount = body.filledBuyAmount;
    }

    await db
      .update(orders)
      .set(updateFields)
      .where(eq(orders.orderUid, uid));

    // Record fill if provided
    if (body.fill) {
      await db.insert(orderFills).values({
        orderId: order.id,
        txHash: body.fill.txHash,
        fillSellAmount: body.fill.fillSellAmount,
        fillBuyAmount: body.fill.fillBuyAmount,
        executionPrice: body.fill.executionPrice,
      });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error updating order:", error);
    return Response.json({ error: "Failed to update order" }, { status: 500 });
  }
}
