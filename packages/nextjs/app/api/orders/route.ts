import type { NextRequest } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { db, orders } from "~~/lib/db";

/**
 * GET /api/orders?wallet=0x...&chainId=1
 * Fetches order history for a wallet address.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const chainId = searchParams.get("chainId");

  if (!wallet) {
    return Response.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  const normalizedWallet = wallet.toLowerCase();

  try {
    const conditions = [eq(orders.userAddress, normalizedWallet)];

    if (chainId) {
      conditions.push(eq(orders.chainId, Number.parseInt(chainId, 10)));
    }

    const userOrders = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    return Response.json({ orders: userOrders }, { status: 200 });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return Response.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

/**
 * POST /api/orders
 * Creates a new order record.
 */
export async function POST(req: NextRequest) {
  let body: {
    orderUid: string;
    orderHash?: string;
    salt?: string;
    userAddress: string;
    chainId: number;
    orderType?: "collateral_swap" | "debt_swap" | "leverage_up" | "close_position" | "unknown";
    protocol?: string;
    sellToken: string;
    buyToken: string;
    sellTokenSymbol?: string;
    buyTokenSymbol?: string;
    sellAmount: string;
    buyAmount: string;
    validTo?: string; // ISO date string
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  if (!body.orderUid || !body.userAddress || !body.chainId || !body.sellToken || !body.buyToken || !body.sellAmount || !body.buyAmount) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const normalizedWallet = body.userAddress.toLowerCase();

  try {
    // Check if order already exists
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderUid, body.orderUid))
      .limit(1);

    if (existing) {
      return Response.json({ error: "Order already exists", orderId: existing.id }, { status: 409 });
    }

    const [inserted] = await db
      .insert(orders)
      .values({
        orderUid: body.orderUid,
        orderHash: body.orderHash,
        salt: body.salt,
        userAddress: normalizedWallet,
        chainId: body.chainId,
        orderType: body.orderType ?? "unknown",
        protocol: body.protocol,
        sellToken: body.sellToken.toLowerCase(),
        buyToken: body.buyToken.toLowerCase(),
        sellTokenSymbol: body.sellTokenSymbol,
        buyTokenSymbol: body.buyTokenSymbol,
        sellAmount: body.sellAmount,
        buyAmount: body.buyAmount,
        validTo: body.validTo ? new Date(body.validTo) : null,
        status: "pending",
      })
      .returning({ id: orders.id, createdAt: orders.createdAt });

    return Response.json({
      success: true,
      orderId: inserted.id,
      createdAt: inserted.createdAt,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return Response.json({ error: "Failed to create order" }, { status: 500 });
  }
}
