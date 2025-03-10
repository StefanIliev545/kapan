import { FC, useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { DepositCollateralModal } from "./DepositCollateralModal";

interface CollateralPosition {
  icon: string;
  name: string;
  balance: number; // Token amount
  usdValue: number; // USD value
  address: string;
  rawPrice: bigint; // Store the raw price for debugging
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
        <div 
          className={`h-full ${getColor()}`}
          style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium">
        {utilizationPercentage.toFixed(0)}% borrowed
      </span>
    </div>
  );
};

interface CompoundCollateralViewProps {
  baseToken: string;
  collateralData: any;
  collateralPrices: any;
  collateralDecimals: any;
  baseTokenDecimals: number | bigint;
  compoundData: any;
}

export const CompoundCollateralView: FC<CompoundCollateralViewProps> = ({ 
  baseToken,
  collateralData,
  collateralPrices,
  collateralDecimals,
  baseTokenDecimals,
  compoundData
}) => {
  const [showAll, setShowAll] = useState(false);
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralPosition | null>(null);
  const { address: connectedAddress } = useAccount();

  // Ensure baseTokenDecimals is in the expected array format
  const baseTokenDecimalsArray = typeof baseTokenDecimals === 'number' 
    ? [BigInt(baseTokenDecimals)] 
    : [baseTokenDecimals];

  // Extract collateral addresses from passed data
  const collateralAddresses = useMemo(() => {
    if (!collateralData?.[0] || !collateralData[0].length) return [];
    // Return the array of addresses (first element in the collateralData tuple)
    return collateralData[0];
  }, [collateralData]);

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
    
    console.log('Borrow details:', {
      borrowBalanceRaw: borrowBalanceRaw?.toString(),
      decimals,
      borrowBalance,
      price: price?.toString(),
      borrowUsdValue
    });
    
    return { borrowBalance, borrowValue: borrowUsdValue };
  }, [compoundData, baseTokenDecimalsArray]);

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
      const decimals = collateralDecimals && index < collateralDecimals.length
        ? Number(collateralDecimals[index])
        : 18;
      
      // Format balance with correct decimals
      const balance = Number(formatUnits(balances[index], decimals));
      
      // Get raw price value 
      const rawPrice = collateralPrices && index < collateralPrices.length 
        ? collateralPrices[index] 
        : 0n;
      
      // Calculate USD value 
      let usdValue = 0;
      if (rawPrice > 0n) {
        // Price is returned in 8 decimals format
        const price = Number(formatUnits(rawPrice, 8));
        usdValue = balance * price;
      }
      
      return {
        name,
        balance,
        usdValue,
        icon: tokenNameToLogo(name),
        address,
        rawPrice,
      };
    });
    
    return positions;
  }, [collateralData, collateralPrices, collateralDecimals]);

  // Calculate total collateral value in USD
  const totalCollateralValue = useMemo(() => {
    return allCollateralPositions.reduce((total: number, position: CollateralPosition) => total + position.usdValue, 0);
  }, [allCollateralPositions]);

  // Calculate utilization percentage (borrowed USD / total collateral USD)
  const utilizationPercentage = useMemo(() => {
    if (totalCollateralValue <= 0) return 0;
    return (borrowDetails.borrowValue / totalCollateralValue) * 100;
  }, [borrowDetails.borrowValue, totalCollateralValue]);

  // Check if any position has a balance and auto-show all if none do
  useEffect(() => {
    if (allCollateralPositions && allCollateralPositions.length > 0) {
      const anyHasBalance = allCollateralPositions.some((pos: CollateralPosition) => pos.balance > 0);
      if (!anyHasBalance) {
        setShowAll(true);
      }
    }
  }, [allCollateralPositions]);

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
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
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
                    ${position.balance > 0 ? 'border-base-300/50' : 'border-base-300/20'} 
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
                        <span className={`text-xs font-mono truncate ${position.balance > 0 ? 'text-base-content/70' : 'text-base-content/40'}`}>
                          {position.balance > 0 ? formatNumber(position.balance) : 'No balance'}
                        </span>
                        {/* Only show price information for tokens with a balance */}
                        {position.balance > 0 && position.rawPrice > 0n && (
                          <span className="text-xs font-medium text-success dark:text-success truncate">
                            {formatUSD(position.usdValue)}
                          </span>
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
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm text-base-content/70">
                {showAll ? "No collateral assets available" : "No collateral assets with balance"}
              </p>
              {!showAll && (
                <button 
                  className="btn btn-xs btn-outline mt-1"
                  onClick={() => setShowAll(true)}
                >
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
