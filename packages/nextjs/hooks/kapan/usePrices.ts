import { useMemo } from "react";
import { formatUnits } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-stark";

const RAW_PRICE_DECIMALS = 18; // UiHelper returns 1e18 fixed-point (10+8)

export function usePriceMap(addresses: string[], enabled: boolean, refetchMs = 30000) {
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of addresses) {
      const k = (a ?? "").toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
    return out;
  }, [addresses]);

  const { data, isLoading, isFetching, isError, error } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [deduped],
    enabled: enabled && deduped.length > 0,
    refetchInterval: refetchMs,
  });

  const priceByAddress = useMemo(() => {
    if (!Array.isArray(data) || data.length !== deduped.length) return {} as Record<string, bigint>;
    const map: Record<string, bigint> = {};
    for (let i = 0; i < deduped.length; i++) {
      const v = data[i];
      map[deduped[i]] = typeof v === "bigint" ? v : BigInt(v as any);
    }
    return map;
  }, [data, deduped]);

  const formatPrice = (raw?: bigint, decimals = RAW_PRICE_DECIMALS) =>
    raw === undefined ? "-" : formatUnits(raw, decimals);

  return { priceByAddress, formatPrice, isLoading: isLoading || isFetching, isError, error };
}
