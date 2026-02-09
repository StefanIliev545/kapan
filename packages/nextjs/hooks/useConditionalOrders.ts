import { useCallback, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, decodeAbiParameters, encodeFunctionData, keccak256, toHex } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-stark/notification";

// ============ Protocol ID Constants ============
// Must match LtvTrigger.sol and adlAutomationHelpers.ts

function computeProtocolId(name: string): `0x${string}` {
  return keccak256(toHex(name)).slice(0, 10) as `0x${string}`;
}

export const PROTOCOL_IDS = {
  AAVE_V3: computeProtocolId("aave-v3"),
  COMPOUND_V3: computeProtocolId("compound-v3"),
  MORPHO_BLUE: computeProtocolId("morpho-blue"),
  EULER_V2: computeProtocolId("euler-v2"),
  VENUS: computeProtocolId("venus"),
} as const;

// ============ Context Decoding ============

export interface DecodedMorphoContext {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
  /** Computed market ID from params */
  marketId: `0x${string}`;
}

export interface DecodedEulerContext {
  borrowVault: Address;
  collateralVaults: Address[];
  subAccountIndex: number;
}

export interface DecodedCompoundContext {
  market: Address;
}

/**
 * Decode Morpho market context from bytes
 */
export function decodeMorphoContext(data: `0x${string}`): DecodedMorphoContext | undefined {
  if (!data || data === "0x") return undefined;
  try {
    const decoded = decodeAbiParameters(
      [{ type: "tuple", components: [
        { name: "loanToken", type: "address" },
        { name: "collateralToken", type: "address" },
        { name: "oracle", type: "address" },
        { name: "irm", type: "address" },
        { name: "lltv", type: "uint256" },
      ]}],
      data,
    );
    const params = decoded[0];
    // Compute marketId from params (same as Morpho contract)
    const marketId = keccak256(data) as `0x${string}`;
    return {
      loanToken: params.loanToken,
      collateralToken: params.collateralToken,
      oracle: params.oracle,
      irm: params.irm,
      lltv: params.lltv,
      marketId,
    };
  } catch {
    return undefined;
  }
}

/**
 * Decode Euler vault context from bytes
 */
export function decodeEulerContext(data: `0x${string}`): DecodedEulerContext | undefined {
  if (!data || data === "0x") return undefined;
  try {
    const decoded = decodeAbiParameters(
      [
        { type: "address" },
        { type: "address[]" },
        { type: "uint8" },
      ],
      data,
    );
    return {
      borrowVault: decoded[0] as Address,
      collateralVaults: decoded[1] as Address[],
      subAccountIndex: decoded[2],
    };
  } catch {
    return undefined;
  }
}

/**
 * Decode Compound market context from bytes
 */
export function decodeCompoundContext(data: `0x${string}`): DecodedCompoundContext | undefined {
  if (!data || data === "0x") return undefined;
  try {
    const decoded = decodeAbiParameters([{ type: "address" }], data);
    return { market: decoded[0] as Address };
  } catch {
    return undefined;
  }
}

// ============ Types ============

export enum ConditionalOrderStatus {
  None = 0,
  Active = 1,
  Completed = 2,
  Cancelled = 3,
}

export interface TriggerParams {
  protocolId: `0x${string}`;
  protocolContext: `0x${string}`;
  triggerLtvBps: bigint;
  targetLtvBps: bigint;
  collateralToken: Address;
  debtToken: Address;
  collateralDecimals: number;
  debtDecimals: number;
  maxSlippageBps: bigint;
  numChunks: number;
}

export interface ConditionalOrderParams {
  user: Address;
  trigger: Address;
  triggerStaticData: `0x${string}`;
  preInstructions: `0x${string}`;
  sellToken: Address;
  buyToken: Address;
  postInstructions: `0x${string}`;
  appDataHash: `0x${string}`;
  maxIterations: bigint;
  sellTokenRefundAddress: Address;
}

export interface ConditionalOrderContext {
  params: ConditionalOrderParams;
  status: ConditionalOrderStatus;
  iterationCount: bigint;
  createdAt: bigint;
}

export interface ConditionalOrder {
  orderHash: `0x${string}`;
  context: ConditionalOrderContext;
  triggerParams?: TriggerParams;
  isTriggerMet?: boolean;
  triggerReason?: string;
}

// ============ ABI ============

