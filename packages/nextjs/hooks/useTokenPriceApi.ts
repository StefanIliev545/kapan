// hooks/useTokenPriceApi.ts
import { useEffect, useMemo, useRef, useState } from "react";

type State =
  | { status: "idle" | "loading"; price?: number; error?: string }
  | { status: "success"; price: number }
  | { status: "error"; error: string };

const buildUrl = (symbol: string) => {
  const sp = new URLSearchParams();
  sp.set("symbol", symbol);
  return `/api/tokenPrice?${sp.toString()}`; // vs is always usd on the server
};

export function useTokenPriceApi(symbol: string) {
  const [state, setState] = useState<State>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const url = useMemo(() => buildUrl(symbol), [symbol]);

  const refetch = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      if (!symbol?.trim()) {
        setState({ status: "error", error: "Symbol is required" });
        return;
      }
      setState({ status: "loading" });
      const res = await fetch(url, { signal: ctrl.signal });
      const json = (await res.json()) as { price?: number };
      if (!res.ok) {
        setState({ status: "error", error: `HTTP ${res.status}` });
        return;
      }
      const price = typeof json?.price === "number" ? json.price : 0;
      setState({ status: "success", price });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState({ status: "error", error: e?.message || "Request failed" });
    }
  };

  useEffect(() => {
    refetch();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return {
    ...state,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    refetch,
  };
}