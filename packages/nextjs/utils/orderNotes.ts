/**
 * Order Notes - Store operation type metadata for CoW limit orders
 * 
 * Since CoW appData schema doesn't allow custom fields, we store
 * operation metadata in localStorage and derive from order structure as fallback.
 * 
 * Notes support dual-key lookup:
 * - Primary: by orderHash (for lookup from on-chain data)
 * - Secondary: by salt (for matching pending orders before hash is known)
 */

export type OperationType = 
  | "leverage_up"
  | "close_position"
  | "debt_swap"
  | "collateral_swap"
  | "unknown";

export interface OrderNote {
  /** Order hash (unique identifier from on-chain) - may be empty if pending */
  orderHash: string;
  /** Salt used during order creation (for matching before hash is known) */
  salt?: string;
  /** Operation type */
  operationType: OperationType;
  /** Human-readable description */
  description: string;
  /** Protocol name (e.g., "Aave", "Morpho") */
  protocol?: string;
  /** Sell token symbol */
  sellToken?: string;
  /** Buy token symbol */
  buyToken?: string;
  /** Chain ID */
  chainId?: number;
  /** Timestamp when the note was created */
  createdAt: number;
}

const STORAGE_KEY = "kapan_order_notes";
const MAX_NOTES = 100; // Keep last 100 orders to avoid storage bloat

// Custom event for order creation - drawer listens for this to refresh
export const ORDER_CREATED_EVENT = "kapan:order-created";

/**
 * Dispatch event to notify listeners (like PendingOrdersDrawer) that a new order was created
 */
export function dispatchOrderCreated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORDER_CREATED_EVENT));
}

/**
 * Get all stored order notes
 */
export function getOrderNotes(): Record<string, OrderNote> {
  if (typeof window === "undefined") return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn("[orderNotes] Failed to read from localStorage:", error);
    return {};
  }
}

/**
 * Save an order note (keyed by orderHash if available, otherwise by salt)
 */
export function saveOrderNote(note: OrderNote): void {
  if (typeof window === "undefined") return;
  
  try {
    const notes = getOrderNotes();
    // Use orderHash as primary key if available, otherwise use salt
    const key = note.orderHash || note.salt;
    if (!key) {
      console.warn("[orderNotes] Note has no orderHash or salt, skipping save");
      return;
    }
    notes[key] = note;
    
    // Prune old entries if over limit
    const entries = Object.entries(notes);
    if (entries.length > MAX_NOTES) {
      entries.sort((a, b) => b[1].createdAt - a[1].createdAt);
      const pruned = Object.fromEntries(entries.slice(0, MAX_NOTES));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    // Notify listeners (like PendingOrdersDrawer) that a new order was created
    dispatchOrderCreated();
  } catch (error) {
    console.warn("[orderNotes] Failed to save to localStorage:", error);
  }
}

/**
 * Get a single order note by orderHash
 * Also checks notes keyed by salt (for notes saved before hash was known)
 */
export function getOrderNote(orderHash: string): OrderNote | undefined {
  const notes = getOrderNotes();
  
  // First try direct lookup by orderHash
  if (notes[orderHash]) {
    return notes[orderHash];
  }
  
  // Also check if this orderHash is stored as the key (could be salt-keyed note)
  // and check if any note has this as its orderHash field
  for (const note of Object.values(notes)) {
    if (note.orderHash === orderHash) {
      return note;
    }
  }
  
  return undefined;
}

/**
 * Find a pending note (keyed by salt) that matches the given order parameters
 * Used to match on-chain orders with notes saved before the hash was known
 */
export function findPendingNoteForOrder(
  sellToken: string,
  buyToken: string,
  chainId: number,
  createdAtTimestamp: number
): OrderNote | undefined {
  const notes = getOrderNotes();
  const ORDER_TIME_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance
  
  for (const note of Object.values(notes)) {
    // Skip notes that already have an orderHash set
    if (note.orderHash) continue;
    
    // Must have a salt (pending note)
    if (!note.salt) continue;
    
    // Match by chain
    if (note.chainId !== chainId) continue;
    
    // Match by tokens (symbols, case-insensitive)
    const noteHasSellToken = note.sellToken?.toLowerCase() === sellToken.toLowerCase();
    const noteHasBuyToken = note.buyToken?.toLowerCase() === buyToken.toLowerCase();
    if (!noteHasSellToken || !noteHasBuyToken) continue;
    
    // Match by time (within tolerance)
    const timeDiff = Math.abs(note.createdAt - createdAtTimestamp * 1000);
    if (timeDiff > ORDER_TIME_TOLERANCE_MS) continue;
    
    return note;
  }
  
  return undefined;
}

/**
 * Link a pending note (keyed by salt) to its orderHash
 * Call this when an order is first seen on-chain
 */
export function linkNoteToOrderHash(salt: string, orderHash: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const notes = getOrderNotes();
    
    // Find note by salt key
    if (!notes[salt]) return false;
    
    const note = notes[salt];
    note.orderHash = orderHash;
    
    // Re-key by orderHash for future lookups
    delete notes[salt];
    notes[orderHash] = note;
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch (error) {
    console.warn("[orderNotes] Failed to link note to orderHash:", error);
    return false;
  }
}

/**
 * Update a note's orderHash (used when hash becomes known after batch confirmation)
 */
export function updateOrderNoteHash(salt: string, orderHash: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const notes = getOrderNotes();
    
    // Find note by salt
    if (notes[salt]) {
      const note = notes[salt];
      note.orderHash = orderHash;
      
      // Re-key by orderHash
      delete notes[salt];
      notes[orderHash] = note;
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }
  } catch (error) {
    console.warn("[orderNotes] Failed to update note hash:", error);
  }
}

