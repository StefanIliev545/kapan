import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { DepositCollateralModal } from "./DepositCollateralModal";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { FiatBalance } from "~~/components/FiatBalance";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

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

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-base-300 rounded-full overflow-hidden">
        <div className={`h-full ${getColor()}`} style={{ width: `${Math.min(utilizationPercentage, 100)}%` }} />
      </div>
      <span className="text-xs font-medium">{utilizationPercentage.toFixed(0)}% borrowed</span>
    </div>
  );
};

interface CompoundCollateralViewProps {
  baseToken: string;
  baseTokenDecimals: number | bigint;
  compoundData: any;
  isVisible?: boolean; // New prop to indicate if the collateral view is visible
  initialShowAll?: boolean; // Prop to control initial showAll state
}

export const CompoundCollateralView: FC<CompoundCollateralViewProps> = ({
  baseToken,
  baseTokenDecimals,
  compoundData,
  isVisible = false, // Default to false if not provided
  initialShowAll = undefined, // Default to undefined (use component logic) if not provided
}) => {
  const [showAll, setShowAll] = useState(initialShowAll === undefined ? false : initialShowAll);
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralPosition | null>(null);
  const { address: connectedAddress } = useAccount();

  // Use ZERO_ADDRESS when wallet is not connected
  const queryAddress = connectedAddress || "0x0000000000000000000000000000000000000000";

  // Only fetch data when the component is visible or when first mounted
  const shouldFetch = isVisible;

  // Format currency with 2 decimal places
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Format currency in USD
  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Fetch collateral data directly in this component
  const { data: collateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [baseToken, queryAddress],
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
    contractName: "CompoundGateway",
    functionName: "getPrices",
    args: [baseToken, collateralAddresses],
    query: {
      enabled: shouldFetch && collateralAddresses.length > 0,
    },
  });

  // Fetch decimals for collateral tokens
  const { data: collateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [collateralAddresses],
    query: {
      enabled: shouldFetch && collateralAddresses.length > 0,
    },
  });

  // Fetch the baseToken price in USD
  const { data: baseTokenPrice } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getPrice",
    args: [baseToken],
    query: {
      enabled: shouldFetch,
    },
  });

  // Ensure baseTokenDecimals is in the expected array format
  const baseTokenDecimalsArray =
    typeof baseTokenDecimals === "number" ? [BigInt(baseTokenDecimals)] : [baseTokenDecimals];

  // Extract baseToken price in USD
  const baseTokenUsdPrice = useMemo(() => {
    if (!baseTokenPrice) return 0n;
    return baseTokenPrice;
  }, [baseTokenPrice]);

  // Parse borrow value and price from compound data
  const borrowDetails = useMemo(() => {
    if (!compoundData) {
      return { borrowBalance: 0, borrowValue: 0 };
    }

    // CompoundData returns [supplyRate, borrowRate, balance, borrowBalance, price, priceScale]
    const [_, __, ___, borrowBalanceRaw, price] = compoundData;

    // Get the correct decimals for this token
    const decimals = Number(baseTokenDecimalsArray[0]);

    // Format the borrow balance using the correct decimals
    const borrowBalance = borrowBalanceRaw ? Number(formatUnits(borrowBalanceRaw, decimals)) : 0;

    // Calculate USD value of the borrowed amount (price is in 8 decimals)
    const borrowUsdValue = borrowBalance * Number(formatUnits(price, 8));
    return { borrowBalance, borrowValue: borrowUsdValue };
  }, [compoundData, baseTokenDecimalsArray]);

  // Process collateral data with prices
  const allCollateralPositions = useMemo(() => {
    if (!collateralData || !collateralData[0]?.length) {
      return [];
    }

    const [addresses, balances, displayNames] = collateralData;

    // Base token price converted to a number with 8 decimals
    const baseTokenUsdPriceNumber = baseTokenUsdPrice ? Number(formatUnits(baseTokenUsdPrice, 8)) : 0;

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

      // Calculate USD value using both conversion rates:
      // 1. Convert collateral to baseToken value 
      // 2. Convert baseToken value to USD
      let usdValue = 0;
      let effectiveUsdPrice = 0n;
      
      if (collateralToBasePrice > 0n && baseTokenUsdPrice > 0n) {
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
  }, [collateralData, collateralPrices, collateralDecimals, baseTokenUsdPrice]);

  // Refresh data when visibility changes
  useEffect(() => {
    if (isVisible) {
      // You could trigger a manual refetch here if needed
      console.log("Collateral view is now visible", { 
        baseToken,
        baseTokenUsdPrice: baseTokenUsdPrice ? baseTokenUsdPrice.toString() : "0",
      });
    }
  }, [isVisible, baseToken, baseTokenUsdPrice]);

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

  // Log debug information about pricing
  useEffect(() => {
    if (isVisible && baseTokenUsdPrice && allCollateralPositions.length > 0) {
      console.log("Collateral pricing debug:", {
        baseToken,
        baseTokenUsdPrice: baseTokenUsdPrice.toString(),
        baseTokenUsdValue: Number(formatUnits(baseTokenUsdPrice, 8)),
        totalCollateralValue,
        positions: allCollateralPositions.map(pos => ({
          name: pos.name,
          balance: pos.balance,
          usdValue: pos.usdValue,
          rawPrice: pos.rawPrice.toString(),
        }))
      });
    }
  }, [isVisible, baseToken, baseTokenUsdPrice, allCollateralPositions, totalCollateralValue]);

  // Calculate utilization percentage (borrowed USD / total collateral USD)
  const utilizationPercentage = useMemo(() => {
    if (totalCollateralValue <= 0) return 0;
    return (borrowDetails.borrowValue / totalCollateralValue) * 100;
  }, [borrowDetails.borrowValue, totalCollateralValue]);

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

  // Handle clicking on a collateral token
  const handleCollateralClick = (position: CollateralPosition) => {
    setSelectedCollateral(position);
  };

  // Handle closing the deposit modal
  const handleCloseModal = () => {
    setSelectedCollateral(null);
  };

  // Get all collateral positions (for counting)
  const allPositionsCount = allCollateralPositions.length;
  const positionsWithBalanceCount = allCollateralPositions.filter((pos: CollateralPosition) => pos.balance > 0).length;

  // Don't render anything until data is loaded when visible
  if (isVisible && (!collateralData || collateralData[0]?.length === 0) && !allCollateralPositions.length) {
    return (
      <div className="bg-base-200/60 dark:bg-base-300/30 rounded-lg p-3 mt-2">
        <div className="flex items-center justify-center py-4">
          <div className="animate-pulse flex items-center">
            <div className="h-4 w-4 bg-primary/30 rounded-full mr-2"></div>
            <span className="text-sm text-base-content/70">Loading collateral data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-base-200/60 dark:bg-base-300/30 rounded-lg p-3 mt-2">
        <div className="flex flex-col">
          <div className="mb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 md:gap-4">
                {/* Collateral Assets title and count - highest priority */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-base-content/80 flex items-center gap-1">
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
                  <div className="hidden sm:flex items-center gap-2 order-3 flex-shrink flex-grow">
                    <span className="text-xs text-base-content/70 whitespace-nowrap">Utilization:</span>
                    <UserUtilization utilizationPercentage={utilizationPercentage} />
                    <span className="text-xs text-base-content/70 overflow-hidden text-ellipsis whitespace-nowrap hidden md:inline">
                      ({formatUSD(borrowDetails.borrowValue)} / {formatUSD(totalCollateralValue)})
                    </span>
                  </div>
                )}
              </div>

              {/* Toggle for showing all collateral - medium priority, always visible */}
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                <span className="text-xs text-base-content/70 whitespace-nowrap">Show all</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs"
                  checked={showAll}
                  onChange={() => setShowAll(prev => !prev)}
                />
              </div>
            </div>
          </div>

          {collateralPositions.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {collateralPositions.map((position: CollateralPosition) => (
                <div
                  key={position.address}
                  className={`bg-base-100 rounded-lg p-2 shadow-sm hover:shadow-md transition-all duration-200 border 
                    ${position.balance > 0 ? "border-base-300/50" : "border-base-300/20"} 
                    cursor-pointer hover:bg-base-200/50 active:scale-95`}
                  onClick={() => handleCollateralClick(position)}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="avatar flex-shrink-0">
                      <div className="w-7 h-7 rounded-full bg-base-200 p-1.5 flex items-center justify-center overflow-hidden">
                        <Image
                          src={position.icon}
                          alt={`${position.name} icon`}
                          width={20}
                          height={20}
                          className="object-contain max-w-full max-h-full"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-medium text-sm truncate">{position.name}</span>
                      <div className="flex flex-col">
                        {position.balance > 0 ? (
                          <>
                            {/* Single FiatBalance component showing USD value by default, raw amount on hover */}
                            <span className="text-xs text-success truncate">
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
                          </>
                        ) : (
                          <span className="text-xs text-base-content/40 truncate">No balance</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-2 bg-base-100/50 rounded-lg p-4">
              <div className="text-primary dark:text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <p className="text-sm text-base-content/70">
                {showAll ? "No collateral assets available" : "No collateral assets with balance"}
              </p>
              {!showAll && (
                <button className="btn btn-xs btn-outline mt-1" onClick={() => setShowAll(true)}>
                  Show All Available Collateral
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Deposit Collateral Modal */}
      {selectedCollateral && (
        <DepositCollateralModal
          isOpen={!!selectedCollateral}
          onClose={handleCloseModal}
          token={{
            name: selectedCollateral.name,
            icon: selectedCollateral.icon,
            address: selectedCollateral.address,
          }}
          market={baseToken}
        />
      )}
    </>
  );
};
