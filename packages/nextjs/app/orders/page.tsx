"use client";

import { useMemo, useCallback } from "react";
import Image from "next/image";
import { useAccount, useChainId } from "wagmi";
import { type Address } from "viem";
import { useTokenInfo } from "~~/hooks/useTokenInfo";
import { tokenNameToLogo, PROTOCOL_ICONS } from "~~/contracts/externalContracts";
import { timeAgo } from "~~/utils/deadline";
import { truncateAddress } from "~~/utils/address";
import {
  useConditionalOrders,
  ConditionalOrderStatus,
  formatLtvPercent,
  type ConditionalOrder,
  PROTOCOL_IDS,
} from "~~/hooks/useConditionalOrders";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { LoadingOverlay } from "~~/components/common/Loading";
import { ShieldCheckIcon, ArrowTrendingUpIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { type KapanProtocol } from "~~/utils/cow/appData";
import { decodeAbiParameters } from "viem";

// ============ Limit Price Trigger Decoding ============

interface DecodedLimitPriceParams {
  protocolId: `0x${string}`;
  sellToken: Address;
  buyToken: Address;
  sellDecimals: number;
  buyDecimals: number;
  limitPrice: bigint;
  triggerAbovePrice: boolean;
  totalSellAmount: bigint;
  totalBuyAmount: bigint;
  numChunks: number;
  isKindBuy: boolean;
}

function decodeLimitPriceTriggerParams(data: `0x${string}`): DecodedLimitPriceParams | undefined {
  try {
    const decoded = decodeAbiParameters(
      [{
        type: "tuple",
        components: [
          { name: "protocolId", type: "bytes4" },
          { name: "protocolContext", type: "bytes" },
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "sellDecimals", type: "uint8" },
          { name: "buyDecimals", type: "uint8" },
          { name: "limitPrice", type: "uint256" },
          { name: "triggerAbovePrice", type: "bool" },
          { name: "totalSellAmount", type: "uint256" },
          { name: "totalBuyAmount", type: "uint256" },
          { name: "numChunks", type: "uint8" },
          { name: "maxSlippageBps", type: "uint256" },
          { name: "isKindBuy", type: "bool" },
        ],
      }],
      data,
    );
    const p = decoded[0];
    return {
      protocolId: p.protocolId as `0x${string}`,
      sellToken: p.sellToken,
      buyToken: p.buyToken,
      sellDecimals: p.sellDecimals,
      buyDecimals: p.buyDecimals,
      limitPrice: p.limitPrice,
      triggerAbovePrice: p.triggerAbovePrice,
      totalSellAmount: p.totalSellAmount,
      totalBuyAmount: p.totalBuyAmount,
      numChunks: p.numChunks,
      isKindBuy: p.isKindBuy,
    };
  } catch {
    return undefined;
  }
}

// ============ Protocol ID to Name Mapping ============

function getProtocolNameFromId(protocolId: `0x${string}`): KapanProtocol | undefined {
  if (protocolId === PROTOCOL_IDS.AAVE_V3) return "aave";
  if (protocolId === PROTOCOL_IDS.COMPOUND_V3) return "compound";
  if (protocolId === PROTOCOL_IDS.MORPHO_BLUE) return "morpho";
  if (protocolId === PROTOCOL_IDS.EULER_V2) return "euler";
  if (protocolId === PROTOCOL_IDS.VENUS) return "venus";
  return undefined;
}

type OrderType = "adl" | "autoLeverage" | "limit";

