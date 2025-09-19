"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, Call } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { useGlobalState } from "~~/services/store/store";
import { weiToEth, friToStrk } from "~~/lib/feeUnits";

type BuildCalls =
  | (() => Call | Call[] | null | undefined | Promise<Call | Call[] | null | undefined>)
  | (() => Promise<Call | Call[] | null | undefined>);

type DisplayCurrency = "ETH" | "STRK"; // preferred display (not necessarily the fee token)

export function useGasEstimate(opts: {
  enabled: boolean;
  buildCalls: BuildCalls;
  currency?: DisplayCurrency; // preferred display currency for feeNative/feeUsd
  debounceMs?: number;
}) {
  const { enabled, buildCalls, currency = "STRK", debounceMs = 300 } = opts;

  const { account } = useAccount();

  // Prices from your store
  const ethPrice = useGlobalState(s => s.nativeCurrencyPrice); // USD/ETH
  const strkPrice = useGlobalState(s => s.strkCurrencyPrice);  // USD/STRK

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fee state
  /** Raw atomic amount in the network's fee token (WEI or FRI) */
  const [feeAtomic, setFeeAtomic] = useState<bigint | null>(null);
  /** Kept for backward compatibility: when unit === 'FRI' this is actually FRI, not WEI */
  const feeWei = feeAtomic; // NOTE: name preserved; see feeUnit for the true unit
  /** 'WEI' | 'FRI' as returned by starknet.js */
  const [feeUnit, setFeeUnit] = useState<"WEI" | "FRI" | null>(null);
  /** Fee in the chosen display currency (ETH or STRK), when we can compute it */
  const [feeNative, setFeeNative] = useState<number | null>(null);
  /** Fee in USD (derived from prices), when we can compute it */
  const [feeUsd, setFeeUsd] = useState<number | null>(null);
  /** The currency actually used to compute feeNative (may differ from `currency` if prices missing) */
  const [usedCurrency, setUsedCurrency] = useState<DisplayCurrency | null>(null);

  // Debounce + request sequencing
  const timer = useRef<number | null>(null);
  const seq = useRef(0);
  const prevKey = useRef<string | null>(null);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // --- helpers ----------------------------------------------------------------

  /** stable stringify so we don't re-estimate needlessly due to key order */
  const stableStringify = (value: unknown): string => {
    const seen = new WeakSet();
    const walk = (v: any): any => {
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[[cyclic]]";
        seen.add(v);
        if (Array.isArray(v)) return v.map(walk);
        const obj: Record<string, any> = {};
        for (const k of Object.keys(v).sort()) {
          const vv = (v as any)[k];
          obj[k] = typeof vv === "bigint" ? vv.toString() : walk(vv);
        }
        return obj;
      }
      return typeof v === "bigint" ? v.toString() : v;
    };
    return JSON.stringify(walk(value));
  };

  const callsKey = useCallback(
    (addr: string, calls: Call | Call[]) =>
      `${addr}:${stableStringify(Array.isArray(calls) ? calls : [calls])}`,
    [],
  );

  const resetFees = () => {
    setFeeAtomic(null);
    setFeeUnit(null);
    setFeeNative(null);
    setFeeUsd(null);
    setUsedCurrency(null);
    setError(null);
  };

  /** Convert atomic fee + unit into native amounts and USD, respecting preferred display currency when possible */
  const computeDisplay = useCallback(
    (atomic: bigint, unit: "WEI" | "FRI") => {
      // 1) actual on-chain fee token + native amount
      const actualToken: DisplayCurrency = unit === "WEI" ? "ETH" : "STRK";
      const actualNative =
        unit === "WEI" ? weiToEth(atomic) : friToStrk(atomic); // both return number

      // 2) USD using the actual token’s price (if we have it)
      const priceActual =
        actualToken === "ETH" ? ethPrice ?? null : strkPrice ?? null;
      const usd = priceActual != null ? actualNative * priceActual : null;

      // 3) Preferred display currency handling
      if (currency === actualToken) {
        return { native: actualNative, usd, used: actualToken as DisplayCurrency };
      }

      // Need to convert actual token amount to the preferred display currency via USD prices
      if (usd != null) {
        const targetPrice = currency === "ETH" ? ethPrice ?? null : strkPrice ?? null;
        if (targetPrice != null && targetPrice > 0) {
          return { native: usd / targetPrice, usd, used: currency as DisplayCurrency };
        }
      }

      // Fallback: show in the actual token if we can't convert
      return { native: actualNative, usd, used: actualToken as DisplayCurrency };
    },
    [currency, ethPrice, strkPrice],
  );

  // --- core estimation --------------------------------------------------------

  const doEstimate = useCallback(
    async (acct: Account, calls: Call | Call[]) => {
      setLoading(true);
      setError(null);
      const mySeq = ++seq.current;

      try {
        const callArray = Array.isArray(calls) ? calls : [calls];

        // v8-compliant: estimate a single *Invoke* (supports multi-call via array)
        // Response contains `suggestedMaxFee` (bigint) and `unit` ('WEI' | 'FRI')
        const res = await acct.estimateInvokeFee(callArray);

        // guard against race conditions
        if (mySeq !== seq.current) return;

        // Prefer suggestedMaxFee; fall back to overall_fee if needed (both are bigint)
        const atomic: bigint =
          (res as any)?.suggestedMaxFee ??
          (res as any)?.overall_fee ??
          0n;

        const unit = (res as any)?.unit as "WEI" | "FRI" | undefined;

        setFeeAtomic(atomic);
        if (unit) setFeeUnit(unit);

        const { native, usd, used } = unit
          ? computeDisplay(atomic, unit)
          : { native: null, usd: null, used: null };

        setFeeNative(native);
        setFeeUsd(usd);
        setUsedCurrency(used);
      } catch (e) {
        console.error("Fee estimation failed:", e);
        // Only show a user-friendly message; details already logged
        setError("Fee estimation unavailable");
        resetFees();
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    },
    [computeDisplay],
  );

  const refresh = useCallback(async () => {
    if (!account) return;
    const calls = await buildCalls();
    if (!calls) {
      prevKey.current = null;
      resetFees();
      return;
    }
    const key = callsKey(account.address, calls);
    prevKey.current = key;
    await doEstimate(account as Account, calls);
  }, [account, buildCalls, callsKey, doEstimate]);

  // Debounced auto-run
  useEffect(() => {
    clearTimer();

    if (!enabled || !account) {
      resetFees();
      return;
    }

    timer.current = window.setTimeout(async () => {
      const calls = await buildCalls();
      if (!calls) {
        prevKey.current = null;
        resetFees();
        return;
      }
      const key = callsKey(account.address, calls);
      if (prevKey.current === key) return; // no change

      prevKey.current = key;
      await doEstimate(account as Account, calls);
    }, debounceMs) as unknown as number;

    return clearTimer;
  }, [enabled, account?.address, buildCalls, callsKey, doEstimate, debounceMs, account]);

  return {
    // Status
    loading,
    error,

    // Amounts
    feeWei,        // bigint | null (actually WEI or FRI; see feeUnit)
    feeNative,     // number | null, in `usedCurrency`
    feeUsd,        // number | null
    feeUnit,       // 'WEI' | 'FRI' | null (from starknet.js)
    usedCurrency,  // 'ETH' | 'STRK' | null (what feeNative is denominated in)

    // Controls
    refresh,
  };
}
