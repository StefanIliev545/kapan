/**
 * Fetch a user's open Alchemix V3 transmuter positions via standard ERC-721 enumeration.
 *
 * The deployed Transmuter is ERC-721 Enumerable (verified against Arbiscan ABI), so the
 * canonical discovery is straightforward and doesn't need log scans or brute-force probes:
 *   1. `balanceOf(user)` → N
 *   2. multicall `tokenOfOwnerByIndex(user, i)` for i ∈ [0, N)  → ids[]
 *   3. multicall `getPosition(id)` → StakingPosition[]
 *
 * Total RPC count: 3 calls regardless of N (steps 2 and 3 batch via wagmi/viem multicall).
 *
 * Cached aggressively (60s stale, 5min gc) via react-query.
 */
import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Address, type PublicClient } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  TRANSMUTER_ABI,
  getTransmuterForAlchemist,
  type TransmuterStakingPosition,
} from "~~/utils/alchemix/transmuter";

interface UseAlchemixTransmuterPositionsArgs {
  /** Alchemist address — the hook resolves the matching transmuter via the address map. */
  alchemist: Address | undefined;
  /** Pass through so callers can render protocol-side metadata. */
  marketId: number;
  /** Chain to query. */
  chainId: number;
  /** Caller can pass false to lazy-disable (e.g. when a panel isn't open). */
  enabled?: boolean;
}

export interface AlchemixTransmuterPosition extends TransmuterStakingPosition {
  /** ERC-721 token id minted at `createRedemption` — needed to call `claimRedemption`. */
  id: bigint;
  /** Convenience copy of the user the positions belong to. */
  owner: Address;
}

interface FetchResult {
  positions: AlchemixTransmuterPosition[];
}

async function fetchTransmuterPositions(
  client: PublicClient,
  user: Address,
  transmuter: Address,
): Promise<FetchResult> {
  // Step 1: how many position NFTs does the user hold?
  const balance = (await client.readContract({
    address: transmuter,
    abi: TRANSMUTER_ABI,
    functionName: "balanceOf",
    args: [user],
  })) as bigint;

  if (balance === 0n) return { positions: [] };

  // Step 2: enumerate token ids — one multicall covering N reads.
  const indexCalls = Array.from({ length: Number(balance) }, (_, i) => ({
    address: transmuter,
    abi: TRANSMUTER_ABI,
    functionName: "tokenOfOwnerByIndex" as const,
    args: [user, BigInt(i)] as const,
  }));
  const idResults = await client.multicall({ contracts: indexCalls, allowFailure: false });
  const ids = idResults as readonly bigint[];

  // Step 3: pull the position struct for each id — second multicall.
  const positionCalls = ids.map(id => ({
    address: transmuter,
    abi: TRANSMUTER_ABI,
    functionName: "getPosition" as const,
    args: [id] as const,
  }));
  const positionResults = await client.multicall({ contracts: positionCalls, allowFailure: true });

  const positions: AlchemixTransmuterPosition[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = positionResults[i];
    if (r.status !== "success") continue; // matured-and-burned ids may revert; just skip
    const p = r.result as { amount: bigint; startBlock: bigint; maturationBlock: bigint };
    positions.push({
      id: ids[i],
      owner: user,
      amount: p.amount,
      startBlock: p.startBlock,
      maturationBlock: p.maturationBlock,
    });
  }

  return { positions };
}

export function useAlchemixTransmuterPositions({
  alchemist,
  marketId,
  chainId,
  enabled = true,
}: UseAlchemixTransmuterPositionsArgs) {
  const { address: user } = useAccount();
  const publicClient = usePublicClient({ chainId });

  const transmuter = useMemo(() => getTransmuterForAlchemist(alchemist), [alchemist]);

  const query = useQuery<FetchResult, Error>({
    queryKey: ["alchemix-transmuter-positions", chainId, marketId, transmuter, user],
    queryFn: async () => {
      if (!publicClient || !user || !transmuter) return { positions: [] };
      return fetchTransmuterPositions(publicClient, user, transmuter);
    },
    enabled: enabled && !!publicClient && !!user && !!transmuter,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  return {
    positions: query.data?.positions ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    /** True when no transmuter is registered for this market — UI can hide the section. */
    isUnavailable: !transmuter,
  };
}
