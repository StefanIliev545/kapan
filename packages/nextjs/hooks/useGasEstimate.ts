"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Account } from "starknet";
import { useAccount } from "@starknet-react/core";
import { useGlobalState } from "~~/services/store/store";
import { weiToEth, friToStrk } from "~~/lib/feeUnits";

type BuildCalls = () =>
  | Call
  | Call[]
  | null
  | undefined
  | Promise<Call | Call[] | null | undefined>;

export function useGasEstimate(opts: {
  enabled: boolean;
  buildCalls: BuildCalls;
  currency?: "ETH" | "STRK";
  debounceMs?: number;
}) {
  const { enabled, buildCalls, currency = "ETH", debounceMs = 300 } = opts;
  const { account } = useAccount();
  const [loading, setLoading] = useState(false);
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const [feeNative, setFeeNative] = useState<number | null>(null);
  const [feeUsd, setFeeUsd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const ethPrice = useGlobalState(state => state.nativeCurrencyPrice);
  const strkPrice = useGlobalState(state => state.strkCurrencyPrice);

  const clearTimer = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const doEstimate = useCallback(
    async (acct: Account, calls: Call | Call[]) => {
      setLoading(true);
      setError(null);
      try {
        const callArray = Array.isArray(calls) ? calls : [calls];
        const res =
          callArray.length === 1
            ? await acct.estimateInvokeFee(callArray[0] as any)
            : await (acct as any).estimateFee(callArray);

        const raw = BigInt(
          res?.suggestedMaxFee ?? res?.overall_fee ?? res?.gas_price ?? 0,
        );

        setFeeWei(raw);

        let native = 0;
        let usd: number | null = null;
        if (currency === "ETH") {
          native = weiToEth(raw);
          if (ethPrice != null) usd = native * ethPrice;
        } else {
          native = friToStrk(raw);
          if (strkPrice != null) usd = native * strkPrice;
        }

        setFeeNative(native);
        setFeeUsd(usd);
      } catch (e) {
        console.error("Fee estimation failed:", e);
        setError("Fee estimation unavailable");
        setFeeWei(null);
        setFeeNative(null);
        setFeeUsd(null);
      } finally {
        setLoading(false);
      }
    },
    [currency, ethPrice, strkPrice],
  );

  const refresh = useCallback(async () => {
    if (!account) return;
    const calls = await buildCalls();
    if (!calls) return;
    await doEstimate(account as Account, calls);
  }, [account, buildCalls, doEstimate]);

  useEffect(() => {
    clearTimer();
    if (!enabled || !account) return;
    timer.current = window.setTimeout(async () => {
      const calls = await buildCalls();
      if (!calls) {
        setFeeWei(null);
        setFeeNative(null);
        setFeeUsd(null);
        setError(null);
        return;
      }
      await doEstimate(account as Account, calls);
    }, debounceMs) as unknown as number;

    return clearTimer;
  }, [enabled, account, buildCalls, doEstimate, debounceMs]);

  return { loading, error, feeWei, feeNative, feeUsd, refresh };
}
