/**
 * Utility to extract orderHash from transaction receipts
 * Parses OrderCreated events from KapanOrderManager
 */

import { decodeEventLog } from "viem";
import type { TransactionReceipt } from "./transactionSimulation";

const ORDER_CREATED_EVENT = {
  type: "event",
  name: "OrderCreated",
  inputs: [
    { name: "orderHash", type: "bytes32", indexed: true },
    { name: "user", type: "address", indexed: true },
    { name: "sellToken", type: "address", indexed: false },
    { name: "buyToken", type: "address", indexed: false },
    { name: "preTotalAmount", type: "uint256", indexed: false },
    { name: "minBuyPerChunk", type: "uint256", indexed: false },
    { name: "targetValue", type: "uint256", indexed: false },
    { name: "salt", type: "bytes32", indexed: false },
  ],
} as const;

export interface OrderCreatedEvent {
  orderHash: `0x${string}`;
  user: `0x${string}`;
  sellToken: `0x${string}`;
  buyToken: `0x${string}`;
  preTotalAmount: bigint;
  minBuyPerChunk: bigint;
  targetValue: bigint;
  salt: `0x${string}`;
}

/**
 * Extract OrderCreated event data from transaction receipts
 * Returns the first OrderCreated event found, or null if none
 */
export function extractOrderCreatedFromReceipts(
  receipts: TransactionReceipt[],
  orderManagerAddress?: string
): OrderCreatedEvent | null {
  for (const receipt of receipts) {
    const event = extractOrderCreatedFromReceipt(receipt, orderManagerAddress);
    if (event) return event;
  }
  return null;
}

/**
 * Extract OrderCreated event from a single receipt
 */
export function extractOrderCreatedFromReceipt(
  receipt: TransactionReceipt,
  orderManagerAddress?: string
): OrderCreatedEvent | null {
  for (const log of receipt.logs) {
    // Filter by contract address if provided
    if (orderManagerAddress && log.address.toLowerCase() !== orderManagerAddress.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: [ORDER_CREATED_EVENT],
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "OrderCreated") {
        return decoded.args as unknown as OrderCreatedEvent;
      }
    } catch {
      // Not an OrderCreated event, continue
    }
  }
  return null;
}

/**
 * Extract just the orderHash from receipts
 */
export function extractOrderHash(
  receipts: TransactionReceipt[],
  orderManagerAddress?: string
): `0x${string}` | null {
  const event = extractOrderCreatedFromReceipts(receipts, orderManagerAddress);
  return event?.orderHash ?? null;
}
