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

// ============ Helper Functions ============

/** Resolve chain + rpc + OrderManager address, or null if unsupported */
function getChainSyncConfig(chainId: number) {
  const chain = CHAINS[chainId];
  const rpcUrl = RPC_URLS[chainId];
  if (!chain || !rpcUrl) return null;

  const contracts = deployedContracts[chainId as keyof typeof deployedContracts];
  const orderManagerAddress = contracts?.KapanOrderManager?.address;
  if (!orderManagerAddress) return null;

  return { chain, rpcUrl, orderManagerAddress };
}

/** Calculate execution price scaled to 18 decimals */
function computeExecutionPrice(sellAmount: bigint, buyAmount: bigint): string | null {
  return sellAmount > 0n ? (buyAmount * 10n ** 18n / sellAmount).toString() : null;
}

/** Check whether this fill was already persisted */
async function isFillAlreadyRecorded(orderId: string | number, txHash: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(orderFills)
    .where(and(eq(orderFills.orderId, orderId as any), eq(orderFills.txHash, txHash)))
    .limit(1);
  return !!existing;
}
/** Record a new fill and update the order cumulative totals */
async function recordFillAndUpdateOrder(
  matchingOrder: typeof orders.$inferSelect,
  txHash: string,
  sellAmount: bigint,
  buyAmount: bigint,
): Promise<void> {
  await db.insert(orderFills).values({
    orderId: matchingOrder.id,
    txHash,
    fillSellAmount: sellAmount.toString(),
    fillBuyAmount: buyAmount.toString(),
    executionPrice: computeExecutionPrice(sellAmount, buyAmount),
  });

  const newFilledSell = BigInt(matchingOrder.filledSellAmount || "0") + sellAmount;
  const newFilledBuy = BigInt(matchingOrder.filledBuyAmount || "0") + buyAmount;
  const isFullyFilled = newFilledSell >= BigInt(matchingOrder.sellAmount);

  await db
    .update(orders)
    .set({
      filledSellAmount: newFilledSell.toString(),
      filledBuyAmount: newFilledBuy.toString(),
      status: isFullyFilled ? "filled" : "partially_filled",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, matchingOrder.id));
}
async function syncChainOrders(chainId: number, chainOrders: typeof orders.$inferSelect[]): Promise<number> {
  const config = getChainSyncConfig(chainId);
  if (!config) { console.log("[Sync] Skip chain:", chainId); return 0; }
  const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const cur = await client.getBlockNumber();
  const logs = await client.getLogs({ address: config.orderManagerAddress as Address, event: CHUNK_EXECUTED_EVENT, fromBlock: cur - 10000n, toBlock: "latest" });
  let s = 0;
  for (const log of logs) {
    const { orderHash, sellAmount, buyAmount } = log.args;
    const txHash = log.transactionHash;
    if (!orderHash || !sellAmount || !buyAmount || !txHash) continue;
    const mo = chainOrders.find(o => o.orderHash === orderHash);
    if (!mo || await isFillAlreadyRecorded(String(mo.id), txHash)) continue;
    await recordFillAndUpdateOrder(mo, txHash, sellAmount, buyAmount);
    s++;
  }
  return s;
}