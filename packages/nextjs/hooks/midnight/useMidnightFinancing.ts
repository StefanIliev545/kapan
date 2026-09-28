"use client";

import { useMemo, useState } from "react";
import { useMidnightGateway, useMidnightMarkets, useMidnightQuote, useMidnightRisk } from "./useMidnight";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { borrowingBounds, matchingMarkets, validateQuote } from "~~/utils/midnight/quotes";
import type { MidnightMarket } from "~~/utils/midnight/types";

export type FixedCollateral = { address: string; amount: bigint };
export function useMidnightFinancing({
  chainId,
  loan,
  assets,
  collaterals,
  enabled,
  market: lockedMarket,
  excludeMarketId,
}: {
  chainId: number;
  loan: string;
  assets: bigint;
  collaterals: FixedCollateral[];
  enabled: boolean;
  market?: MidnightMarket;
  excludeMarketId?: string;
}) {
  const { address: user } = useAccount();
  const [selectedId, setSelectedId] = useState("");
  const [maxAprInput, setMaxAprInput] = useState("20");
  const markets = useMidnightMarkets(chainId, loan, enabled && !lockedMarket);
  const candidates = useMemo(
    () =>
      matchingMarkets(
        lockedMarket ? [lockedMarket] : (markets.data ?? []),
        loan,
        collaterals.map(c => c.address),
      ).filter(m => m.market_id.toLowerCase() !== excludeMarketId?.toLowerCase()),
    [markets.data, lockedMarket, loan, collaterals, excludeMarketId],
  );
  const selected = lockedMarket ?? candidates.find(m => m.market_id === selectedId);
  const gateway = useMidnightGateway(chainId);
  const quote = useMidnightQuote(chainId, selected, assets, enabled);
  const preview = useMemo(() => {
    if (!enabled || !quote.data || !selected) return { value: undefined, error: undefined };
    try {
      validateQuote(quote.data, selected, assets);
      if (!/^\d+(\.\d{1,4})?$/.test(maxAprInput))
        throw new Error("Enter a maximum APR with up to four decimal places.");
      const maxApr = parseUnits(maxAprInput, 16);
      return {
        value: borrowingBounds(quote.data, assets, maxApr, 50, Math.floor(Date.now() / 1000), user),
        error: undefined,
      };
    } catch (error) {
      return { value: undefined, error: error instanceof Error ? error.message : "Invalid fixed loan quote." };
    }
  }, [enabled, quote.data, selected, assets, maxAprInput, user]);
  const risk = useMidnightRisk(
    chainId,
    selected,
    user,
    collaterals,
    preview.value?.bounds.maxUnits ?? 0n,
    enabled && !!preview.value,
  );
  const error = markets.error?.message ?? quote.error?.message ?? preview.error ?? risk.error?.message;
  const ready =
    enabled &&
    gateway.ready &&
    !!selected &&
    !!preview.value &&
    !!risk.data &&
    risk.data.healthFactor >= 1.05 &&
    !quote.isFetching &&
    !risk.isFetching &&
    !error;
  return {
    markets,
    candidates,
    selected,
    setSelectedId,
    maxAprInput,
    setMaxAprInput,
    quote,
    preview: preview.value,
    risk,
    gateway,
    ready,
    error,
  };
}
export type MidnightFinancing = ReturnType<typeof useMidnightFinancing>;
