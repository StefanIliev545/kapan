/**
 * VenusProtocolView Component
 * ---------------------------
 * This component displays Venus Protocol markets in the Kapan Finance interface.
 * It's similar to the AaveProtocolView and CompoundProtocolView components.
 * 
 * Current Implementation:
 * - Uses the simplified Venus Gateway functions to reduce "stack too deep" errors
 * - Combines data from multiple contract calls in the frontend
 * - Converts Venus per-block rates to APY percentages
 * - Formats token balances and prices for display
 * - Provides supply and borrow positions for each token
 * 
 * Venus Protocol Integration Details:
 * - Venus operates on BNB Chain (Binance Smart Chain)
 * - Uses vTokens as the collateral and debt tokens
 * - Reports rates per block, which need to be converted to APY
 * - BNB Chain has approximately 10,512,000 blocks per year (20 blocks per minute)
 * 
 * When fully implemented, this component will:
 * 1. Fetch real token data from the VenusGateway contract
 * 2. Display user's supplied positions and borrowed amounts
 * 3. Show interest rates for each token
 * 4. Allow users to supply, borrow, repay, and migrate debt between protocols
 */

import { FC, useMemo, useState, useEffect } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

export const VenusProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  const { data: venusGatewayContract } = useScaffoldContract({ contractName: "VenusGateway" });
  
  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll, setForceShowAll] = useState(false);
  
  // Update forceShowAll when wallet connection status changes with a delay
  useEffect(() => {
    // If wallet is connected, immediately set forceShowAll to false
    if (connectedAddress) {
      setForceShowAll(false);
      return;
    }
    
    // If wallet is not connected, wait a bit before forcing show all
    // This gives time for wallet to connect during initial page load
    const timeout = setTimeout(() => {
      if (!connectedAddress) {
        setForceShowAll(true);
      }
    }, 2500); // Wait 2.5 seconds before deciding wallet is not connected
    
    return () => clearTimeout(timeout);
  }, [connectedAddress]);

  // Helper: Convert Venus rates to APY percentage
  // Venus uses rates per block, so we need to convert to annual rates
  // Assuming ~10,512,000 blocks per year (20 blocks per minute * 60 minutes * 24 hours * 365.25 days)
  const convertRateToAPY = (ratePerBlock: bigint): number => {
    const blocksPerYear = 10512000n;
    const rate = Number(ratePerBlock) / 1e18;
    return (Math.pow(1 + rate, Number(blocksPerYear)) - 1) * 100;
  };

  // Step 1: Get basic token info from getAllVenusMarkets
  const { data: vTokenAddresses, isLoading: isLoadingVTokens } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getAllMarkets"
  });

  // Step 2: Get detailed market information
  const { data: marketDetails, isLoading: isLoadingMarketDetails } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getAllVenusMarkets"
  });
  
  // Step 3: Get market rates after we have the vToken addresses
  const { data: ratesData, isLoading: isLoadingRates } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getMarketRates",
    args: [vTokenAddresses]
  });
  
  // Step 4: Get user balances if wallet is connected
  const { data: userBalances, isLoading: isLoadingBalances } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getUserBalances",
    args: [vTokenAddresses, connectedAddress]
  });
  
  // Step 5: Get collateral status if wallet is connected
  const { data: collateralStatus, isLoading: isLoadingCollateral } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getCollateralStatus",
    args: [vTokenAddresses, connectedAddress]
  });

  // Combine all the data to create supply and borrow positions
  const { suppliedPositions, borrowedPositions, isLoading } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];
    
    // Check if we have all the required data
    if (!vTokenAddresses || !marketDetails || !ratesData || (connectedAddress && (!userBalances || !collateralStatus))) {
      return { 
        suppliedPositions: supplied, 
        borrowedPositions: borrowed, 
        isLoading: isLoadingVTokens || isLoadingMarketDetails || isLoadingRates || 
                  (connectedAddress && (isLoadingBalances || isLoadingCollateral))
      };
    }
    
    // Destructure arrays from tuple responses
    const [vTokens, tokens, symbols, names, decimals] = marketDetails;
    const [prices, supplyRates, borrowRates] = ratesData;
    
    // Process data to create positions
    for (let i = 0; i < vTokens.length; i++) {
      // Get token information
      const symbol = symbols[i];
      const decimal = decimals[i];
      const tokenAddress = tokens[i];
      
      // Skip tokens with no underlying (like vBNB potentially)
      if (tokenAddress === "0x0000000000000000000000000000000000000000") {
        continue;
      }
      
      // Get rates and prices
      const supplyRate = supplyRates[i];
      const borrowRate = borrowRates[i];
      const price = prices[i];
      
      // Convert rates to APY
      const supplyAPY = convertRateToAPY(supplyRate);
      const borrowAPY = convertRateToAPY(borrowRate);
      
      // Convert price from 8 decimals precision
      const tokenPrice = Number(formatUnits(price, 8));
      
      // Create supply position
      let supplyBalance = 0n;
      let supplyUsdBalance = 0;
      
      if (userBalances) {
        const [balances] = userBalances;
        supplyBalance = balances[i];
        const supplyFormatted = Number(formatUnits(supplyBalance, decimal));
        supplyUsdBalance = supplyFormatted * tokenPrice;
      }
      
      supplied.push({
        icon: tokenNameToLogo(symbol),
        name: symbol,
        balance: supplyUsdBalance,
        tokenBalance: supplyBalance,
        currentRate: supplyAPY,
        tokenAddress: tokenAddress,
      });
      
      // Create borrow position
      let borrowBalance = 0n;
      let borrowUsdBalance = 0;
      
      if (userBalances) {
        const [, borrowBalances] = userBalances;
        borrowBalance = borrowBalances[i];
        const borrowFormatted = Number(formatUnits(borrowBalance, decimal));
        borrowUsdBalance = borrowFormatted * tokenPrice;
      }
      
      borrowed.push({
        icon: tokenNameToLogo(symbol),
        name: symbol,
        balance: -borrowUsdBalance, // Negative for borrowed
        tokenBalance: borrowBalance,
        currentRate: borrowAPY,
        tokenAddress: tokenAddress,
      });
    }
    
    return { 
      suppliedPositions: supplied, 
      borrowedPositions: borrowed,
      isLoading: false
    };
  }, [vTokenAddresses, marketDetails, ratesData, userBalances, collateralStatus, connectedAddress, convertRateToAPY]);

  // Get LTV (Loan-to-Value) for Venus
  // In Venus Protocol, this is typically around 50-75% depending on the asset
  // We'll use a fixed value here for simplicity
  const ltv = 75; // 75% LTV
  const maxLtv = 85; // 85% max LTV (liquidation threshold)

  return (
    <ProtocolView
      protocolName="Venus"
      protocolIcon="/logos/venus.svg"
      ltv={ltv}
      maxLtv={maxLtv}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={forceShowAll}
    />
  );
};

export default VenusProtocolView; 