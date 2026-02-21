import { useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { saveBridgeEntry, updateBridgeEntry, type BridgeHistoryEntry } from "~~/utils/bridgeHistory";

/**
 * Captures LI.FI widget route-execution events and persists them to localStorage
 * AND to the Supabase DB via API calls.
 *
 * Mount once at app level (ScaffoldEthApp) — the `widgetEvents` emitter from
 * @lifi/widget is a module-level mitt singleton, so we can listen from anywhere
 * without being inside a LiFi provider.
 *
 * We dynamically import `@lifi/widget` inside useEffect to avoid pulling the
 * full widget JS into the initial bundle.
 *
 * API calls are fire-and-forget — localStorage remains the instant local cache,
 * DB writes are best-effort for cross-device persistence.
 */
export function useBridgeTracking() {
  const { address } = useAccount();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { widgetEvents, WidgetEvent } = await import("@lifi/widget");

        // --- RouteExecutionStarted: create a pending entry ---
        const onStarted = (route: any) => {
          const fromToken = route.fromToken ?? route.steps?.[0]?.action?.fromToken;
          const toToken = route.toToken ?? route.steps?.[route.steps.length - 1]?.action?.toToken;

          const entry: BridgeHistoryEntry = {
            routeId: route.id,
            fromChainId: route.fromChainId,
            toChainId: route.toChainId,
            fromTokenSymbol: fromToken?.symbol ?? "?",
            toTokenSymbol: toToken?.symbol ?? "?",
            fromTokenLogoURI: fromToken?.logoURI,
            toTokenLogoURI: toToken?.logoURI,
            fromAmount: formatHumanAmount(route.fromAmount, fromToken?.decimals),
            toAmount: formatHumanAmount(route.toAmount, toToken?.decimals),
            fromAmountUSD: route.fromAmountUSD,
            toAmountUSD: route.toAmountUSD,
            status: "pending",
            createdAt: Date.now(),
            userAddress: address,
          };
          saveBridgeEntry(entry);

          // Fire-and-forget: persist to DB
          persistBridgeToApi(entry).catch(() => { /* best-effort */ });
        };

        // --- RouteExecutionUpdated: capture tx hashes from step processes ---
        const onUpdated = ({ route, process }: any) => {
          if (!process?.txHash) return;

          // The process type tells us which leg we're on
          const isCrossChain = process.type === "CROSS_CHAIN";
          const isReceiving = process.type === "RECEIVING_CHAIN";

          if (isCrossChain || (!isReceiving && !isCrossChain)) {
            // Source chain tx
            const updates = {
              sendingTxHash: process.txHash,
              sendingTxLink: process.txLink,
            };
            updateBridgeEntry(route.id, updates);
            patchBridgeApi(route.id, updates).catch(() => { /* best-effort */ });
          }
          if (isReceiving) {
            const updates = {
              receivingTxHash: process.txHash,
              receivingTxLink: process.txLink,
            };
            updateBridgeEntry(route.id, updates);
            patchBridgeApi(route.id, updates).catch(() => { /* best-effort */ });
          }
        };

        // --- RouteExecutionCompleted: mark done ---
        const onCompleted = (route: any) => {
          // Try to extract receiving tx from the last step's last process
          const lastStep = route.steps?.[route.steps.length - 1];
          const lastProcess = lastStep?.execution?.process?.slice(-1)[0];

          const updates: Record<string, unknown> = {
            status: "done",
            completedAt: Date.now(),
            toAmount: formatHumanAmount(route.toAmount, route.toToken?.decimals),
            toAmountUSD: route.toAmountUSD,
            ...(lastProcess?.txHash && {
              receivingTxHash: lastProcess.txHash,
              receivingTxLink: lastProcess.txLink,
            }),
          };
          updateBridgeEntry(route.id, updates);
          patchBridgeApi(route.id, {
            ...updates,
            completedAt: new Date(updates.completedAt as number).toISOString(),
          }).catch(() => { /* best-effort */ });
        };

        // --- RouteExecutionFailed ---
        const onFailed = ({ route }: any) => {
          const updates = {
            status: "failed" as const,
            completedAt: Date.now(),
          };
          updateBridgeEntry(route.id, updates);
          patchBridgeApi(route.id, {
            status: "failed",
            completedAt: new Date(updates.completedAt).toISOString(),
          }).catch(() => { /* best-effort */ });
        };

        widgetEvents.on(WidgetEvent.RouteExecutionStarted, onStarted);
        widgetEvents.on(WidgetEvent.RouteExecutionUpdated, onUpdated);
        widgetEvents.on(WidgetEvent.RouteExecutionCompleted, onCompleted);
        widgetEvents.on(WidgetEvent.RouteExecutionFailed, onFailed);

        cleanup = () => {
          widgetEvents.off(WidgetEvent.RouteExecutionStarted, onStarted);
          widgetEvents.off(WidgetEvent.RouteExecutionUpdated, onUpdated);
          widgetEvents.off(WidgetEvent.RouteExecutionCompleted, onCompleted);
          widgetEvents.off(WidgetEvent.RouteExecutionFailed, onFailed);
        };
      } catch {
        // @lifi/widget not available (e.g. SSR, missing dep) — silently skip
      }
    })();

    return () => cleanup?.();
  }, [address]);
}

/** Convert raw amount string + decimals -> human-readable. Falls back to raw if decimals unavailable. */
function formatHumanAmount(raw: string | undefined, decimals: number | undefined): string {
  if (!raw) return "0";
  if (decimals == null) return raw;
  try {
    const val = Number(formatUnits(BigInt(raw), decimals));
    return val.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return raw;
  }
}

/** Fire-and-forget POST to create a bridge record in the DB. */
async function persistBridgeToApi(entry: BridgeHistoryEntry): Promise<void> {
  await fetch("/api/bridges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routeId: entry.routeId,
      userAddress: entry.userAddress,
      fromChainId: entry.fromChainId,
      toChainId: entry.toChainId,
      fromTokenSymbol: entry.fromTokenSymbol,
      toTokenSymbol: entry.toTokenSymbol,
      fromTokenLogoUri: entry.fromTokenLogoURI,
      toTokenLogoUri: entry.toTokenLogoURI,
      fromAmount: entry.fromAmount,
      toAmount: entry.toAmount,
      fromAmountUsd: entry.fromAmountUSD,
      toAmountUsd: entry.toAmountUSD,
    }),
  });
}

/** Fire-and-forget PATCH to update a bridge record in the DB. */
async function patchBridgeApi(routeId: string, updates: Record<string, unknown>): Promise<void> {
  await fetch(`/api/bridges/${encodeURIComponent(routeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}
