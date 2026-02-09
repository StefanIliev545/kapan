import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { decodeEventLog, type Hex } from "viem";
import { db, orders, orderFills } from "~~/lib/db";
import deployedContracts from "~~/contracts/deployedContracts";

// Alchemy webhook signature verification
const ALCHEMY_SIGNING_KEY = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;

// KapanOrderManager ABI for ChunkExecuted event
const CHUNK_EXECUTED_EVENT = {
  type: "event",
  name: "ChunkExecuted",
  inputs: [
    { name: "orderHash", type: "bytes32", indexed: true },
    { name: "chunkIndex", type: "uint256", indexed: false },
    { name: "sellAmount", type: "uint256", indexed: false },
    { name: "buyAmount", type: "uint256", indexed: false },
  ],
} as const;

interface AlchemyWebhookPayload {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      blockNum: string;
      hash: string; // transaction hash
      log: {
        address: string;
        topics: string[];
        data: string;
        blockNumber: string;
        transactionHash: string;
        transactionIndex: string;
        blockHash: string;
        logIndex: string;
        removed: boolean;
      };
    }>;
  };
}

// Map Alchemy network names to chain IDs
const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  ETH_MAINNET: 1,
  ARB_MAINNET: 42161,
  BASE_MAINNET: 8453,
  OPT_MAINNET: 10,
  LINEA_MAINNET: 59144,
};

/**
 * POST /api/webhooks/order-fill
 * Receives Alchemy webhooks for ChunkExecuted events and updates order fills in DB.
 */
export async function POST(req: NextRequest) {
  // Verify webhook signature if key is configured
  if (ALCHEMY_SIGNING_KEY) {
    const signature = req.headers.get("x-alchemy-signature");
    if (!signature) {
      console.warn("[Webhook] Missing signature header");
      return Response.json({ error: "Missing signature" }, { status: 401 });
    }

    // Alchemy uses HMAC-SHA256 for webhook signatures
    const body = await req.text();
    const crypto = await import("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", ALCHEMY_SIGNING_KEY)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.warn("[Webhook] Invalid signature");
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Parse the verified body
    const payload: AlchemyWebhookPayload = JSON.parse(body);
    return processWebhook(payload);
  }

  // If no signing key, just parse the body (development mode)
  const payload: AlchemyWebhookPayload = await req.json();
  return processWebhook(payload);
}

/** Record a single ChunkExecuted fill event and update the parent order.
 *  Returns true if a new fill was recorded, false if skipped. */
async function recordFill(
  orderHash: string,
  sellAmount: bigint,
  buyAmount: bigint,
  chunkIndex: bigint,
  txHash: string,
): Promise<boolean> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderHash, orderHash))
    .limit(1);

  if (!order) {
    console.log("[Webhook] Order not found for hash:", orderHash);
    return false;
  }

  // Idempotency check
  const existingFill = await db
    .select()
    .from(orderFills)
    .where(and(eq(orderFills.orderId, order.id), eq(orderFills.txHash, txHash)))
    .limit(1);

  if (existingFill.length > 0) {
    console.log("[Webhook] Fill already recorded:", txHash);
    return false;
  }

  const executionPrice = sellAmount > 0n
    ? (buyAmount * 10n ** 18n / sellAmount).toString()
    : null;

  await db.insert(orderFills).values({
    orderId: order.id,
    txHash,
    fillSellAmount: sellAmount.toString(),
    fillBuyAmount: buyAmount.toString(),
    executionPrice,
  });

  const newFilledSell = BigInt(order.filledSellAmount || "0") + sellAmount;
  const newFilledBuy = BigInt(order.filledBuyAmount || "0") + buyAmount;
  const isFullyFilled = newFilledSell >= BigInt(order.sellAmount);

  await db
    .update(orders)
    .set({
      filledSellAmount: newFilledSell.toString(),
      filledBuyAmount: newFilledBuy.toString(),
      status: isFullyFilled ? "filled" : "partially_filled",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  console.log("[Webhook] Recorded fill for order:", order.id, "chunk:", chunkIndex.toString());
  return true;
}

async function processWebhook(payload: AlchemyWebhookPayload) {
  console.log("[Webhook] Received:", payload.type, payload.id);

  if (payload.type !== "ADDRESS_ACTIVITY") {
    return Response.json({ message: "Ignored non-activity webhook" }, { status: 200 });
  }

  const chainId = NETWORK_TO_CHAIN_ID[payload.event.network];
  if (!chainId) {
    console.warn("[Webhook] Unknown network:", payload.event.network);
    return Response.json({ error: "Unknown network" }, { status: 400 });
  }

  const contracts = deployedContracts[chainId as keyof typeof deployedContracts];
  const orderManagerAddress = contracts?.KapanOrderManager?.address?.toLowerCase();

  let processedCount = 0;

  for (const activity of payload.event.activity) {
    const log = activity.log;
    if (log.address.toLowerCase() !== orderManagerAddress) continue;

    try {
      const decoded = decodeEventLog({
        abi: [CHUNK_EXECUTED_EVENT],
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });

      if (decoded.eventName !== "ChunkExecuted") continue;

      const { orderHash, chunkIndex, sellAmount, buyAmount } = decoded.args;
      console.log("[Webhook] ChunkExecuted:", {
        orderHash,
        chunkIndex: chunkIndex.toString(),
        sellAmount: sellAmount.toString(),
        buyAmount: buyAmount.toString(),
        txHash: log.transactionHash,
      });

      const recorded = await recordFill(orderHash, sellAmount, buyAmount, chunkIndex, log.transactionHash);
      if (recorded) processedCount++;
    } catch (error) {
      console.error("[Webhook] Failed to decode event:", error);
    }
  }

  return Response.json({ success: true, processed: processedCount }, { status: 200 });
}

/**
 * GET /api/webhooks/order-fill
 * Health check endpoint for webhook verification.
 */
export async function GET() {
  return Response.json({ status: "ok", message: "Order fill webhook endpoint" });
}