/**
 * Get operation type display label
 */
export function getOperationLabel(type: OperationType): string {
  switch (type) {
    case "leverage_up":
      return "Leverage Up";
    case "close_position":
      return "Close Position";
    case "debt_swap":
      return "Debt Swap";
    case "collateral_swap":
      return "Collateral Swap";
    default:
      return "Order";
  }
}

/**
 * Get operation type color class
 */
export function getOperationColorClass(type: OperationType): string {
  switch (type) {
    case "leverage_up":
      return "bg-primary/20 text-primary";
    case "close_position":
      return "bg-error/20 text-error";
    case "debt_swap":
      return "bg-info/20 text-info";
    case "collateral_swap":
      return "bg-secondary/20 text-secondary";
    default:
      return "bg-base-200 text-base-content/60";
  }
}

/**
 * Try to derive operation type from order structure
 * This is a fallback when no stored note exists
 * 
 * Heuristics:
 * - leverage_up: KIND_SELL, debt as sellToken, collateral as buyToken
 * - close_position: KIND_BUY, collateral as sellToken, debt as buyToken  
 * - debt_swap: KIND_BUY, both tokens are debt-like (stablecoins or ETH variants)
 * - collateral_swap: KIND_SELL, both tokens are collateral-like
 */
export function deriveOperationType(
  // Parameters intentionally unused - derivation is complex and needs position context
  // In the future, we could use on-chain position data to infer the operation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sellToken: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _buyToken: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _isKindBuy: boolean
): OperationType {
  return "unknown";
}

/**
 * Create order note for Leverage Up (Multiply)
 * @param salt - The salt used during order creation (orderHash not yet known)
 */
export function createLeverageUpNote(
  salt: string,
  protocol: string,
  debtSymbol: string,
  collateralSymbol: string,
  chainId: number
): OrderNote {
  return {
    orderHash: "", // Will be updated when hash becomes known
    salt,
    operationType: "leverage_up",
    description: `Leverage up: borrow ${debtSymbol} → ${collateralSymbol}`,
    protocol,
    sellToken: debtSymbol,
    buyToken: collateralSymbol,
    chainId,
    createdAt: Date.now(),
  };
}

/**
 * Create order note for Close Position (Close with Collateral)
 * @param salt - The salt used during order creation (orderHash not yet known)
 */
export function createClosePositionNote(
  salt: string,
  protocol: string,
  collateralSymbol: string,
  debtSymbol: string,
  chainId: number
): OrderNote {
  return {
    orderHash: "", // Will be updated when hash becomes known
    salt,
    operationType: "close_position",
    description: `Close position: sell ${collateralSymbol} → repay ${debtSymbol}`,
    protocol,
    sellToken: collateralSymbol,
    buyToken: debtSymbol,
    chainId,
    createdAt: Date.now(),
  };
}

/**
 * Create order note for Debt Swap
 * @param salt - The salt used during order creation (orderHash not yet known)
 */
export function createDebtSwapNote(
  salt: string,
  protocol: string,
  fromDebtSymbol: string,
  toDebtSymbol: string,
  chainId: number
): OrderNote {
  return {
    orderHash: "", // Will be updated when hash becomes known
    salt,
    operationType: "debt_swap",
    description: `Debt swap: ${fromDebtSymbol} → ${toDebtSymbol}`,
    protocol,
    sellToken: toDebtSymbol,  // We sell new debt to buy old debt for repayment
    buyToken: fromDebtSymbol,
    chainId,
    createdAt: Date.now(),
  };
}

/**
 * Create order note for Collateral Swap
 * @param salt - The salt used during order creation (orderHash not yet known)
 */
export function createCollateralSwapNote(
  salt: string,
  protocol: string,
  fromCollateralSymbol: string,
  toCollateralSymbol: string,
  chainId: number
): OrderNote {
  return {
    orderHash: "", // Will be updated when hash becomes known
    salt,
    operationType: "collateral_swap",
    description: `Collateral swap: ${fromCollateralSymbol} → ${toCollateralSymbol}`,
    protocol,
    sellToken: fromCollateralSymbol,
    buyToken: toCollateralSymbol,
    chainId,
    createdAt: Date.now(),
  };
}