export default function OrdersPage() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();

  // Fetch conditional orders
  const {
    orders,
    isLoading,
    isAvailable,
    refetch,
    cancelOrder,
    isCancelling,
  } = useConditionalOrders({ fetchTriggerStatus: true });

  // Get trigger contract addresses to differentiate order types
  const { data: autoLeverageTriggerInfo } = useDeployedContractInfo({ contractName: "AutoLeverageTrigger", chainId } as any);
  const autoLeverageTriggerAddress = autoLeverageTriggerInfo?.address?.toLowerCase();
  const { data: limitPriceTriggerInfo } = useDeployedContractInfo({ contractName: "LimitPriceTrigger", chainId } as any);
  const limitPriceTriggerAddress = limitPriceTriggerInfo?.address?.toLowerCase();
  const { data: ltvTriggerInfo } = useDeployedContractInfo({ contractName: "LtvTrigger", chainId } as any);
  const ltvTriggerAddress = ltvTriggerInfo?.address?.toLowerCase();

  const triggersLoaded = !!(autoLeverageTriggerAddress || limitPriceTriggerAddress || ltvTriggerAddress);

  // Token addresses for fetching info
  const tokenAddresses = useMemo(() => {
    const addresses = new Set<Address>();
    orders.forEach(o => {
      addresses.add(o.context.params.sellToken as Address);
      addresses.add(o.context.params.buyToken as Address);
    });
    return Array.from(addresses);
  }, [orders]);

  const tokenInfoMap = useTokenInfo(tokenAddresses, chainId);

  const getTokenSymbol = useCallback((address: string): string => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.symbol ?? truncateAddress(address);
  }, [tokenInfoMap]);

  // Categorize orders by type
  const getOrderType = useCallback((order: ConditionalOrder): OrderType => {
    const triggerAddress = order.context.params.trigger.toLowerCase();
    if (autoLeverageTriggerAddress && triggerAddress === autoLeverageTriggerAddress) {
      return "autoLeverage";
    } else if (limitPriceTriggerAddress && triggerAddress === limitPriceTriggerAddress) {
      return "limit";
    } else if (ltvTriggerAddress && triggerAddress === ltvTriggerAddress) {
      return "adl";
    }
    return "adl"; // Default fallback
  }, [autoLeverageTriggerAddress, limitPriceTriggerAddress, ltvTriggerAddress]);

  // Get protocol from order
  const getOrderProtocol = useCallback((order: ConditionalOrder): KapanProtocol | undefined => {
    const triggerAddr = order.context.params.trigger.toLowerCase();
    if (limitPriceTriggerAddress && triggerAddr === limitPriceTriggerAddress) {
      const params = decodeLimitPriceTriggerParams(order.context.params.triggerStaticData as `0x${string}`);
      return params ? getProtocolNameFromId(params.protocolId) : undefined;
    }
    if (order.triggerParams) {
      return getProtocolNameFromId(order.triggerParams.protocolId);
    }
    return undefined;
  }, [limitPriceTriggerAddress]);

  // Group orders by status
  const activeOrders = orders.filter(o => o.context.status === ConditionalOrderStatus.Active);
  const completedOrders = orders.filter(o => o.context.status === ConditionalOrderStatus.Completed);
  const cancelledOrders = orders.filter(o => o.context.status === ConditionalOrderStatus.Cancelled);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  if (!userAddress) {
    return (
      <div className="min-h-screen px-4 py-12 md:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl py-20 text-center">
          <h1 className="mb-4 text-3xl font-bold">Orders</h1>
          <p className="text-base-content/50">Connect your wallet to view your orders</p>
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="min-h-screen px-4 py-12 md:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl py-20 text-center">
          <h1 className="mb-4 text-3xl font-bold">Orders</h1>
          <p className="text-base-content/50">Conditional orders are not available on this chain</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="text-base-content/50 hover:text-base-content mb-6 inline-flex items-center gap-2 text-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Orders</h1>
              <p className="text-base-content/50 mt-1">
                {orders.length} total · {activeOrders.length} active
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="hover:bg-base-200 rounded-lg p-2 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`text-base-content/50 size-5${isLoading ? ' animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {(isLoading && orders.length === 0) || !triggersLoaded ? (
          <LoadingOverlay size="lg" label="Loading orders..." />
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-base-content/50 text-lg">No orders found</p>
            <p className="text-base-content/40 mt-2 text-sm">Create an ADL or Auto-Leverage order from a position</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Orders */}
            {activeOrders.length > 0 && (
              <section>
                <h2 className="text-base-content/50 mb-4 text-sm font-medium uppercase tracking-wide">
                  Active ({activeOrders.length})
                </h2>
                <div className="space-y-3">
                  {activeOrders.map((order) => (
                    <OrderRow
                      key={order.orderHash}
                      order={order}
                      orderType={getOrderType(order)}
                      protocol={getOrderProtocol(order)}
                      getTokenSymbol={getTokenSymbol}
                      onCancel={cancelOrder}
                      isCancelling={isCancelling}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Orders */}
            {completedOrders.length > 0 && (
              <section>
                <h2 className="text-base-content/50 mb-4 text-sm font-medium uppercase tracking-wide">
                  Completed ({completedOrders.length})
                </h2>
                <div className="space-y-3">
                  {completedOrders.map((order) => (
                    <OrderRow
                      key={order.orderHash}
                      order={order}
                      orderType={getOrderType(order)}
                      protocol={getOrderProtocol(order)}
                      getTokenSymbol={getTokenSymbol}
                      dimmed
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Cancelled Orders */}
            {cancelledOrders.length > 0 && (
              <section>
                <h2 className="text-base-content/50 mb-4 text-sm font-medium uppercase tracking-wide">
                  Cancelled ({cancelledOrders.length})
                </h2>
                <div className="space-y-3">
                  {cancelledOrders.map((order) => (
                    <OrderRow
                      key={order.orderHash}
                      order={order}
                      orderType={getOrderType(order)}
                      protocol={getOrderProtocol(order)}
                      getTokenSymbol={getTokenSymbol}
                      dimmed
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  orderType,
  protocol,
  getTokenSymbol,
  onCancel,
  isCancelling,
  dimmed = false,
}: {
  order: ConditionalOrder;
  orderType: OrderType;
  protocol?: KapanProtocol;
  getTokenSymbol: (address: string) => string;
  onCancel?: (orderHash: `0x${string}`) => Promise<boolean>;
  isCancelling?: boolean;
  dimmed?: boolean;
}) {
  const { orderHash, context, triggerParams, isTriggerMet } = order;
  const { status, iterationCount, createdAt } = context;
  const isActive = status === ConditionalOrderStatus.Active;

  const sellSymbol = getTokenSymbol(context.params.sellToken);
  const buySymbol = getTokenSymbol(context.params.buyToken);

  const maxIterations = Number(context.params.maxIterations);
  const completedIterations = Number(iterationCount);
  const progressPercent = maxIterations > 0 ? (completedIterations / maxIterations) * 100 : 0;

  // Decode limit price params if applicable
  let limitPriceParams: DecodedLimitPriceParams | undefined;
  if (orderType === "limit") {
    limitPriceParams = decodeLimitPriceTriggerParams(context.params.triggerStaticData as `0x${string}`);
  }

  // Order type styling
  let orderTypeLabel: string;
  let OrderIcon: typeof ArrowTrendingUpIcon;
  let badgeClass: string;

  if (orderType === "autoLeverage") {
    orderTypeLabel = "Auto Leverage";
    OrderIcon = ArrowTrendingUpIcon;
    badgeClass = "bg-info/20 text-info";
  } else if (orderType === "limit") {
    orderTypeLabel = "Limit Order";
    OrderIcon = ArrowsRightLeftIcon;
    badgeClass = "bg-primary/20 text-primary";
  } else {
    orderTypeLabel = "Auto Deleverage";
    OrderIcon = ShieldCheckIcon;
    badgeClass = "bg-success/20 text-success";
  }

  const protocolIcon = protocol ? PROTOCOL_ICONS[protocol] : undefined;

  return (
    <div className={`border-base-200 hover:border-base-300 hover:bg-base-100/50 rounded-lg border p-4 transition-all ${dimmed ? 'opacity-50' : ''}`}>
      {/* Row 1: Type badge, protocol, status */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-medium flex items-center gap-1 ${badgeClass}`}>
            <OrderIcon className="size-3.5" />
            {orderTypeLabel}
          </span>
          {protocolIcon && (
            <span className="bg-base-200 flex items-center gap-1 rounded px-2 py-1 text-xs font-medium">
              <Image src={protocolIcon} alt={protocol || ""} width={14} height={14} className="rounded-full" />
              {protocol?.charAt(0).toUpperCase()}{protocol?.slice(1)}
            </span>
          )}
          {isTriggerMet && (
            <span className="bg-warning/20 text-warning rounded px-2 py-1 text-xs font-medium">
              Trigger Met
            </span>
          )}
        </div>
        <span className={`rounded px-2 py-1 text-xs font-medium ${
          isActive ? 'bg-success/20 text-success' :
          status === ConditionalOrderStatus.Completed ? 'bg-base-200 text-base-content/60' :
          'bg-error/20 text-error'
        }`}>
          {isActive ? 'Active' : status === ConditionalOrderStatus.Completed ? 'Completed' : 'Cancelled'}
        </span>
      </div>

      {/* Row 2: Token pair */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center -space-x-2">
          <Image src={tokenNameToLogo(sellSymbol)} alt={sellSymbol} width={28} height={28} className="ring-base-100 rounded-full ring-2" />
          <Image src={tokenNameToLogo(buySymbol)} alt={buySymbol} width={28} height={28} className="ring-base-100 rounded-full ring-2" />
        </div>
        <span className="text-lg font-semibold">{sellSymbol} → {buySymbol}</span>
        <span className="text-base-content/40 text-sm">{timeAgo(createdAt)}</span>
      </div>

      {/* Row 3: LTV info for ADL/Auto-Leverage */}
      {triggerParams && orderType !== "limit" && (
        <div className="bg-base-200/50 mb-3 rounded-lg p-3">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-base-content/60">Trigger LTV: </span>
              <span className="text-warning font-medium">{formatLtvPercent(triggerParams.triggerLtvBps)}</span>
            </div>
            <div>
              <span className="text-base-content/60">Target LTV: </span>
              <span className="text-success font-medium">{formatLtvPercent(triggerParams.targetLtvBps)}</span>
            </div>
            <div>
              <span className="text-base-content/60">Chunks: </span>
              <span className="font-medium">{triggerParams.numChunks}</span>
            </div>
          </div>
        </div>
      )}

      {/* Row 3b: Limit order details */}
      {orderType === "limit" && limitPriceParams && (
        <div className="bg-base-200/50 mb-3 rounded-lg p-3">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-base-content/60">
                {limitPriceParams.triggerAbovePrice ? "When price ≥ " : "When price ≤ "}
              </span>
              <span className="font-medium">${(Number(limitPriceParams.limitPrice) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            </div>
            <div>
              <span className="text-base-content/60">Chunks: </span>
              <span className="font-medium">{limitPriceParams.numChunks}</span>
            </div>
          </div>
        </div>
      )}

      {/* Row 4: Progress */}
      {maxIterations > 0 && (
        <div className="mb-3">
          <div className="bg-base-200 h-1.5 w-full rounded-full">
            <div
              className={`h-full rounded-full transition-all ${isActive ? 'bg-primary' : 'bg-base-300'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-base-content/40">{completedIterations}/{maxIterations} iterations</span>
            <span className="text-base-content/50 font-medium">{progressPercent.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Row 5: Actions */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-base-content/40 font-mono">{truncateAddress(orderHash)}</span>
        {isActive && onCancel && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onCancel(orderHash);
            }}
            disabled={isCancelling}
            className="text-error hover:underline disabled:opacity-50"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Order'}
          </button>
        )}
      </div>
    </div>
  );
}
