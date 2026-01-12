"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, Call, PaymasterDetails } from "starknet";
import { usePaymasterEstimateFees, usePaymasterGasTokens } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import { useGlobalState } from "~~/services/store/store";
import { weiToEth, friToStrk } from "~~/lib/feeUnits";
import { universalStrkAddress } from "~~/utils/Constants";
import { DEBOUNCE_DELAYS } from "~~/hooks/useDebouncedEffect";

type BuildCalls =
  | (() => Call | Call[] | null | undefined | Promise<Call | Call[] | null | undefined>)
  | (() => Promise<Call | Call[] | null | undefined>);

type DisplayCurrency = "ETH" | "STRK";

export function useGasEstimate(opts: {
  enabled: boolean;
  buildCalls: BuildCalls;
  currency?: DisplayCurrency;      // preferred display currency for standard estimate
  debounceMs?: number;
  preferPaymaster?: boolean;       // if true, effective* fields prefer paymaster when available
}) {
  const {
    enabled,
    buildCalls,
    currency = "ETH",
    debounceMs = DEBOUNCE_DELAYS.FAST,
    preferPaymaster = true,
  } = opts;

  const { account } = useAccount();
  const { selectedToken } = useSelectedGasToken();
  const ethPrice = useGlobalState(s => s.nativeCurrencyPrice); // USD/ETH
  const strkPrice = useGlobalState(s => s.strkCurrencyPrice);  // USD/STRK

  // ---------------- internal state / debounce ----------------
  const [callsState, setCallsState] = useState<Call[] | undefined>(undefined);
  const timer = useRef<number | null>(null);
  const prevKey = useRef<string | null>(null);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

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

  useEffect(() => {
    clearTimer();
    if (!enabled) {
      setCallsState(undefined);
      prevKey.current = null;
      return;
    }
    timer.current = window.setTimeout(async () => {
      const calls = await buildCalls();
      if (!calls) {
        setCallsState(undefined);
        prevKey.current = null;
        return;
      }
      const arr = Array.isArray(calls) ? calls : [calls];
      const key = stableStringify(arr);
      if (prevKey.current === key) return;
      prevKey.current = key;
      setCallsState(arr);
    }, debounceMs) as unknown as number;
    return clearTimer;
  }, [enabled, debounceMs, buildCalls]);

  // ---------------- standard estimate (starknet.js v8) ----------------
  const [stdLoading, setStdLoading] = useState(false);
  const [stdError, setStdError] = useState<string | null>(null);
  const [feeUnit, setFeeUnit] = useState<"WEI" | "FRI" | null>(null);
  const [feeAtomic, setFeeAtomic] = useState<bigint | null>(null);
  const [feeNative, setFeeNative] = useState<number | null>(null);
  const [feeUsd, setFeeUsd] = useState<number | null>(null);
  const [usedCurrency, setUsedCurrency] = useState<DisplayCurrency | null>(null);

  const resetStd = () => {
    setStdError(null);
    setFeeUnit(null);
    setFeeAtomic(null);
    setFeeNative(null);
    setFeeUsd(null);
    setUsedCurrency(null);
  };

  const computeStdDisplay = useCallback((atomic: bigint, unit: "WEI" | "FRI") => {
    const actualToken: DisplayCurrency = unit === "WEI" ? "ETH" : "STRK";
    const actualNative = unit === "WEI" ? weiToEth(atomic) : friToStrk(atomic);
    const price = actualToken === "ETH" ? ethPrice ?? null : strkPrice ?? null;
    const usd = price != null ? actualNative * price : null;

    if (currency === actualToken) {
      return { native: actualNative, usd, used: actualToken };
    }
    if (usd != null) {
      const tgt = currency === "ETH" ? ethPrice ?? null : strkPrice ?? null;
      if (tgt != null && tgt > 0) return { native: usd / tgt, usd, used: currency };
    }
    return { native: actualNative, usd, used: actualToken };
  }, [currency, ethPrice, strkPrice]);

  const doStdEstimate = useCallback(async (acct: Account, calls?: Call[]) => {
    if (!calls || calls.length === 0) {
      resetStd();
      return;
    }
    setStdLoading(true);
    setStdError(null);
    try {
      const res = await acct.estimateInvokeFee(calls);
      const atomic: bigint =
        (res as any)?.suggestedMaxFee ??
        (res as any)?.overall_fee ??
        0n;
      const unit = (res as any)?.unit as "WEI" | "FRI" | undefined;

      setFeeAtomic(atomic);
      if (unit) {
        setFeeUnit(unit);
        const { native, usd, used } = computeStdDisplay(atomic, unit);
        setFeeNative(native);
        setFeeUsd(usd);
        setUsedCurrency(used);
      } else {
        setFeeNative(null);
        setFeeUsd(null);
        setUsedCurrency(null);
      }
    } catch (e) {
      console.error("standard fee estimation failed", e);
      resetStd();
      setStdError("Fee estimation unavailable");
    } finally {
      setStdLoading(false);
    }
  }, [computeStdDisplay]);

  useEffect(() => {
    if (!enabled || !account?.address) {
      resetStd();
      return;
    }
    void doStdEstimate(account as Account, callsState);
  }, [enabled, account?.address, callsState, doStdEstimate, account]);

  // ---------------- paymaster estimate (AVNU) ----------------
  const { data: pmTokens } = usePaymasterGasTokens();
  const selectedDecimals = useMemo(() => {
    const addr = selectedToken?.address?.toLowerCase?.();
    const t = pmTokens?.find((x: any) => {
      const tokenAddress =
        (x.address ?? x.tokenAddress ?? x.token_address ?? "") as string;
      return tokenAddress.toLowerCase?.() === addr;
    });
    return Number(
      t?.decimals ?? 18,
    );
  }, [pmTokens, selectedToken?.address]);

  const paymasterOptions: PaymasterDetails | undefined = useMemo(() => {
    if (!selectedToken?.address) return {
      feeMode: { mode: "default", gasToken: universalStrkAddress },
    };
    return {
      feeMode: { mode: "default", gasToken: selectedToken.address },
    };
  }, [selectedToken?.address]);

  const pmEnabled = enabled && !!callsState?.length && !!paymasterOptions;

  const {
    data: pmData,
    error: pmErrorObj,
    isPending: pmLoading,
  } = usePaymasterEstimateFees({
    calls: callsState,
    options: paymasterOptions,
    enabled: pmEnabled,
  });

  const pmAtomic: bigint | null = useMemo(() => {
    if (!pmData) return null;
    const raw =
      (pmData as any)?.suggested_max_fee_in_gas_token ??
      (pmData as any)?.suggestedMaxFeeInGasToken ??
      (pmData as any)?.suggested_max_fee ??
      (pmData as any)?.suggestedMaxFee ??
      0;
    try {
      return typeof raw === "bigint" ? raw : BigInt(raw);
    } catch {
      return null;
    }
  }, [pmData]);

  const pmNative: number | null = useMemo(() => {
    if (pmAtomic == null || !selectedToken?.symbol) return null;

    if (selectedToken.symbol === "ETH") return weiToEth(pmAtomic);
    if (selectedToken.symbol === "STRK") return friToStrk(pmAtomic);

    try {
      return Number(pmAtomic) / 10 ** selectedDecimals;
    } catch {
      return null;
    }
  }, [pmAtomic, selectedDecimals, selectedToken?.symbol]);

  const pmUsd: number | null = useMemo(() => {
    if (pmNative == null || !selectedToken?.symbol) return null;
    if (selectedToken.symbol === "ETH" && ethPrice != null) return pmNative * ethPrice;
    if (selectedToken.symbol === "STRK" && strkPrice != null) return pmNative * strkPrice;
    return null;
  }, [pmNative, selectedToken?.symbol, ethPrice, strkPrice]);

  const pmError = pmErrorObj ? pmErrorObj.message ?? "Paymaster estimation failed" : null;

  // ---------------- effective display ----------------
  const showPaymaster =
    !!pmAtomic &&
    (!!preferPaymaster || selectedToken?.symbol !== (feeUnit === "WEI" ? "ETH" : "STRK"));

  const effectiveNative = showPaymaster ? pmNative : feeNative;
  const effectiveUsd = showPaymaster ? pmUsd : feeUsd;
  const effectiveCurrency: string | null = showPaymaster
    ? selectedToken?.symbol ?? null
    : usedCurrency;

  const loading = stdLoading || (pmEnabled && pmLoading);
  const error = showPaymaster ? pmError : stdError;

  const refresh = useCallback(async () => {
    const calls = await buildCalls();
    setCallsState(calls ? (Array.isArray(calls) ? calls : [calls]) : undefined);
  }, [buildCalls]);

  return {
    loading,
    error,

    feeWei: feeAtomic,
    feeNative,
    feeUsd,
    feeUnit,
    usedCurrency,

    paymaster: {
      enabled: pmEnabled,
      loading: pmLoading,
      error: pmError,
      feeAtomic: pmAtomic,
      feeNative: pmNative,
      feeUsd: pmUsd,
      token: selectedToken,
      decimals: selectedDecimals,
      raw: pmData,
    },

    usingPaymaster: !!showPaymaster,
    effectiveNative,
    effectiveUsd,
    effectiveCurrency,

    refresh,
  };
}
