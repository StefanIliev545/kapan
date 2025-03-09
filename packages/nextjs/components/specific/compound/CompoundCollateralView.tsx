import { FC, useState, useMemo } from "react";
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
  const collateralPositions = useMemo(() => {
    if (!collateralData || !collateralData[0]?.length) {
      return [];
    }

    const [addresses, balances, displayNames] = collateralData;
    
    // Create positions with price data
    const positions = addresses.map((address: string, index: number) => {
      const balance = Number(formatUnits(balances[index], 18));
      const name = displayNames[index];
      
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
    
    // Filter based on toggle state
    return showAll 
      ? positions 
      : positions.filter(pos => pos.balance > 0);
  }, [collateralData, collateralPrices, showAll]);

  if (collateralPositions.length === 0 && !showAll) {
    return null;
  }

  // Handle clicking on a collateral token
  const handleCollateralClick = (position: CollateralPosition) => {
    setSelectedCollateral(position);
  };

  // Handle closing the deposit modal
  const handleCloseModal = () => {
    setSelectedCollateral(null);
  };

  // Get all collateral positions (for counting)
  const allPositionsCount = collateralData ? collateralData[0].length : 0;
  const positionsWithBalanceCount = collateralPositions.filter(pos => pos.balance > 0).length;

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
