import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  getRecentBridges,
  updateBridgeEntry,
  BRIDGE_UPDATED_EVENT,
  type BridgeHistoryEntry,
} from "~~/utils/bridgeHistory";
import { qk } from "~~/lib/queryKeys";

/**
 * Reads bridge history from the DB (primary) with localStorage as instant fallback.
 *
 * - On mount, returns localStorage data immediately (no loading flicker)
 * - useQuery fetches from GET /api/bridges?wallet=... in the background
 * - BRIDGE_UPDATED_EVENT (fired by localStorage helpers) triggers query invalidation
 *   so the UI updates instantly when the tracking hook writes to localStorage
 * - Polls the LI.FI status API for pending bridges and patches both localStorage + DB
 */
export function useBridgeHistory() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  // DB-primary query, seeded with localStorage for instant display
  const { data: bridges = [] } = useQuery<BridgeHistoryEntry[]>({
    queryKey: qk.bridges.history(address),
    queryFn: async () => {
      if (!address) return getRecentBridges();

      try {
        const res = await fetch(`/api/bridges?wallet=${encodeURIComponent(address)}`);
        if (!res.ok) return getRecentBridges();

        const json = await res.json();
        // Map snake_case DB response → camelCase BridgeHistoryEntry
        return (json.bridges ?? []).map(mapDbRowToEntry);
      } catch {
        // Network error — fall back to localStorage
        return getRecentBridges();
      }
    },
    // Show localStorage data while the API request is in-flight
    placeholderData: () => getRecentBridges(),
    // Re-fetch when the user changes
    enabled: true,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Invalidate the query when localStorage fires an update event
  // This gives us instant reactivity from the tracking hook
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.bridges.history(address) });
  }, [queryClient, address]);

  useEffect(() => {
    window.addEventListener(BRIDGE_UPDATED_EVENT, invalidate);
    return () => window.removeEventListener(BRIDGE_UPDATED_EVENT, invalidate);
  }, [invalidate]);

  const pendingBridges = bridges.filter(b => b.status === "pending");
  const pendingCount = pendingBridges.length;

  // Poll LI.FI status API for every pending bridge that has a sendingTxHash
  useQuery({
    queryKey: qk.bridges.statusPoll(pendingBridges.map(b => b.routeId)),
    queryFn: async () => {
      const pending = pendingBridges.filter(b => b.sendingTxHash);
      await Promise.allSettled(pending.map(pollBridgeStatus));
      // Invalidate to pick up updated statuses
      invalidate();
      return null;
    },
    enabled: pendingBridges.some(b => b.sendingTxHash),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  return { bridges, pendingBridges, pendingCount, refreshBridges: invalidate };
}

/**
 * Map a snake_case DB row to the camelCase BridgeHistoryEntry interface.
 */
function mapDbRowToEntry(row: Record<string, unknown>): BridgeHistoryEntry {
  return {
    routeId: row.route_id as string ?? row.routeId as string,
    fromChainId: (row.from_chain_id ?? row.fromChainId) as number,
    toChainId: (row.to_chain_id ?? row.toChainId) as number,
    fromTokenSymbol: (row.from_token_symbol ?? row.fromTokenSymbol) as string,
    toTokenSymbol: (row.to_token_symbol ?? row.toTokenSymbol) as string,
    fromTokenLogoURI: (row.from_token_logo_uri ?? row.fromTokenLogoUri ?? row.fromTokenLogoURI) as string | undefined,
    toTokenLogoURI: (row.to_token_logo_uri ?? row.toTokenLogoUri ?? row.toTokenLogoURI) as string | undefined,
    fromAmount: (row.from_amount ?? row.fromAmount) as string,
    toAmount: (row.to_amount ?? row.toAmount) as string,
    fromAmountUSD: (row.from_amount_usd ?? row.fromAmountUsd ?? row.fromAmountUSD) as string | undefined,
    toAmountUSD: (row.to_amount_usd ?? row.toAmountUsd ?? row.toAmountUSD) as string | undefined,
    sendingTxHash: (row.sending_tx_hash ?? row.sendingTxHash) as string | undefined,
    sendingTxLink: (row.sending_tx_link ?? row.sendingTxLink) as string | undefined,
    receivingTxHash: (row.receiving_tx_hash ?? row.receivingTxHash) as string | undefined,
    receivingTxLink: (row.receiving_tx_link ?? row.receivingTxLink) as string | undefined,
    status: (row.status as BridgeHistoryEntry["status"]) ?? "pending",
    // DB returns ISO timestamps, localStorage uses ms timestamps
    createdAt: typeof row.created_at === "string"
      ? new Date(row.created_at).getTime()
      : typeof row.createdAt === "string"
        ? new Date(row.createdAt).getTime()
        : (row.created_at ?? row.createdAt ?? Date.now()) as number,
    completedAt: row.completed_at
      ? new Date(row.completed_at as string).getTime()
      : row.completedAt
        ? typeof row.completedAt === "string" ? new Date(row.completedAt).getTime() : row.completedAt as number
        : undefined,
    userAddress: (row.user_address ?? row.userAddress) as string | undefined,
  };
}

/**
 * Fetch status for a single bridge from the LI.FI API.
 * Updates both localStorage (instant) and DB (persistent).
 * API docs: https://apidocs.li.fi/reference/get_status
 */
async function pollBridgeStatus(bridge: BridgeHistoryEntry): Promise<void> {
  if (!bridge.sendingTxHash) return;

  try {
    const params = new URLSearchParams({
      txHash: bridge.sendingTxHash,
      fromChain: String(bridge.fromChainId),
      toChain: String(bridge.toChainId),
    });

    const res = await fetch(`https://li.quest/v1/status?${params}`);
    if (!res.ok) return;

    const data = await res.json();

    if (data.status === "DONE") {
      const updates = {
        status: "done" as const,
        completedAt: Date.now(),
        receivingTxHash: data.receiving?.txHash,
        receivingTxLink: data.receiving?.txLink,
      };
      updateBridgeEntry(bridge.routeId, updates);
      // Also persist to DB
      patchBridgeApi(bridge.routeId, {
        status: "done",
        completedAt: new Date(updates.completedAt).toISOString(),
        receivingTxHash: data.receiving?.txHash,
        receivingTxLink: data.receiving?.txLink,
      }).catch(() => { /* best-effort */ });
    } else if (data.status === "FAILED") {
      const updates = {
        status: "failed" as const,
        completedAt: Date.now(),
      };
      updateBridgeEntry(bridge.routeId, updates);
      patchBridgeApi(bridge.routeId, {
        status: "failed",
        completedAt: new Date(updates.completedAt).toISOString(),
      }).catch(() => { /* best-effort */ });
    }
    // PENDING / NOT_FOUND — no update, will be polled again
  } catch {
    // Network error — silently retry on next interval
  }
}

/** Fire-and-forget PATCH to update a bridge record in the DB. */
async function patchBridgeApi(routeId: string, updates: Record<string, unknown>): Promise<void> {
  await fetch(`/api/bridges/${encodeURIComponent(routeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}
