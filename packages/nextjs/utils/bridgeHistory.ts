/**
 * Bridge History - Persist bridge transaction state from LI.FI widget events
 *
 * Follows the same localStorage + custom-event pattern as orderNotes.ts so that
 * PendingOrdersDrawer can react in real time.
 */

export interface BridgeHistoryEntry {
  routeId: string;
  fromChainId: number;
  toChainId: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
  fromTokenLogoURI?: string;
  toTokenLogoURI?: string;
  /** Human-readable amount (already formatted with decimals) */
  fromAmount: string;
  toAmount: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  sendingTxHash?: string;
  sendingTxLink?: string;
  receivingTxHash?: string;
  receivingTxLink?: string;
  status: "pending" | "done" | "failed";
  /** ms timestamp */
  createdAt: number;
  /** ms timestamp */
  completedAt?: number;
  userAddress?: string;
}

const STORAGE_KEY = "kapan_bridge_history";
const MAX_ENTRIES = 50;

/** Custom DOM event fired whenever bridge data changes — drawer listens for this */
export const BRIDGE_UPDATED_EVENT = "kapan:bridge-updated";

export function dispatchBridgeUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BRIDGE_UPDATED_EVENT));
}

export function getBridgeHistory(): Record<string, BridgeHistoryEntry> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn("[bridgeHistory] Failed to read from localStorage:", error);
    return {};
  }
}

export function saveBridgeEntry(entry: BridgeHistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const entries = getBridgeHistory();
    entries[entry.routeId] = entry;

    // Prune oldest entries if over limit
    const list = Object.entries(entries);
    if (list.length > MAX_ENTRIES) {
      list.sort((a, b) => b[1].createdAt - a[1].createdAt);
      const pruned = Object.fromEntries(list.slice(0, MAX_ENTRIES));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    dispatchBridgeUpdated();
  } catch (error) {
    console.warn("[bridgeHistory] Failed to save:", error);
  }
}

export function updateBridgeEntry(routeId: string, updates: Partial<BridgeHistoryEntry>): void {
  if (typeof window === "undefined") return;
  try {
    const entries = getBridgeHistory();
    const existing = entries[routeId];
    if (!existing) return;

    const wasCompleted = existing.status !== "pending";
    entries[routeId] = { ...existing, ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    dispatchBridgeUpdated();

    // When a bridge finishes (pending → done/failed), fire the same "txCompleted"
    // event that useTransactionNotifications dispatches so balance/position
    // queries refresh automatically.
    if (!wasCompleted && (updates.status === "done" || updates.status === "failed")) {
      window.dispatchEvent(new Event("txCompleted"));
    }
  } catch (error) {
    console.warn("[bridgeHistory] Failed to update:", error);
  }
}

export function getBridgeEntry(routeId: string): BridgeHistoryEntry | undefined {
  return getBridgeHistory()[routeId];
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Returns entries sorted newest-first, filtered to those within `maxAgeMs`. */
export function getRecentBridges(maxAgeMs = SEVEN_DAYS_MS): BridgeHistoryEntry[] {
  const cutoff = Date.now() - maxAgeMs;
  return Object.values(getBridgeHistory())
    .filter(e => e.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getPendingBridges(): BridgeHistoryEntry[] {
  return Object.values(getBridgeHistory())
    .filter(e => e.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}
