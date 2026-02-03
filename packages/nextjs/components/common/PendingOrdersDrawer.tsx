"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAccount, useChainId } from "wagmi";
import { type Address, decodeAbiParameters, formatUnits } from "viem";
import { useTokenInfo } from "~~/hooks/useTokenInfo";
import { tokenNameToLogo, PROTOCOL_ICONS } from "~~/contracts/externalContracts";
import { ORDER_CREATED_EVENT } from "~~/utils/orderNotes";
import { timeAgo } from "~~/utils/deadline";
import { truncateAddress } from "~~/utils/address";
import {
  useConditionalOrders,
  ConditionalOrderStatus,
  formatLtvPercent,
  type ConditionalOrder,
  PROTOCOL_IDS,
} from "~~/hooks/useConditionalOrders";
import { useConditionalOrderEvents } from "~~/hooks/useConditionalOrderEvents";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { ShieldCheckIcon, ArrowTrendingUpIcon, ArrowsRightLeftIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { type KapanProtocol } from "~~/utils/cow/appData";

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


const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export function PendingOrdersDrawer() {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();

  // Fetch conditional orders (ADL, Auto-Leverage, Limit Orders, Swaps)
  const {
    orders: conditionalOrders,
    activeCount,
    isAvailable,
    refetch: refetchOrders,
    cancelOrder,
    isCancelling,
    isLoading,
  } = useConditionalOrders({ fetchTriggerStatus: true });

  // Watch for conditional order events (created, completed, cancelled) to trigger real-time refreshes
  useConditionalOrderEvents();

  // Get trigger contract addresses to differentiate order types
  const { data: autoLeverageTriggerInfo } = useDeployedContractInfo({ contractName: "AutoLeverageTrigger", chainId } as any);
  const autoLeverageTriggerAddress = autoLeverageTriggerInfo?.address?.toLowerCase();
  const { data: limitPriceTriggerInfo } = useDeployedContractInfo({ contractName: "LimitPriceTrigger", chainId } as any);
  const limitPriceTriggerAddress = limitPriceTriggerInfo?.address?.toLowerCase();
  const { data: ltvTriggerInfo } = useDeployedContractInfo({ contractName: "LtvTrigger", chainId } as any);
  const ltvTriggerAddress = ltvTriggerInfo?.address?.toLowerCase();

  const [isOpen, setIsOpen] = useState(false);
  // Track if we have a pending order that hasn't been fetched yet
  const [hasPendingNew, setHasPendingNew] = useState(false);
  // Protocol filter - null means "All"
  const [selectedProtocol, setSelectedProtocol] = useState<KapanProtocol | null>(null);

  // Listen for new order created events and refetch
  useEffect(() => {
    const handleOrderCreated = () => {
      setHasPendingNew(true);
      setTimeout(() => {
        refetchOrders().then(() => setHasPendingNew(false));
      }, 2000);
    };

    window.addEventListener(ORDER_CREATED_EVENT, handleOrderCreated);
    return () => window.removeEventListener(ORDER_CREATED_EVENT, handleOrderCreated);
  }, [refetchOrders]);

  // Toggle drawer open/close
  const toggleDrawer = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // Close drawer
  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Filter orders: show ALL active orders (regardless of age) + recent completed/cancelled (past 7 days)
  const recentOrders = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return conditionalOrders
      .filter(o => {
        // Always show active orders
        if (o.context.status === ConditionalOrderStatus.Active) return true;
        // Only show recent completed/cancelled orders
        return now - Number(o.context.createdAt) < SEVEN_DAYS_SECONDS;
      })
      .sort((a, b) => Number(b.context.createdAt) - Number(a.context.createdAt));
  }, [conditionalOrders]);

  const hasOlderOrders = conditionalOrders.length > recentOrders.length;

  // Helper to get protocol from order
  const getOrderProtocol = useCallback((order: ConditionalOrder): KapanProtocol | undefined => {
    const triggerAddr = order.context.params.trigger.toLowerCase();
    if (limitPriceTriggerAddress && triggerAddr === limitPriceTriggerAddress) {
      // Decode limit price trigger params
      const params = decodeLimitPriceTriggerParams(order.context.params.triggerStaticData as `0x${string}`);
      return params ? getProtocolNameFromId(params.protocolId) : undefined;
    }
    // For LTV-based triggers (ADL/AL), get from triggerParams
    if (order.triggerParams) {
      return getProtocolNameFromId(order.triggerParams.protocolId);
    }
    return undefined;
  }, [limitPriceTriggerAddress]);

  // Extract unique protocols from orders
  const availableProtocols = useMemo(() => {
    const protocols = new Set<KapanProtocol>();
    for (const order of recentOrders) {
      const protocol = getOrderProtocol(order);
      if (protocol) protocols.add(protocol);
    }
    return Array.from(protocols).sort();
  }, [recentOrders, getOrderProtocol]);

  // Filter orders by selected protocol
  const filteredOrders = useMemo(() => {
    if (!selectedProtocol) return recentOrders;
    return recentOrders.filter(order => getOrderProtocol(order) === selectedProtocol);
  }, [recentOrders, selectedProtocol, getOrderProtocol]);

  // Re-categorize filtered orders
  const filteredCategorizedOrders = useMemo(() => {
    const adlOrders: ConditionalOrder[] = [];
    const autoLeverageOrders: ConditionalOrder[] = [];
    const limitOrders: ConditionalOrder[] = [];
    const unknownOrders: ConditionalOrder[] = [];

    for (const order of filteredOrders) {
      const triggerAddress = order.context.params.trigger.toLowerCase();
      if (autoLeverageTriggerAddress && triggerAddress === autoLeverageTriggerAddress) {
        autoLeverageOrders.push(order);
      } else if (limitPriceTriggerAddress && triggerAddress === limitPriceTriggerAddress) {
        limitOrders.push(order);
      } else if (ltvTriggerAddress && triggerAddress === ltvTriggerAddress) {
        adlOrders.push(order);
      } else {
        // Put unrecognized triggers in unknown category so they can still be cancelled
        unknownOrders.push(order);
      }
    }

    return {
      adl: {
        active: adlOrders.filter(o => o.context.status === ConditionalOrderStatus.Active),
        completed: adlOrders.filter(o => o.context.status === ConditionalOrderStatus.Completed),
      },
      autoLeverage: {
        active: autoLeverageOrders.filter(o => o.context.status === ConditionalOrderStatus.Active),
        completed: autoLeverageOrders.filter(o => o.context.status === ConditionalOrderStatus.Completed),
      },
      limit: {
        active: limitOrders.filter(o => o.context.status === ConditionalOrderStatus.Active),
        completed: limitOrders.filter(o => o.context.status === ConditionalOrderStatus.Completed),
      },
      unknown: {
        active: unknownOrders.filter(o => o.context.status === ConditionalOrderStatus.Active),
        completed: unknownOrders.filter(o => o.context.status === ConditionalOrderStatus.Completed),
      },
    };
  }, [filteredOrders, autoLeverageTriggerAddress, limitPriceTriggerAddress, ltvTriggerAddress]);

  // Filtered completed orders (not cancelled)
  const filteredCompletedOrders = useMemo(() => [
    ...filteredCategorizedOrders.adl.completed,
    ...filteredCategorizedOrders.autoLeverage.completed,
    ...filteredCategorizedOrders.limit.completed,
    ...filteredCategorizedOrders.unknown.completed,
  ].sort((a, b) => Number(b.context.createdAt) - Number(a.context.createdAt)), [filteredCategorizedOrders]);

  // Token addresses for fetching info
  const tokenAddresses = useMemo(() => {
    const addresses = new Set<Address>();
    conditionalOrders.forEach(o => {
      addresses.add(o.context.params.sellToken as Address);
      addresses.add(o.context.params.buyToken as Address);
    });
    return Array.from(addresses);
  }, [conditionalOrders]);

  const tokenInfoMap = useTokenInfo(tokenAddresses, chainId);

  const getTokenSymbol = useCallback((address: string): string => {
    const info = tokenInfoMap.get(address.toLowerCase());
    return info?.symbol ?? truncateAddress(address);
  }, [tokenInfoMap]);

  // Don't render anything if not connected or no contract available
  if (!isAvailable || !userAddress) return null;

  // Show button if we have orders OR if a new order was just created
  const showButton = conditionalOrders.length > 0 || hasPendingNew;

  return (
    <>
      {/* Floating Button - only show if we have orders */}
      {showButton && (
        <button
          onClick={toggleDrawer}
          className="bg-primary text-primary-content hover:bg-primary/90 fixed bottom-4 right-4 z-50 flex h-12 items-center gap-2 rounded-lg px-4 shadow-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="font-medium">Orders</span>
          {activeCount > 0 && (
            <span className="bg-primary-content text-primary rounded px-1.5 py-0.5 text-xs font-bold">{activeCount}</span>
          )}
        </button>
      )}

      {/* Drawer */}
      {isOpen && (
        <div className="bg-base-100 border-base-300 fixed bottom-20 right-4 z-50 flex max-h-[75vh] w-[420px] flex-col overflow-hidden rounded-lg border shadow-2xl">
          {/* Header */}
          <div className="border-base-200 flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Orders</span>
              <button
                onClick={() => refetchOrders()}
                disabled={isLoading}
                className="hover:bg-base-200 rounded p-1 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`text-base-content/50 size-4${isLoading ? ' animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <button onClick={closeDrawer} className="hover:bg-base-200 rounded p-1 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="text-base-content/50 size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Protocol Tabs */}
          {availableProtocols.length > 1 && (
            <div className="border-base-200 flex items-center gap-4 border-b px-4 py-2">
              <button
                onClick={() => setSelectedProtocol(null)}
                className={`flex items-center gap-1.5 text-sm transition-colors ${
                  selectedProtocol === null
                    ? "text-base-content border-primary border-b-2 pb-0.5 font-medium"
                    : "text-base-content/50 hover:text-base-content"
                }`}
              >
                All
              </button>
              {availableProtocols.map(protocol => (
                <button
                  key={protocol}
                  onClick={() => setSelectedProtocol(protocol)}
                  className={`flex items-center gap-1.5 text-sm transition-colors ${
                    selectedProtocol === protocol
                      ? "text-base-content border-primary border-b-2 pb-0.5 font-medium"
                      : "text-base-content/50 hover:text-base-content"
                  }`}
                >
                  <Image src={PROTOCOL_ICONS[protocol]} alt={protocol} width={14} height={14} className="rounded-full" />
                  {protocol.charAt(0).toUpperCase() + protocol.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && conditionalOrders.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : conditionalOrders.length === 0 ? (
              <div className="text-base-content/50 py-16 text-center">
                <p className="text-sm">No orders yet</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-base-content/50 py-16 text-center">
                <p className="text-sm">No orders for this protocol</p>
                {hasOlderOrders && (
                  <Link href="/orders" className="text-primary mt-2 inline-block text-sm hover:underline">
                    View all orders
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-base-200 divide-y">
                {/* Active ADL Orders Section */}
                {filteredCategorizedOrders.adl.active.length > 0 && (
                  <>
                    <div className="border-base-300 bg-base-100 sticky top-0 border-y px-4 py-2">
                      <span className="text-base-content/60 text-xs font-bold uppercase tracking-tight">
                        <ShieldCheckIcon className="mr-1 inline size-3" />
                        Auto-Deleverage Protection
                      </span>
                    </div>
                    {filteredCategorizedOrders.adl.active.map((order) => renderOrderItem(order, "adl"))}
                  </>
                )}

                {/* Active Auto-Leverage Orders Section */}
                {filteredCategorizedOrders.autoLeverage.active.length > 0 && (
                  <>
                    <div className="border-base-300 bg-base-100 sticky top-0 border-y px-4 py-2">
                      <span className="text-base-content/60 text-xs font-bold uppercase tracking-tight">
                        <ArrowTrendingUpIcon className="mr-1 inline size-3" />
                        Auto-Leverage
                      </span>
                    </div>
                    {filteredCategorizedOrders.autoLeverage.active.map((order) => renderOrderItem(order, "autoLeverage"))}
                  </>
                )}

                {/* Active Limit Orders Section */}
                {filteredCategorizedOrders.limit.active.length > 0 && (
                  <>
                    <div className="border-base-300 bg-base-100 sticky top-0 border-y px-4 py-2">
                      <span className="text-base-content/60 text-xs font-bold uppercase tracking-tight">
                        <ArrowsRightLeftIcon className="mr-1 inline size-3" />
                        Limit Orders
                      </span>
                    </div>
                    {filteredCategorizedOrders.limit.active.map((order) => renderOrderItem(order, "limit"))}
                  </>
                )}

                {/* Unknown Orders Section - orders with unrecognized triggers */}
                {filteredCategorizedOrders.unknown.active.length > 0 && (
                  <>
                    <div className="border-base-300 bg-base-100 sticky top-0 border-y px-4 py-2">
                      <span className="text-base-content/60 text-xs font-bold uppercase tracking-tight">
                        <QuestionMarkCircleIcon className="mr-1 inline size-3" />
                        Unknown Orders
                      </span>
                    </div>
                    {filteredCategorizedOrders.unknown.active.map((order) => renderOrderItem(order, "unknown"))}
                  </>
                )}

                {/* Completed orders section */}
                {filteredCompletedOrders.length > 0 && (
                  <>
                    <div className="border-base-300 bg-base-100 sticky top-0 border-y px-4 py-2">
                      <span className="text-base-content/60 text-xs font-bold uppercase tracking-tight">Completed</span>
                    </div>
                    {/* Show last 3 completed orders in the drawer */}
                    {filteredCompletedOrders.slice(0, 3).map((order) => {
                      const triggerAddr = order.context.params.trigger.toLowerCase();
                      let type: "adl" | "autoLeverage" | "limit" | "unknown" = "unknown";
                      if (autoLeverageTriggerAddress && triggerAddr === autoLeverageTriggerAddress) type = "autoLeverage";
                      else if (limitPriceTriggerAddress && triggerAddr === limitPriceTriggerAddress) type = "limit";
                      else if (ltvTriggerAddress && triggerAddr === ltvTriggerAddress) type = "adl";
                      return renderOrderItem(order, type);
                    })}
                    {filteredCompletedOrders.length > 3 && (
                      <div className="px-4 py-2 text-center">
                        <Link href="/orders" className="text-primary text-xs hover:underline">
                          View all completed orders
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {recentOrders.length > 0 && (
            <div className="border-base-200 text-base-content/40 flex justify-between border-t px-4 py-2 text-xs">
              <span>{activeCount} active{hasOlderOrders ? ` · ${conditionalOrders.length - recentOrders.length} older` : ''}</span>
              <Link href="/orders" className="text-primary hover:underline">
                View all
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Helper function to render an order item
  function renderOrderItem(order: ConditionalOrder, orderType: "adl" | "autoLeverage" | "limit" | "unknown") {
    const { orderHash, context, triggerParams, isTriggerMet } = order;
    const { status, iterationCount, createdAt } = context;
    const isActive = status === ConditionalOrderStatus.Active;

    const sellSymbol = getTokenSymbol(context.params.sellToken);
    const buySymbol = getTokenSymbol(context.params.buyToken);

    const maxIterations = Number(context.params.maxIterations);
    const completedIterations = Number(iterationCount);
    const progressPercent = maxIterations > 0 ? (completedIterations / maxIterations) * 100 : 0;

    // Get protocol from trigger params
    let protocolName: KapanProtocol | undefined;
    let limitPriceParams: DecodedLimitPriceParams | undefined;

    if (orderType === "limit" && context.params.triggerStaticData) {
      // Decode limit price trigger params
      limitPriceParams = decodeLimitPriceTriggerParams(context.params.triggerStaticData as `0x${string}`);
      if (limitPriceParams) {
        protocolName = getProtocolNameFromId(limitPriceParams.protocolId);
      }
    } else if (triggerParams) {
      // Get protocol from LTV trigger params
      protocolName = getProtocolNameFromId(triggerParams.protocolId);
    }

    // Determine order label and styling
    let orderTypeLabel: string;
    let OrderIcon: typeof ArrowTrendingUpIcon;
    let badgeClass: string;

    if (orderType === "autoLeverage") {
      orderTypeLabel = "Auto Leverage";
      OrderIcon = ArrowTrendingUpIcon;
      badgeClass = "bg-info/20 text-info";
    } else if (orderType === "limit") {
      // For limit orders, try to infer operation type from token pair
      // In the future, we can fetch appData for more accurate labels
      orderTypeLabel = "Swap";
      OrderIcon = ArrowsRightLeftIcon;
      badgeClass = "bg-primary/20 text-primary";
    } else if (orderType === "unknown") {
      orderTypeLabel = "Unknown";
      OrderIcon = QuestionMarkCircleIcon;
      badgeClass = "bg-warning/20 text-warning";
    } else {
      orderTypeLabel = "Auto Deleverage";
      OrderIcon = ShieldCheckIcon;
      badgeClass = "bg-success/20 text-success";
    }

    // Get protocol icon
    const protocolIcon = protocolName ? PROTOCOL_ICONS[protocolName] : undefined;

    return (
      <div key={orderHash} className={`hover:bg-base-50 px-4 py-3 transition-colors ${!isActive ? 'opacity-60' : ''}`}>
        {/* Row 0: Order type badge with protocol + Status */}
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium flex items-center gap-1 ${badgeClass}`}>
              <OrderIcon className="size-3" />
              {orderTypeLabel}
            </span>
            {/* Protocol badge */}
            {protocolIcon && (
              <span className="bg-base-200 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                <Image src={protocolIcon} alt={protocolName || ""} width={12} height={12} className="rounded-full" />
                {protocolName?.charAt(0).toUpperCase()}{protocolName?.slice(1)}
              </span>
            )}
            {isTriggerMet && (
              <span className="bg-warning/20 text-warning rounded px-1.5 py-0.5 text-[10px] font-medium">
                Trigger Met
              </span>
            )}
          </div>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            isActive ? 'bg-success/20 text-success' : 'bg-base-300 text-base-content/50'
          }`}>
            {isActive ? 'Active' : status === ConditionalOrderStatus.Completed ? 'Done' : 'Cancelled'}
          </span>
        </div>

        {/* Row 1: Token pair + time */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center -space-x-1">
              <Image src={tokenNameToLogo(sellSymbol)} alt={sellSymbol} width={24} height={24} className="ring-base-100 rounded-full ring-2" />
              <Image src={tokenNameToLogo(buySymbol)} alt={buySymbol} width={24} height={24} className="ring-base-100 rounded-full ring-2" />
            </div>
            <span className="text-sm font-medium">{sellSymbol} → {buySymbol}</span>
          </div>
          <span className="text-base-content/40 text-xs">{timeAgo(createdAt, true)}</span>
        </div>

        {/* Row 2: LTV info for ADL/Auto-Leverage orders */}
        {triggerParams && orderType !== "limit" && (
          <div className="bg-base-200/50 mb-2 rounded-lg p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-base-content/60">Trigger LTV</span>
              <span className="text-warning font-medium">{formatLtvPercent(triggerParams.triggerLtvBps)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-base-content/60">Target LTV</span>
              <span className="text-success font-medium">{formatLtvPercent(triggerParams.targetLtvBps)}</span>
            </div>
          </div>
        )}

        {/* Row 2b: Limit order details */}
        {orderType === "limit" && limitPriceParams && (
          <div className="bg-base-200/50 mb-2 rounded-lg p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-base-content/60">
                {limitPriceParams.isKindBuy ? "Buy" : "Sell"}
              </span>
              <span className="font-medium">
                {limitPriceParams.isKindBuy
                  ? `${Number(formatUnits(limitPriceParams.totalBuyAmount, limitPriceParams.buyDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${buySymbol}`
                  : `${Number(formatUnits(limitPriceParams.totalSellAmount, limitPriceParams.sellDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${sellSymbol}`
                }
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-base-content/60">
                {limitPriceParams.isKindBuy ? "For up to" : "For min"}
              </span>
              <span className="font-medium">
                {limitPriceParams.isKindBuy
                  ? `${Number(formatUnits(limitPriceParams.totalSellAmount, limitPriceParams.sellDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${sellSymbol}`
                  : `${Number(formatUnits(limitPriceParams.totalBuyAmount, limitPriceParams.buyDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${buySymbol}`
                }
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-base-content/60">
                {limitPriceParams.triggerAbovePrice ? "When price ≥" : "When price ≤"}
              </span>
              <span className="font-medium">${(Number(limitPriceParams.limitPrice) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            </div>
          </div>
        )}

        {/* Row 3: Progress (if has iterations) */}
        {maxIterations > 0 && (
          <div className="mb-2">
            <div className="bg-base-200 h-1 w-full">
              <div
                className={`h-full transition-all ${isActive ? 'bg-success' : 'bg-base-300'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-base-content/40 text-xs">{completedIterations}/{maxIterations} iterations</span>
              <span className="text-base-content/50 text-xs font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {/* Row 4: Actions */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-base-content/40">{truncateAddress(orderHash)}</span>
          {isActive && (
            <button
              onClick={() => cancelOrder(orderHash)}
              disabled={isCancelling}
              className="text-error hover:underline disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    );
  }
}
