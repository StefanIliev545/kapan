"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex, erc20Abi, parseAbi, zeroAddress } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { getEffectiveChainId } from "~~/utils/forkChain";
import {
  type MidnightMarket,
  type MidnightPosition,
  type MidnightQuote,
  type MidnightToken,
  supportedMidnightChain,
} from "~~/utils/midnight/types";
import type { UseDeployedContractConfig } from "~~/utils/scaffold-eth/contract";

export async function midnightRequest<T>(
  chainId: number,
  resource: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api/midnight/${getEffectiveChainId(chainId)}/${resource}?${new URLSearchParams(params)}`, {
    signal,
    cache: "no-store",
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Could not load Morpho fixed loans.");
  return body.data as T;
}
const trackedKey = (chainId: number, user: string) => `midnight-markets:${chainId}:${user.toLowerCase()}`;
export function rememberMidnightMarket(chainId: number, user: string, id: Hex) {
  try {
    const key = trackedKey(getEffectiveChainId(chainId), user);
    const ids: string[] = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify([...new Set([...ids, id])].slice(-64)));
  } catch {
    /* Browsing and execution do not require local storage. */
  }
}
export function useMidnightMarkets(chainId: number, loan?: string, enabled = true) {
  const effective = getEffectiveChainId(chainId);
  return useQuery({
    queryKey: ["midnight", "markets", effective, loan?.toLowerCase() ?? "all"],
    queryFn: ({ signal }) => midnightRequest<MidnightMarket[]>(chainId, "markets", loan ? { loan } : {}, signal),
    enabled: enabled && supportedMidnightChain(effective),
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 1,
  });
}
export function useMidnightQuote(chainId: number, market: MidnightMarket | undefined, assets: bigint, enabled = true) {
  return useQuery({
    queryKey: ["midnight", "quote", getEffectiveChainId(chainId), market?.market_id, assets.toString()],
    queryFn: ({ signal }) =>
      midnightRequest<MidnightQuote>(
        chainId,
        "quote",
        { market: market!.market_id, assets: assets.toString() },
        signal,
      ),
    enabled: enabled && Boolean(market) && assets > 0n,
    staleTime: 10000,
    refetchInterval: 15000,
    retry: false,
  });
}
export function useMidnightGateway(chainId: number) {
  const { data: router } = useDeployedContractInfo({
    contractName: "KapanRouter",
    chainId: chainId as UseDeployedContractConfig<"KapanRouter">["chainId"],
  });
  const q = useReadContract({
    chainId,
    address: router?.address,
    abi: parseAbi(["function gateways(string) view returns(address)"]),
    functionName: "gateways",
    args: ["morpho-midnight"],
    query: { enabled: Boolean(router) && supportedMidnightChain(getEffectiveChainId(chainId)) },
  });
  return { ...q, ready: !!q.data && q.data !== zeroAddress && !q.error, address: q.data };
}
const readAbi = parseAbi([
  "function debt(bytes32,address) view returns(uint256)",
  "function collateral(bytes32,address,uint256) view returns(uint256)",
  "function price() view returns(uint256)",
]);
export function useMidnightPositions(chainId: number, user?: Address) {
  const effective = getEffectiveChainId(chainId),
    client = usePublicClient({ chainId }),
    qc = useQueryClient();
  const query = useQuery({
    queryKey: ["midnight", "positions", chainId, user?.toLowerCase()],
    enabled: !!user && !!client && supportedMidnightChain(effective),
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 1,
    queryFn: async ({ signal }) => {
      let tracked: string[] = [];
      try {
        tracked = JSON.parse(localStorage.getItem(trackedKey(effective, user!)) || "[]");
      } catch {}
      const positions = await midnightRequest<MidnightPosition[]>(
        chainId,
        "positions",
        { user: user!, markets: tracked.join(",") },
        signal,
      );
      const addresses = [
        ...new Set(
          positions
            .flatMap(p => [p.loan_token, ...p.market.collaterals.map(c => c.token)])
            .map(a => a.toLowerCase() as Address),
        ),
      ];
      const tokenEntries = await Promise.all(
        addresses.map(async address => {
          const [symbol, decimals] = await Promise.all([
            client!.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
            client!.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
          ]);
          return [address, { address, symbol, decimals }] as const;
        }),
      );
      const tokens = Object.fromEntries(tokenEntries) as Record<string, MidnightToken>;
      const blockNumber = await client!.getBlockNumber();
      const rows = await Promise.all(
        positions.map(async p => {
          const core = p.market.midnight;
          const debt = await client!.readContract({
            address: core,
            abi: readAbi,
            functionName: "debt",
            args: [p.market_id, user!],
            blockNumber,
          });
          let value = 0n,
            capacity = 0n;
          const collaterals = await Promise.all(
            p.market.collaterals.map(async (c, index) => {
              const amount = await client!.readContract({
                address: core,
                abi: readAbi,
                functionName: "collateral",
                args: [p.market_id, user!, BigInt(index)],
                blockNumber,
              });
              const price =
                amount > 0n
                  ? await client!.readContract({ address: c.oracle, abi: readAbi, functionName: "price", blockNumber })
                  : 0n;
              const v = (amount * price) / 10n ** 36n;
              value += v;
              capacity += (v * BigInt(c.lltv)) / 10n ** 18n;
              return {
                token: c.token,
                amount: amount.toString(),
                value: v,
                capacity: (v * BigInt(c.lltv)) / 10n ** 18n,
                oraclePrice: price,
              };
            }),
          );
          return { ...p, debt: debt.toString(), collaterals, collateralValue: value, capacity };
        }),
      );
      return { rows: rows.filter(p => BigInt(p.debt) > 0n || p.collaterals.some(c => BigInt(c.amount) > 0n)), tokens };
    },
  });
  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["midnight"] });
    };
    window.addEventListener("txCompleted", refresh);
    return () => window.removeEventListener("txCompleted", refresh);
  }, [qc]);
  const addresses = useMemo(() => Object.keys(query.data?.tokens ?? {}), [query.data?.tokens]);
  const { prices } = useTokenPricesByAddress(effective, addresses, { enabled: addresses.length > 0 });
  return { ...query, rows: query.data?.rows ?? [], tokens: query.data?.tokens ?? {}, prices };
}
export type MidnightPositionRow = NonNullable<ReturnType<typeof useMidnightPositions>["data"]>["rows"][number];

export function useMidnightTokens(chainId: number, addresses: Address[]) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["midnight", "tokens", chainId, [...addresses].sort()],
    enabled: !!client && addresses.length > 0,
    staleTime: 3600000,
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          addresses.map(async address => {
            const [symbol, decimals] = await Promise.all([
              client!.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
              client!.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
            ]);
            return [address.toLowerCase(), { address, symbol, decimals }];
          }),
        ),
      ) as Record<string, MidnightToken>,
  });
}

/** All collateral slots are valued by the market oracle, in raw loan-token units. */
export function useMidnightRisk(
  chainId: number,
  market: MidnightMarket | undefined,
  user: Address | undefined,
  deltas: { address: string; amount: bigint }[],
  debtChange: bigint,
  enabled: boolean,
) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: [
      "midnight",
      "risk",
      chainId,
      user,
      market?.market_id,
      deltas.map(c => [c.address.toLowerCase(), c.amount.toString()]),
      debtChange.toString(),
    ],
    enabled: enabled && !!user && !!client && !!market,
    queryFn: async () => {
      const m = market!,
        blockNumber = await client!.getBlockNumber();
      const debt = await client!.readContract({
        address: m.midnight,
        abi: readAbi,
        functionName: "debt",
        args: [m.market_id, user!],
        blockNumber,
      });
      const values = await Promise.all(
        m.collaterals.map(async (c, index) => {
          const balance = await client!.readContract({
            address: m.midnight,
            abi: readAbi,
            functionName: "collateral",
            args: [m.market_id, user!, BigInt(index)],
            blockNumber,
          });
          const amount =
            balance +
            deltas.filter(x => x.address.toLowerCase() === c.token.toLowerCase()).reduce((a, x) => a + x.amount, 0n);
          if (amount < 0n) throw new Error("The withdrawal exceeds your collateral balance.");
          if (amount === 0n) return { value: 0n, capacity: 0n };
          const price = await client!.readContract({
            address: c.oracle,
            abi: readAbi,
            functionName: "price",
            blockNumber,
          });
          if (price === 0n) throw new Error("The market oracle has no valid price.");
          const value = (amount * price) / 10n ** 36n;
          return { value, capacity: (value * BigInt(c.lltv)) / 10n ** 18n };
        }),
      );
      for (const c of deltas)
        if (!m.collaterals.some(x => x.token.toLowerCase() === c.address.toLowerCase()))
          throw new Error("This market does not accept the selected collateral.");
      const capacity = values.reduce((a, c) => a + c.capacity, 0n),
        value = values.reduce((a, c) => a + c.value, 0n),
        totalDebt = debt + debtChange > 0n ? debt + debtChange : 0n;
      return {
        capacity,
        collateralValue: value,
        totalDebt,
        healthFactor: totalDebt ? Number((capacity * 10000n) / totalDebt) / 10000 : Infinity,
        ltv: value ? Number((totalDebt * 10000n) / value) / 100 : 0,
      };
    },
    staleTime: 10000,
    refetchInterval: 15000,
    retry: false,
  });
}
