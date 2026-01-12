import { FC, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { DepositModal } from "~~/components/modals/DepositModal";
import { WithdrawModal } from "~~/components/modals/WithdrawModal";
import { CollateralSwapModal } from "~~/components/modals/CollateralSwapModal";
import { formatUnits, encodeAbiParameters } from "viem";
import { useAccount } from "wagmi";
import { FiatBalance } from "~~/components/FiatBalance";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { formatBps } from "~~/utils/risk";
import { sanitizeSymbol } from "~~/utils/tokenSymbols";
import { formatCurrency } from "~~/utils/formatNumber";
import type { Address } from "viem";

interface CollateralPosition {
  icon: string;
  name: string;
  balance: number; // Token amount
  balanceRaw: bigint; // Raw token amount
  usdValue: number; // USD value
  address: string;
  rawPrice: bigint; // Store the raw price for debugging
  decimals: number; // Store the decimals
}

// User position utilization indicator component
const UserUtilization: FC<{ utilizationPercentage: number }> = ({ utilizationPercentage }) => {
  // Determine color based on utilization percentage
  const getColor = () => {
    if (utilizationPercentage < 50) return "bg-success";
    if (utilizationPercentage < 70) return "bg-warning";
    return "bg-error";
  };

  // Memoize the style object
  const barStyle = useMemo(() => ({ width: `${Math.min(utilizationPercentage, 100)}%` }), [utilizationPercentage]);

  return (
    <div className="flex items-center gap-2">
      <div className="bg-base-300 h-1.5 w-20 overflow-hidden rounded-full">
        <div className={`h-full ${getColor()}`} style={barStyle} />
      </div>
      <span className="text-xs font-medium">{utilizationPercentage.toFixed(0)}% borrowed</span>
    </div>
  );
};

// Collateral card component to avoid inline function props in the parent map
interface CollateralCardProps {
  position: CollateralPosition;
  onSwap: (position: CollateralPosition) => void;
  onDeposit: (position: CollateralPosition) => void;
  onWithdraw: (position: CollateralPosition) => void;
}

const CollateralCard: FC<CollateralCardProps> = ({ position, onSwap, onDeposit, onWithdraw }) => {
  const handleSwapClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSwap(position);
  }, [onSwap, position]);

  const handleDepositClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDeposit(position);
  }, [onDeposit, position]);

  const handleWithdrawClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onWithdraw(position);
  }, [onWithdraw, position]);

  return (
    <div
      className={`bg-base-100 rounded-lg border shadow-sm transition-all duration-200 hover:shadow-md
        ${position.balance > 0 ? "border-base-300/50" : "border-base-300/20"}
        hover:bg-base-200/60 hover:border-base-content/15 flex items-center overflow-hidden`}
    >
      <div className="flex gap-1">
        <div className="join join-vertical bg-base-100 z-10 w-6 overflow-hidden transition-all duration-300 hover:w-24">
          <button
            type="button"
            onClick={handleSwapClick}
            className="join-item btn btn-xs btn-ghost hover:bg-primary/20 hover:text-primary group flex h-7 min-h-0 w-full items-center justify-start overflow-hidden rounded-none rounded-tl-lg px-0 transition-colors"
            aria-label={`Swap ${position.name}`}
            title="Swap"
          >
            <div className="flex h-7 w-6 flex-shrink-0 items-center justify-center">
              <ArrowPathIcon className="size-3" />
            </div>
            <span className="ml-0 whitespace-nowrap text-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Swap
            </span>
          </button>
          <button
            type="button"
            disabled
            className="join-item btn btn-xs btn-ghost flex h-7 min-h-0 w-full cursor-default items-center justify-center overflow-hidden rounded-none rounded-bl-lg px-0 opacity-0"
          >
            <span className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-2 overflow-hidden p-2">
        <div className="avatar flex-shrink-0">
          <div className="bg-base-200 flex size-7 items-center justify-center overflow-hidden rounded-full p-1.5">
            <Image
              src={position.icon}
              alt={`${position.name} icon`}
              width={20}
              height={20}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="truncate text-sm font-medium">{position.name}</span>
          <div className="flex flex-col">
            {position.balance > 0 ? (
              <span className="text-success truncate text-xs">
                <FiatBalance
                  tokenAddress={position.address}
                  rawValue={position.balanceRaw}
                  price={position.rawPrice}
                  decimals={position.decimals}
                  tokenSymbol={position.name}
                  className=""
                  isNegative={false}
                  maxRawDecimals={4}
                />
              </span>
            ) : (
              <span className="text-base-content/40 truncate text-xs">No balance</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        <div className="flex gap-1">
          <div className="join join-vertical bg-base-100 z-10 w-6 overflow-hidden transition-all duration-300 hover:w-24">
            <button
              type="button"
              onClick={handleDepositClick}
              className="join-item btn btn-xs btn-ghost hover:bg-primary/20 hover:text-primary group flex h-7 min-h-0 w-full items-center justify-start overflow-hidden rounded-none rounded-tr-lg px-0 transition-colors"
              aria-label={`Deposit ${position.name}`}
              title="Deposit"
            >
              <div className="flex h-7 w-6 flex-shrink-0 items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-3">
                  <path d="M12 5c.414 0 .75.336.75.75V11.25H18.25a.75.75 0 010 1.5H12.75V18.25a.75.75 0 01-1.5 0V12.75H5.75a.75.75 0 010-1.5H11.25V5.75c0-.414.336-.75.75-.75z" />
                </svg>
              </div>
              <span className="ml-0 whitespace-nowrap text-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Deposit
              </span>
            </button>
            <button
              type="button"
              onClick={handleWithdrawClick}
              className="join-item btn btn-xs btn-ghost hover:bg-primary/20 hover:text-primary group flex h-7 min-h-0 w-full items-center justify-start overflow-hidden rounded-none rounded-br-lg px-0 transition-colors"
              aria-label={`Withdraw ${position.name}`}
              title="Withdraw"
            >
              <div className="flex h-7 w-6 flex-shrink-0 items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-3">
                  <path d="M5.75 12a.75.75 0 01.75-.75h11a.75.75 0 010 1.5h-11a.75.75 0 01-.75-.75z" />
                </svg>
              </div>
              <span className="ml-0 whitespace-nowrap text-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Withdraw
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CompoundCollateralViewProps {
  baseToken: string;
  baseTokenDecimals: number | bigint;
  compoundData: any;
  isVisible?: boolean; // New prop to indicate if the collateral view is visible
  initialShowAll?: boolean; // Prop to control initial showAll state
  chainId?: number;
  priceMap?: Record<string, number>;
  baseTokenSymbol?: string;
}

// Helper to encode Compound market address as context
const encodeCompoundMarket = (marketAddress: Address): string => {
  return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
};

export const CompoundCollateralView: FC<CompoundCollateralViewProps> = ({
  baseToken,
  baseTokenDecimals,
  compoundData,
  isVisible = false, // Default to false if not provided
  initialShowAll = undefined, // Default to undefined (use component logic) if not provided
  chainId,
  priceMap,
  baseTokenSymbol,
}) => {
  const [showAll, setShowAll] = useState(initialShowAll === undefined ? false : initialShowAll);
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralPosition | null>(null);
  const [selectedAction, setSelectedAction] = useState<"deposit" | "withdraw" | "swap" | null>(null);
  const { address: connectedAddress } = useAccount();

  // Use ZERO_ADDRESS when wallet is not connected
  const queryAddress = connectedAddress || "0x0000000000000000000000000000000000000000";

  // Only fetch data when the component is visible or when first mounted
  const shouldFetch = isVisible;

  // Fetch collateral data directly in this component
  const { data: collateralData } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getDepositedCollaterals",
    args: [baseToken, queryAddress],
    chainId: chainId as any,
    query: {
      enabled: shouldFetch,
    },
  });

  // Extract collateral addresses from fetched data
  const collateralAddresses = useMemo(() => {
    if (!collateralData?.[0] || !collateralData[0].length) return [];
    return collateralData[0];
  }, [collateralData]);

  // Fetch prices for collateral tokens (in terms of baseToken)
  const { data: collateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getPrices",
    args: [baseToken, collateralAddresses],
    chainId: chainId as any,
    query: {
      enabled: shouldFetch && collateralAddresses.length > 0,
    },
  });

  // Fetch decimals for collateral tokens
  const { data: collateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [collateralAddresses],
    chainId: chainId as any,
    query: {
      enabled: shouldFetch && collateralAddresses.length > 0,
    },
  });

  // Fetch the baseToken price in USD
  const { data: baseTokenPrice } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getPrice",
    args: [baseToken],
    chainId: chainId as any,
    query: {
      enabled: shouldFetch,
    },
  });

  const baseTokenSymbolKey = useMemo(() => sanitizeSymbol(baseTokenSymbol || "").toLowerCase(), [baseTokenSymbol]);

  const { data: collateralFactors } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getCollateralFactors",
    args: [baseToken],
    chainId: chainId as any,
    query: {
      enabled: shouldFetch,
    },
  });

  const factorMap = useMemo(() => {
    if (!collateralFactors) return new Map<string, { ltvBps: bigint; lltvBps: bigint }>();
    const [assets, ltvList, lltvList] = collateralFactors as [string[], bigint[], bigint[]];
    const map = new Map<string, { ltvBps: bigint; lltvBps: bigint }>();
    assets.forEach((asset, idx) => {
      map.set(asset.toLowerCase(), {
        ltvBps: ltvList?.[idx] ?? 0n,
        lltvBps: lltvList?.[idx] ?? 0n,
      });
    });
    return map;
  }, [collateralFactors]);

  // Ensure baseTokenDecimals is in the expected array format
  const baseTokenDecimalsArray = useMemo(
    () => (typeof baseTokenDecimals === "number" ? [BigInt(baseTokenDecimals)] : [baseTokenDecimals]),
    [baseTokenDecimals],
  );

  // Extract baseToken price in USD
  const baseTokenUsdPrice = useMemo(() => {
    const apiPrice = priceMap?.[baseTokenSymbolKey];
    if (typeof apiPrice === "number" && apiPrice > 0) {
      return BigInt(Math.round(apiPrice * 1e8));
    }

    if (!baseTokenPrice) return 0n;
    return baseTokenPrice;
  }, [baseTokenPrice, priceMap, baseTokenSymbolKey]);

  // Parse borrow value and price from compound data
  const borrowDetails = useMemo(() => {
    if (!compoundData) {
      return { borrowBalance: 0, borrowValue: 0 };
    }

    // CompoundData returns [supplyRate, borrowRate, balance, borrowBalance, price, priceScale]
    const [, , , borrowBalanceRaw, price] = compoundData;

    // Get the correct decimals for this token
    const decimals = Number(baseTokenDecimalsArray[0]);

    // Format the borrow balance using the correct decimals
    const borrowBalance = borrowBalanceRaw ? Number(formatUnits(borrowBalanceRaw, decimals)) : 0;

    // Calculate USD value of the borrowed amount (price is in 8 decimals)
    const price8 = baseTokenUsdPrice && baseTokenUsdPrice > 0n ? baseTokenUsdPrice : price;
    const borrowUsdValue = borrowBalance * Number(formatUnits(price8, 8));
    return { borrowBalance, borrowValue: borrowUsdValue };
  }, [compoundData, baseTokenDecimalsArray, baseTokenUsdPrice]);

  // Process collateral data with prices
  const allCollateralPositions = useMemo(() => {
    if (!collateralData || !collateralData[0]?.length) {
      return [];
    }

    const [addresses, balances, displayNames] = collateralData;

    // Create positions with price data
    const positions = addresses.map((address: string, index: number) => {
      const name = displayNames[index];

      // Use decimals from passed data, fallback to 18 if not available
      const decimals = collateralDecimals && index < collateralDecimals.length ? Number(collateralDecimals[index]) : 18;

      // Store the raw balance
      const balanceRaw = balances[index];

      // Format balance with correct decimals
      const balance = Number(formatUnits(balanceRaw, decimals));

      // Get collateral price in terms of baseToken
      const collateralToBasePrice = collateralPrices && index < collateralPrices.length ? collateralPrices[index] : 0n;
      const collateralSymbolKey = sanitizeSymbol(name).toLowerCase();
      const directUsdPrice = priceMap?.[collateralSymbolKey];

      // Calculate USD value using both conversion rates:
      // 1. Convert collateral to baseToken value
      // 2. Convert baseToken value to USD
      let usdValue = 0;
      let effectiveUsdPrice = 0n;

      if (typeof directUsdPrice === "number" && directUsdPrice > 0) {
        effectiveUsdPrice = BigInt(Math.round(directUsdPrice * 1e8));
        usdValue = balance * directUsdPrice;
      } else if (collateralToBasePrice > 0n && baseTokenUsdPrice > 0n) {
        // Calculate the effective USD price by combining both rates
        // Convert to BigInt calculation to avoid precision issues
        const scaleFactor = 10n ** 8n; // Both prices have 8 decimals, result will have 8 decimals
        effectiveUsdPrice = (collateralToBasePrice * baseTokenUsdPrice) / scaleFactor;

        // Calculate USD value
        usdValue = balance * Number(formatUnits(effectiveUsdPrice, 8));
      }

      return {
        name,
        balance,
        balanceRaw,
        usdValue,
        icon: tokenNameToLogo(name),
        address,
        rawPrice: effectiveUsdPrice, // Store the effective USD price for FiatBalance
        decimals,
      };
    });

    return positions;
  }, [collateralData, collateralPrices, collateralDecimals, baseTokenUsdPrice, priceMap]);

  // Auto-expand all tokens when the component becomes visible, but only if initialShowAll wasn't explicitly set
  useEffect(() => {
    // Skip this logic if initialShowAll was explicitly provided
    if (initialShowAll !== undefined) return;

    if (isVisible && !showAll) {
      // Check if we have any tokens with balance
      const hasTokensWithBalance = allCollateralPositions.some((pos: CollateralPosition) => pos.balance > 0);

      // If there are no tokens with balance, show all tokens
      if (!hasTokensWithBalance) {
        setShowAll(true);
      }
    }
  }, [isVisible, allCollateralPositions, showAll, initialShowAll]);

  // Calculate total collateral value in USD
  const totalCollateralValue = useMemo(() => {
    return allCollateralPositions.reduce((total: number, position: CollateralPosition) => total + position.usdValue, 0);
  }, [allCollateralPositions]);

  // Calculate utilization percentage (borrowed USD / total collateral USD)
  const utilizationPercentage = useMemo(() => {
    if (totalCollateralValue <= 0) return 0;
    return (borrowDetails.borrowValue / totalCollateralValue) * 100;
  }, [borrowDetails.borrowValue, totalCollateralValue]);

  // Calculate weighted LLTV based on user's collateral positions
  const weightedLltvBps = useMemo(() => {
    if (totalCollateralValue <= 0 || allCollateralPositions.length === 0) return 0n;
    let totalWeightedLltv = 0n;
    let totalWeight = 0n;
    for (const pos of allCollateralPositions) {
      if (pos.usdValue > 0) {
        const factors = factorMap.get(pos.address.toLowerCase());
        if (factors?.lltvBps) {
          const weight = BigInt(Math.floor(pos.usdValue * 100));
          totalWeightedLltv += factors.lltvBps * weight;
          totalWeight += weight;
        }
      }
    }
    return totalWeight > 0n ? totalWeightedLltv / totalWeight : 0n;
  }, [allCollateralPositions, factorMap, totalCollateralValue]);

  // Check if any position has a balance and auto-show all if none do, but only if initialShowAll wasn't explicitly set
  useEffect(() => {
    // Skip this logic if initialShowAll was explicitly provided
    if (initialShowAll !== undefined) return;

    if (allCollateralPositions && allCollateralPositions.length > 0) {
      const anyHasBalance = allCollateralPositions.some((pos: CollateralPosition) => pos.balance > 0);
      if (!anyHasBalance) {
        setShowAll(true);
      }
    }
  }, [allCollateralPositions, initialShowAll]);

  // Filter based on toggle state
  const collateralPositions = useMemo(() => {
    return showAll
      ? allCollateralPositions
      : allCollateralPositions.filter((pos: CollateralPosition) => pos.balance > 0);
  }, [allCollateralPositions, showAll]);

  // Open deposit/withdraw modals for a collateral token
  const openDeposit = useCallback((position: CollateralPosition) => {
    setSelectedCollateral(position);
    setSelectedAction("deposit");
  }, []);

  const openWithdraw = useCallback((position: CollateralPosition) => {
    setSelectedCollateral(position);
    setSelectedAction("withdraw");
  }, []);

  const openSwap = useCallback((position: CollateralPosition) => {
    setSelectedCollateral(position);
    setSelectedAction("swap");
  }, []);

  // Handle closing the deposit modal
  const handleCloseModal = useCallback(() => {
    setSelectedCollateral(null);
  }, []);

  // Toggle show all collateral
  const toggleShowAll = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  // Show all button handler
  const handleShowAll = useCallback(() => {
    setShowAll(true);
  }, []);

  // Get all collateral positions (for counting)
  const allPositionsCount = allCollateralPositions.length;
  const positionsWithBalanceCount = allCollateralPositions.filter((pos: CollateralPosition) => pos.balance > 0).length;

  // Memoized token object for deposit modal
  const depositToken = useMemo(() => {
    if (!selectedCollateral) return null;
    return {
      name: selectedCollateral.name,
      icon: selectedCollateral.icon,
      address: selectedCollateral.address,
      decimals: selectedCollateral.decimals,
      currentRate: 0,
    };
  }, [selectedCollateral]);

  // Memoized token object for withdraw modal
  const withdrawToken = useMemo(() => {
    if (!selectedCollateral) return null;
    return {
      name: selectedCollateral.name,
      icon: selectedCollateral.icon,
      address: selectedCollateral.address,
      decimals: selectedCollateral.decimals,
      currentRate: 0,
    };
  }, [selectedCollateral]);

  // Memoized available assets for swap modal
  const swapAvailableAssets = useMemo(() => {
    return allCollateralPositions.map(p => ({
      symbol: p.name,
      address: p.address,
      decimals: p.decimals,
      rawBalance: p.balanceRaw,
      balance: p.balance,
      icon: p.icon,
      usdValue: p.usdValue,
      price: p.rawPrice,
    }));
  }, [allCollateralPositions]);

  // Memoized position object for swap modal
  const swapPosition = useMemo(() => {
    if (!selectedCollateral) return null;
    return {
      name: selectedCollateral.name,
      tokenAddress: selectedCollateral.address,
      decimals: selectedCollateral.decimals,
      balance: selectedCollateral.balance,
      type: "supply" as const,
    };
  }, [selectedCollateral]);

  // Memoized context for compound market
  const compoundMarketContext = useMemo(() => {
    return encodeCompoundMarket(baseToken as Address);
  }, [baseToken]);

  // Don't render anything until data is loaded when visible
  if (isVisible && (!collateralData || collateralData[0]?.length === 0) && !allCollateralPositions.length) {
    return (
      <div className="bg-base-200/60 dark:bg-base-300/30 mt-2 rounded-lg p-3">
        <div className="flex items-center justify-center py-4">
          <div className="flex animate-pulse items-center">
            <div className="bg-primary/30 mr-2 size-4 rounded-full"></div>
            <span className="text-base-content/70 text-sm">Loading collateral data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-base-200/60 dark:bg-base-300/30 mt-2 rounded-lg p-3">
        <div className="flex flex-col">
          <div className="mb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 md:gap-4">
                {/* Collateral Assets title and count - highest priority */}
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-base-content/80 flex items-center gap-1 text-sm font-semibold">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Collateral Assets
                  </span>
                  <span className="badge badge-primary badge-xs">
                    {positionsWithBalanceCount}/{allPositionsCount}
                  </span>
                </div>

                {/* Utilization indicator - lowest priority, will disappear first */}
                {totalCollateralValue > 0 && (
                  <div className="group/util order-3 hidden flex-shrink flex-grow items-center gap-2 sm:flex">
                    <span className="text-base-content/70 whitespace-nowrap text-xs">Utilization:</span>
                    {/* Default: show bar */}
                    <div className="group-hover/util:hidden">
                      <UserUtilization utilizationPercentage={utilizationPercentage} />
                    </div>
                    {/* On hover: show Current and LLTV breakdown */}
                    <div className="hidden items-center gap-2 font-mono text-xs tabular-nums group-hover/util:flex">
                      <span className="text-base-content/70">
                        <span className="text-base-content/50 text-[10px]">Current </span>
                        {utilizationPercentage.toFixed(1)}%
                      </span>
                      {weightedLltvBps > 0n && (
                        <>
                          <span className="text-base-content/30">•</span>
                          <span className="text-base-content/70">
                            <span className="text-base-content/50 text-[10px]">LLTV </span>
                            {formatBps(weightedLltvBps)}%
                          </span>
                        </>
                      )}
                    </div>
                    <span className="text-base-content/70 hidden truncate text-xs group-hover/util:hidden md:inline">
                      ({formatCurrency(borrowDetails.borrowValue)} / {formatCurrency(totalCollateralValue)})
                    </span>
                  </div>
                )}
              </div>

              {/* Toggle for showing all collateral - medium priority, always visible */}
              <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                <span className="text-base-content/70 whitespace-nowrap text-xs">Show all</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs"
                  checked={showAll}
                  onChange={toggleShowAll}
                />
              </div>
            </div>
          </div>

          {collateralPositions.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {collateralPositions.map((position: CollateralPosition) => (
                <CollateralCard
                  key={position.address}
                  position={position}
                  onSwap={openSwap}
                  onDeposit={openDeposit}
                  onWithdraw={openWithdraw}
                />
              ))}
            </div>
          ) : (
            <div className="bg-base-100/50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 text-center">
              <div className="text-primary dark:text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <p className="text-base-content/70 text-sm">
                {showAll ? "No collateral assets available" : "No collateral assets with balance"}
              </p>
              {!showAll && (
                <button className="btn btn-xs btn-outline mt-1" onClick={handleShowAll}>
                  Show All Available Collateral
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Deposit / Withdraw Modals */}
      {selectedCollateral && selectedAction === "deposit" && depositToken && (
        <DepositModal
          isOpen={!!selectedCollateral}
          onClose={handleCloseModal}
          token={depositToken}
          protocolName="compound"
          chainId={chainId}
          context={compoundMarketContext}
        />
      )}
      {selectedCollateral && selectedAction === "withdraw" && withdrawToken && (
        <WithdrawModal
          isOpen={!!selectedCollateral}
          onClose={handleCloseModal}
          token={withdrawToken}
          protocolName="compound"
          supplyBalance={selectedCollateral.balanceRaw}
          chainId={chainId}
          context={compoundMarketContext}
        />
      )}
      {selectedCollateral && selectedAction === "swap" && swapPosition && (
        <CollateralSwapModal
          isOpen={!!selectedCollateral}
          onClose={handleCloseModal}
          protocolName="compound"
          availableAssets={swapAvailableAssets}
          initialFromTokenAddress={selectedCollateral.address}
          chainId={chainId || 1}
          context={compoundMarketContext}
          position={swapPosition}
        />
      )}
    </>
  );
};
