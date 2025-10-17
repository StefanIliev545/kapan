import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchAvnuQuote, type AvnuQuote, type AvnuQuoteArgs } from "~~/lib/swaps/avnu";

export type SwapQuoteStatus = "idle" | "loading" | "stale" | "success" | "error";

type SwapQuoteState = {
  status: SwapQuoteStatus;
  data: AvnuQuote | null;
  error?: unknown;
};

type UseSwapQuoteArgs = {
  chainId: number;
  fromToken?: `0x${string}`;
  toToken?: `0x${string}`;
  amount: bigint;
  takerAddress?: `0x${string}`;
  enabled?: boolean;
  slippageBps?: number;
  debounceMs?: number;
  ttlMs?: number;
  staleWhileRevalidate?: boolean;
};

type CacheEntry = {
  value: AvnuQuote;
  ts: number;
};

type InflightEntry = {
  promise: Promise<AvnuQuote>;
  abort: AbortController;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, InflightEntry>();

function keyOf(args: Required<Pick<UseSwapQuoteArgs, "chainId" | "fromToken" | "toToken" | "amount" | "takerAddress">> & {
  slippageBps: number;
}) {
  const { chainId, fromToken, toToken, amount, takerAddress, slippageBps } = args;
  return [
    chainId,
    fromToken.toLowerCase(),
    toToken.toLowerCase(),
    amount.toString(),
    takerAddress.toLowerCase(),
    slippageBps,
  ].join(":");
}

export function useSwapQuote({
  chainId,
  fromToken,
  toToken,
  amount,
  takerAddress,
  enabled = true,
  slippageBps = 30,
  debounceMs = 400,
  ttlMs = 15_000,
  staleWhileRevalidate = true,
}: UseSwapQuoteArgs) {
  const normalizedChainId = Number.isFinite(chainId) ? chainId : 0;
  const normalizedSlippage = Math.max(slippageBps, 0);

  const key = useMemo(() => {
    if (!enabled) return null;
    if (!normalizedChainId || normalizedChainId <= 0) return null;
    if (!fromToken || !toToken) return null;
    if (!takerAddress) return null;
    if (amount <= 0n) return null;
    if (fromToken.toLowerCase() === toToken.toLowerCase()) return null;

    return keyOf({
      chainId: normalizedChainId,
      fromToken,
      toToken,
      amount,
      takerAddress,
      slippageBps: normalizedSlippage,
    });
  }, [
    amount,
    enabled,
    fromToken,
    normalizedChainId,
    normalizedSlippage,
    takerAddress,
    toToken,
  ]);

  const [state, setState] = useState<SwapQuoteState>({ status: "idle", data: null });
  const keyRef = useRef<string | null>(null);

  const refetch = useCallback(
    (force?: boolean) => {
      if (!key || !fromToken || !toToken || !takerAddress) {
        return;
      }

      const now = Date.now();
      const cached = cache.get(key);

      if (!force && cached && now - cached.ts < ttlMs) {
        setState({ status: "success", data: cached.value });
        return;
      }

      if (cached && staleWhileRevalidate) {
        setState({ status: cached ? "stale" : "loading", data: cached.value });
      } else {
        setState({ status: "loading", data: cached?.value ?? null });
      }

      let node = inflight.get(key);
      if (!node) {
        const abort = new AbortController();

        const attempt = async (tries: number): Promise<AvnuQuote> => {
          try {
            const quoteArgs: AvnuQuoteArgs = {
              chainId: normalizedChainId,
              fromToken,
              toToken,
              amount,
              takerAddress,
            };
            const response = await fetchAvnuQuote(quoteArgs, abort.signal, normalizedSlippage);
            cache.set(key, { value: response, ts: Date.now() });
            return response;
          } catch (error: any) {
            if (abort.signal.aborted) throw error;
            const status = error?.status ?? 0;
            const retriable = status === 429 || status >= 500;
            if (retriable && tries > 0) {
              const backoff = Math.min(600 + Math.random() * 400, 1_200);
              await new Promise(resolve => setTimeout(resolve, backoff));
              return attempt(tries - 1);
            }
            throw error;
          }
        };

        node = { promise: attempt(1), abort };
        inflight.set(key, node);
        node.promise.finally(() => inflight.delete(key));
      }

      keyRef.current = key;
      node.promise
        .then(result => {
          if (keyRef.current === key) {
            setState({ status: "success", data: result });
          }
        })
        .catch(error => {
          if (keyRef.current === key) {
            setState({ status: "error", data: cached?.value ?? null, error });
          }
        });
    },
    [
      amount,
      fromToken,
      key,
      normalizedChainId,
      normalizedSlippage,
      staleWhileRevalidate,
      takerAddress,
      toToken,
      ttlMs,
    ],
  );

  useEffect(() => {
    if (!key) {
      setState(prev => (prev.status === "idle" && prev.data === null ? prev : { status: "idle", data: null }));
      return;
    }

    const timeout = setTimeout(() => refetch(false), debounceMs);
    return () => {
      clearTimeout(timeout);
    };
  }, [debounceMs, key, refetch]);

  return {
    key,
    ...state,
    isFetching: state.status === "loading" || state.status === "stale",
    hasQuote: !!state.data && state.status !== "error",
    refetchNow: () => refetch(true),
    reset: () => setState({ status: "idle", data: null }),
    abort: () => {
      if (!key) return;
      const node = inflight.get(key);
      if (node) {
        node.abort.abort();
        inflight.delete(key);
      }
      setState({ status: "idle", data: null });
    },
  };
}