const CONDITIONAL_ORDER_MANAGER_ABI = [
  {
    name: "getUserOrders",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    name: "getOrder",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orderHash", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          {
            name: "params",
            type: "tuple",
            components: [
              { name: "user", type: "address" },
              { name: "trigger", type: "address" },
              { name: "triggerStaticData", type: "bytes" },
              { name: "preInstructions", type: "bytes" },
              { name: "sellToken", type: "address" },
              { name: "buyToken", type: "address" },
              { name: "postInstructions", type: "bytes" },
              { name: "appDataHash", type: "bytes32" },
              { name: "maxIterations", type: "uint256" },
              { name: "sellTokenRefundAddress", type: "address" },
            ],
          },
          { name: "status", type: "uint8" },
          { name: "iterationCount", type: "uint256" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "isTriggerMet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orderHash", type: "bytes32" }],
    outputs: [
      { name: "shouldExecute", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
  {
    name: "cancelOrder",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderHash", type: "bytes32" }],
    outputs: [],
  },
] as const;

// ============ Helpers ============

/**
 * Decode LtvTrigger.TriggerParams from bytes
 */
export function decodeTriggerParams(data: `0x${string}`): TriggerParams | undefined {
  try {
    const decoded = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "protocolId", type: "bytes4" },
            { name: "protocolContext", type: "bytes" },
            { name: "triggerLtvBps", type: "uint256" },
            { name: "targetLtvBps", type: "uint256" },
            { name: "collateralToken", type: "address" },
            { name: "debtToken", type: "address" },
            { name: "collateralDecimals", type: "uint8" },
            { name: "debtDecimals", type: "uint8" },
            { name: "maxSlippageBps", type: "uint256" },
            { name: "numChunks", type: "uint8" },
          ],
        },
      ],
      data,
    );

    const params = decoded[0];
    return {
      protocolId: params.protocolId as `0x${string}`,
      protocolContext: params.protocolContext as `0x${string}`,
      triggerLtvBps: params.triggerLtvBps,
      targetLtvBps: params.targetLtvBps,
      collateralToken: params.collateralToken,
      debtToken: params.debtToken,
      collateralDecimals: params.collateralDecimals,
      debtDecimals: params.debtDecimals,
      maxSlippageBps: params.maxSlippageBps,
      numChunks: params.numChunks,
    };
  } catch (error) {
    console.warn("[decodeTriggerParams] Failed to decode:", error);
    return undefined;
  }
}

/**
 * Format LTV basis points as percentage string
 */
export function formatLtvPercent(bps: bigint | number): string {
  const value = typeof bps === "bigint" ? Number(bps) : bps;
  return `${(value / 100).toFixed(1)}%`;
}

// ============ Hook ============

export interface UseConditionalOrdersOptions {
  /** Only return active orders */
  activeOnly?: boolean;
  /** Fetch trigger status for each order */
  fetchTriggerStatus?: boolean;
}

