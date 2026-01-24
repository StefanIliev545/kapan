import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { createPublicClient, http, parseAbiItem, type Address, type Chain } from "viem";
import { arbitrum, base, mainnet, optimism, linea } from "viem/chains";
import { db, orders, orderFills } from "~~/lib/db";
import deployedContracts from "~~/contracts/deployedContracts";

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  10: optimism,
  59144: linea,
};

const RPC_URLS: Record<number, string> = {
  1: `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  42161: `https://arb-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  8453: `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  10: `https://opt-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  59144: `https://linea-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
};

const CHUNK_EXECUTED_EVENT = parseAbiItem(
  "event ChunkExecuted(bytes32 indexed orderHash, uint256 chunkIndex, uint256 sellAmount, uint256 buyAmount)"
);

/**
 * POST /api/orders/sync
 * Syncs order fill data from blockchain events.
 * Called when user views their orders to ensure fill data is up-to-date.
 */
export async function POST(req: NextRequest) {
  let body: { wallet: string; chainId?: number };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.wallet) {
    return Response.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  const normalizedWallet = body.wallet.toLowerCase();

  try {
    // Get user's pending/partially filled orders
    const conditions = [
      eq(orders.userAddress, normalizedWallet),
      inArray(orders.status, ["pending", "open", "partially_filled"]),
    ];

    if (body.chainId) {
      conditions.push(eq(orders.chainId, body.chainId));
    }

    const userOrders = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .limit(50);

    if (userOrders.length === 0) {
      return Response.json({ synced: 0 });
    }

    // Group orders by chain
    const ordersByChain = userOrders.reduce<Record<number, typeof userOrders>>((acc, order) => {
      if (!acc[order.chainId]) acc[order.chainId] = [];
      acc[order.chainId].push(order);
      return acc;
    }, {});

    let totalSynced = 0;

    // Process each chain
    for (const [chainIdStr, chainOrders] of Object.entries(ordersByChain)) {
      const chainId = parseInt(chainIdStr);
      const chain = CHAINS[chainId];
      const rpcUrl = RPC_URLS[chainId];

      if (!chain || !rpcUrl) {
        console.log("[Sync] Skipping unsupported chain:", chainId);
        continue;
      }

      const contracts = deployedContracts[chainId as keyof typeof deployedContracts];
      const orderManagerAddress = contracts?.KapanOrderManager?.address;

      if (!orderManagerAddress) {
        console.log("[Sync] No OrderManager for chain:", chainId);
        continue;
      }

      const client = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      // Get recent ChunkExecuted events (last ~10000 blocks)
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock - 10000n;

      const logs = await client.getLogs({
        address: orderManagerAddress as Address,
        event: CHUNK_EXECUTED_EVENT,
        fromBlock,
        toBlock: "latest",
      });

      console.log(`[Sync] Found ${logs.length} ChunkExecuted events on chain ${chainId}`);

      // Process events and match to orders
      for (const log of logs) {
        const { orderHash, sellAmount, buyAmount } = log.args;
        const txHash = log.transactionHash;

        if (!orderHash || !sellAmount || !buyAmount || !txHash) continue;

        // Find matching order by orderHash
        const matchingOrder = chainOrders.find(o => o.orderHash === orderHash);

        if (!matchingOrder) {
          // Try matching by salt (orderUid) if orderHash not stored
          // This is a fallback for orders created before we stored orderHash
          continue;
        }

        // Check if fill already recorded
        const [existingFill] = await db
          .select()
          .from(orderFills)
          .where(
            and(
              eq(orderFills.orderId, matchingOrder.id),
              eq(orderFills.txHash, txHash)
            )
          )
          .limit(1);

        if (existingFill) continue;

        // Record the fill
        const executionPrice = sellAmount > 0n
          ? (buyAmount * 10n ** 18n / sellAmount).toString()
          : null;

        await db.insert(orderFills).values({
          orderId: matchingOrder.id,
          txHash,
          fillSellAmount: sellAmount.toString(),
          fillBuyAmount: buyAmount.toString(),
          executionPrice,
        });

        // Update order totals
        const currentFilledSell = BigInt(matchingOrder.filledSellAmount || "0");
        const currentFilledBuy = BigInt(matchingOrder.filledBuyAmount || "0");
        const newFilledSell = currentFilledSell + sellAmount;
        const newFilledBuy = currentFilledBuy + buyAmount;

        const totalSellAmount = BigInt(matchingOrder.sellAmount);
        const isFullyFilled = newFilledSell >= totalSellAmount;

        await db
          .update(orders)
          .set({
            filledSellAmount: newFilledSell.toString(),
            filledBuyAmount: newFilledBuy.toString(),
            status: isFullyFilled ? "filled" : "partially_filled",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, matchingOrder.id));

        totalSynced++;
      }
    }

    return Response.json({ synced: totalSynced });
  } catch (error) {
    console.error("[Sync] Error:", error);
    return Response.json({ error: "Failed to sync orders" }, { status: 500 });
  }
}
