import { FC, useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { DepositCollateralModal } from "./DepositCollateralModal";

interface CollateralPosition {
  icon: string;
  name: string;
  balance: number; // Token amount
  usdValue: number; // USD value
  address: string;
}

export const CompoundCollateralView: FC<{ baseToken: string }> = ({ baseToken }) => {
  const [showAll, setShowAll] = useState(false);
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralPosition | null>(null);
  const { address: connectedAddress } = useAccount();

  // Fetch collateral positions
  const { data: collateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [baseToken, connectedAddress],
  });

  // Extract collateral addresses for price lookup
  const collateralAddresses = useMemo(() => {
    if (!collateralData?.[0] || !collateralData[0].length) return [];
    // Return the array of addresses (first element in the collateralData tuple)
    return collateralData[0];
  }, [collateralData]);

  // Get decimals for all collateral tokens using UiHelper
  const { data: tokenDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [collateralAddresses],
  });

  // Fetch prices for all collaterals at once
  // First argument is the market (baseToken), second is the array of collateral addresses
  const { data: collateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getPrices",
    args: [baseToken, collateralAddresses], // Market first, then token addresses
  });

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

  // Process collateral data with prices
  const allCollateralPositions = useMemo(() => {
    if (!collateralData || !collateralData[0]?.length) {
      return [];
    }

    const [addresses, balances, displayNames] = collateralData;
    
    // Create positions with price data
    return addresses.map((address: string, index: number) => {
      const name = displayNames[index];
      
      // Use decimals from UiHelper, fallback to 18 if not available
      const decimals = tokenDecimals && index < tokenDecimals.length
        ? Number(tokenDecimals[index])
        : 18;
      
      // Format balance with correct decimals
      const balance = Number(formatUnits(balances[index], decimals));
      
      // Calculate USD value 
      let usdValue = 0;
      if (collateralPrices && index < collateralPrices.length) {
        // Price is returned in 8 decimals format
        const price = Number(formatUnits(collateralPrices[index], 8));
        usdValue = balance * price;
      }
      
      return {
        name,
        balance,
        usdValue,
        icon: tokenNameToLogo(name),
        address
      };
    });
  }, [collateralData, collateralPrices, tokenDecimals]);

  // Check if any position has a balance and auto-show all if none do
  useEffect(() => {
    if (allCollateralPositions && allCollateralPositions.length > 0) {
      const anyHasBalance = allCollateralPositions.some(pos => pos.balance > 0);
      if (!anyHasBalance) {
        setShowAll(true);
      }
    }
  }, [allCollateralPositions]);

  // Filter based on toggle state
  const collateralPositions = useMemo(() => {
    return showAll 
      ? allCollateralPositions 
      : allCollateralPositions.filter(pos => pos.balance > 0);
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
  const positionsWithBalanceCount = allCollateralPositions.filter(pos => pos.balance > 0).length;

  return (
    <>
      <div className="bg-base-200/60 dark:bg-base-300/30 rounded-lg p-3 mt-2">
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
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
            
            {/* Toggle for showing all collateral */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/70">Show all</span>
              <input 
                type="checkbox" 
                className="toggle toggle-primary toggle-xs" 
                checked={showAll} 
                onChange={() => setShowAll(prev => !prev)}
              />
            </div>
          </div>
          
          {collateralPositions.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {collateralPositions.map(position => (
                <div 
                  key={position.address} 
                  className={`bg-base-100 rounded-lg p-2 shadow-sm hover:shadow-md transition-all duration-200 border 
                    ${position.balance > 0 ? 'border-base-300/50' : 'border-base-300/20'} 
                    cursor-pointer hover:bg-base-200/50 active:scale-95`}
                  onClick={() => handleCollateralClick(position)}
                >
                  <div className="flex items-center gap-2">
                    <div className="avatar">
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
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{position.name}</span>
                      <div className="flex flex-col">
                        <span className={`text-xs font-mono ${position.balance > 0 ? 'text-base-content/70' : 'text-base-content/40'}`}>
                          {position.balance > 0 ? formatNumber(position.balance) : 'No balance'}
                        </span>
                        {position.balance > 0 && position.usdValue > 0 && (
                          <span className="text-xs text-primary font-medium">
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
              <div className="text-info">
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