export function useConditionalOrders(options: UseConditionalOrdersOptions = {}) {
  const { activeOnly = false, fetchTriggerStatus = false } = options;

  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });

  const [isCancelling, setIsCancelling] = useState(false);
  const queryClient = useQueryClient();

  const { data: contractInfo } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager" as any,
    chainId: chainId as any,
  });

  const contractAddress = contractInfo?.address as Address | undefined;
  const isAvailable = !!contractAddress && !!publicClient && !!userAddress;

  /** Fetch trigger status for an active order. Returns {isTriggerMet, triggerReason}. */
  const fetchTriggerStatusForOrder = useCallback(async (
    orderHash: `0x${string}`,
  ): Promise<{ isTriggerMet?: boolean; triggerReason?: string }> => {
    if (!contractAddress || !publicClient) return {};
    try {
      const [shouldExecute, reason] = (await publicClient.readContract({
        address: contractAddress,
        abi: CONDITIONAL_ORDER_MANAGER_ABI,
        functionName: "isTriggerMet",
        args: [orderHash],
      })) as [boolean, string];
      return { isTriggerMet: shouldExecute, triggerReason: reason };
    } catch (error) {
      console.warn("[useConditionalOrders] Failed to fetch trigger status:", error);
      return {};
    }
  }, [contractAddress, publicClient]);

  /** Fetch and parse a single order by hash. Returns undefined if it should be skipped. */
  const fetchSingleOrder = useCallback(async (
    orderHash: `0x${string}`,
    onlyActive: boolean,
    withTriggerStatus: boolean,
  ): Promise<ConditionalOrder | undefined> => {
    if (!contractAddress || !publicClient) return undefined;

    const contextResult = await publicClient.readContract({
      address: contractAddress,
      abi: CONDITIONAL_ORDER_MANAGER_ABI,
      functionName: "getOrder",
      args: [orderHash],
    });

    const context = contextResult as {
      params: ConditionalOrderParams;
      status: number;
      iterationCount: bigint;
      createdAt: bigint;
    };

    if (onlyActive && context.status !== ConditionalOrderStatus.Active) return undefined;

    const triggerParams = decodeTriggerParams(context.params.triggerStaticData);

    const triggerInfo = (withTriggerStatus && context.status === ConditionalOrderStatus.Active)
      ? await fetchTriggerStatusForOrder(orderHash)
      : {};

    return {
      orderHash,
      context: {
        params: context.params,
        status: context.status as ConditionalOrderStatus,
        iterationCount: context.iterationCount,
        createdAt: context.createdAt,
      },
      triggerParams,
      ...triggerInfo,
    };
  }, [contractAddress, publicClient, fetchTriggerStatusForOrder]);

  const fetchOrders = useCallback(async (): Promise<ConditionalOrder[]> => {
    if (!isAvailable || !contractAddress || !publicClient || !userAddress) {
      return [];
    }

    try {
      const orderHashes = (await publicClient.readContract({
        address: contractAddress,
        abi: CONDITIONAL_ORDER_MANAGER_ABI,
        functionName: "getUserOrders",
        args: [userAddress],
      })) as readonly `0x${string}`[];

      if (orderHashes.length === 0) return [];

      const orders: ConditionalOrder[] = [];
      for (const hash of orderHashes) {
        try {
          const order = await fetchSingleOrder(hash, activeOnly, fetchTriggerStatus);
          if (order) orders.push(order);
        } catch (error) {
          console.warn(`[useConditionalOrders] Failed to fetch order ${hash}:`, error);
        }
      }

      orders.sort((a, b) => Number(b.context.createdAt - a.context.createdAt));
      return orders;
    } catch (error) {
      console.error("[useConditionalOrders] Failed to fetch orders:", error);
      return [];
    }
  }, [isAvailable, contractAddress, publicClient, userAddress, activeOnly, fetchTriggerStatus, fetchSingleOrder]);

  const query = useQuery({
    queryKey: ["conditionalOrders", chainId, userAddress, activeOnly, fetchTriggerStatus],
    queryFn: fetchOrders,
    enabled: isAvailable,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true, // Refresh when tab becomes active
  });

  // Memoized counts
  const { activeCount, totalCount } = useMemo(() => {
    const orders = query.data || [];
    return {
      activeCount: orders.filter(o => o.context.status === ConditionalOrderStatus.Active).length,
      totalCount: orders.length,
    };
  }, [query.data]);

  // Cancel order function
  const cancelOrder = useCallback(async (orderHash: `0x${string}`): Promise<boolean> => {
    if (!contractAddress || !walletClient || !publicClient || !userAddress) {
      notification.error("Wallet not connected or contract not available");
      return false;
    }

    setIsCancelling(true);
    const notificationId = notification.loading("Cancelling ADL order...");

    try {
      const txHash = await walletClient.sendTransaction({
        to: contractAddress,
        data: encodeFunctionData({
          abi: CONDITIONAL_ORDER_MANAGER_ABI,
          functionName: "cancelOrder",
          args: [orderHash],
        }),
        account: userAddress,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      notification.remove(notificationId);
      notification.success("ADL order cancelled successfully");

      // Invalidate ALL conditional order queries (different components use different options)
      await queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });

      return true;
    } catch (error) {
      notification.remove(notificationId);
      const err = error as { shortMessage?: string; message?: string };
      const message = err?.shortMessage || err?.message || "Failed to cancel order";
      notification.error(message);
      console.error("[useConditionalOrders] Cancel error:", error);
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, [contractAddress, walletClient, publicClient, userAddress, queryClient]);

  return {
    orders: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    cancelOrder,
    isCancelling,
    activeCount,
    totalCount,
    isAvailable,
    contractAddress,
  };
}

// ============ Helper Hook: Check if ADL is active for a position ============

export interface UseActiveADLOptions {
  /** Protocol name (aave, compound, morpho, euler, venus) */
  protocolName: string;
  /** Chain ID */
  chainId: number;
  /** Collateral token address */
  collateralToken?: Address;
  /** Debt token address */
  debtToken?: Address;
  /** Morpho market ID (uniqueKey) for precise matching */
  morphoMarketId?: string;
  /** Euler borrow vault address for precise matching */
  eulerBorrowVault?: Address;
  /** Compound market address for precise matching */
  compoundMarket?: Address;
}

/**
 * Get the expected protocol ID for a protocol name
 */
function getExpectedProtocolId(protocolName: string): `0x${string}` | undefined {
  const normalized = protocolName.toLowerCase();
  if (normalized.includes("aave")) return PROTOCOL_IDS.AAVE_V3;
  if (normalized.includes("compound")) return PROTOCOL_IDS.COMPOUND_V3;
  if (normalized.includes("morpho")) return PROTOCOL_IDS.MORPHO_BLUE;
  if (normalized.includes("euler")) return PROTOCOL_IDS.EULER_V2;
  if (normalized.includes("venus")) return PROTOCOL_IDS.VENUS;
  return undefined;
}

/** Case-insensitive address comparison. */
function addressMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Check if an order's protocol-specific context matches the given criteria.
 * Returns false if a match criterion is provided but the context doesn't match.
 */
function matchesProtocolContext(
  protocolContext: `0x${string}`,
  expectedProtocolId: `0x${string}` | undefined,
  morphoMarketId?: string,
  eulerBorrowVault?: Address,
  compoundMarket?: Address,
): boolean {
  if (morphoMarketId && expectedProtocolId === PROTOCOL_IDS.MORPHO_BLUE) {
    const decoded = decodeMorphoContext(protocolContext);
    if (!decoded || !addressMatch(decoded.marketId, morphoMarketId)) return false;
  }

  if (eulerBorrowVault && expectedProtocolId === PROTOCOL_IDS.EULER_V2) {
    const decoded = decodeEulerContext(protocolContext);
    if (!decoded || !addressMatch(decoded.borrowVault, eulerBorrowVault)) return false;
  }

  if (compoundMarket && expectedProtocolId === PROTOCOL_IDS.COMPOUND_V3) {
    const decoded = decodeCompoundContext(protocolContext);
    if (!decoded || !addressMatch(decoded.market, compoundMarket)) return false;
  }

  return true;
}

/**
 * Check if an order matches the ADL criteria (active, correct protocol, tokens, context).
 */
function isMatchingADLOrder(
  order: ConditionalOrder,
  expectedProtocolId: `0x${string}` | undefined,
  collateralToken?: Address,
  debtToken?: Address,
  morphoMarketId?: string,
  eulerBorrowVault?: Address,
  compoundMarket?: Address,
): boolean {
  if (order.context.status !== ConditionalOrderStatus.Active) return false;
  if (!order.triggerParams) return false;

  if (expectedProtocolId && order.triggerParams.protocolId !== expectedProtocolId) return false;
  if (collateralToken && !addressMatch(order.triggerParams.collateralToken, collateralToken)) return false;
  if (debtToken && !addressMatch(order.triggerParams.debtToken, debtToken)) return false;

  return matchesProtocolContext(
    order.triggerParams.protocolContext, expectedProtocolId,
    morphoMarketId, eulerBorrowVault, compoundMarket
  );
}

/**
 * Check if there's an active ADL order for a specific position
 */
export function useActiveADL(options: UseActiveADLOptions) {
  const {
    protocolName,
    chainId,
    collateralToken,
    debtToken,
    morphoMarketId,
    eulerBorrowVault,
    compoundMarket,
  } = options;

  const { address: userAddress } = useAccount();
  const currentChainId = useChainId();

  // Only fetch if on the correct chain
  const isCorrectChain = chainId === currentChainId;

  const { orders, isLoading, isAvailable } = useConditionalOrders({
    activeOnly: true,
    fetchTriggerStatus: true, // Need this to check current LTV vs trigger
  });

  // Find matching ADL order
  const activeADL = useMemo(() => {
    if (!isCorrectChain || !userAddress || orders.length === 0) return null;

    const expectedProtocolId = getExpectedProtocolId(protocolName);

    return orders.find(order =>
      isMatchingADLOrder(order, expectedProtocolId, collateralToken, debtToken, morphoMarketId, eulerBorrowVault, compoundMarket)
    );
  }, [orders, isCorrectChain, userAddress, protocolName, collateralToken, debtToken, morphoMarketId, eulerBorrowVault, compoundMarket]);

  return {
    hasActiveADL: !!activeADL,
    activeADL,
    isLoading,
    isAvailable: isAvailable && isCorrectChain,
    triggerLtvBps: activeADL?.triggerParams?.triggerLtvBps,
    targetLtvBps: activeADL?.triggerParams?.targetLtvBps,
    isTriggerMet: activeADL?.isTriggerMet,
  };
}

// ============ Helper Hook: Check if user has any active conditional orders ============

/**
 * Check if user has any active conditional orders (for deauthorization guard)
 */
export function useHasActiveConditionalOrders() {
  const { orders, isLoading, isAvailable } = useConditionalOrders({
    activeOnly: true,
    fetchTriggerStatus: false,
  });

  const activeOrders = useMemo(() => {
    return orders.filter(o => o.context.status === ConditionalOrderStatus.Active);
  }, [orders]);

  // Get all tokens involved in active orders
  const involvedTokens = useMemo(() => {
    const tokens = new Set<string>();
    activeOrders.forEach(order => {
      tokens.add(order.context.params.sellToken.toLowerCase());
      tokens.add(order.context.params.buyToken.toLowerCase());
    });
    return tokens;
  }, [activeOrders]);

  return {
    hasActiveOrders: activeOrders.length > 0,
    activeOrderCount: activeOrders.length,
    activeOrders,
    involvedTokens,
    isLoading,
    isAvailable,
    /** Check if a specific token is involved in any active order */
    isTokenInvolved: useCallback((token: Address) => {
      return involvedTokens.has(token.toLowerCase());
    }, [involvedTokens]),
  };
}
