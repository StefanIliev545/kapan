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
import { SupplyPositionProps } from "../../SupplyPosition";
import { VenusMarketEntry } from "./VenusMarketEntry";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Create a Venus supply position type
type VenusSupplyPosition = SupplyPositionProps;

export const VenusProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  
  // Get Comptroller address from VenusGateway
  const { data: comptrollerAddress } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "comptroller",
  });
  
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
  // Following the formula from Venus docs: https://docs-v4.venus.io/guides/protocol-math#calculating-the-apy-using-rate-per-block
  const convertRateToAPY = (ratePerBlock: bigint): number => {
    const ethMantissa = 1e18;
    const blocksPerDay = 60 * 60 * 24;
    const daysPerYear = 365;
    
    // Convert bigint to number for math operations
    const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
    
    // Use compound interest formula: ((ratePerBlock * blocksPerDay) + 1) ^ (daysPerYear - 1) - 1
    const apy = (Math.pow((ratePerBlockNum * blocksPerDay) + 1, daysPerYear - 1) - 1) * 100;
    
    return apy;
  };

  // Special token overrides for specific addresses
  const tokenOverrides: Record<string, { name: string; logo: string }> = {
    "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": { name: "gmWETH/USDC", logo: "/logos/gmweth.svg" },
    "0x47c031236e19d024b42f8AE6780E44A573170703": { name: "gmWBTC/USDC", logo: "/logos/gmbtc.svg" },
  };

  // Helper to get token display name and logo
  const getTokenDisplay = (tokenAddress: string, originalSymbol: string) => {
    const override = tokenOverrides[tokenAddress];
    if (override) {
      return {
        displayName: override.name,
        logo: override.logo
      };
    }
    return {
      displayName: originalSymbol,
      logo: tokenNameToLogo(originalSymbol)
    };
  };

  // Step 1: Get basic token info from getAllVenusMarkets
  const { data: vTokenAddresses, isLoading: isLoadingVTokens } = useScaffoldReadContract({
    contractName: "VenusGateway",
    functionName: "getAllMarkets"
  });

  // Step 2: Get detailed market information including prices from oracles
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
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: VenusSupplyPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    // Check if we have all the required data
    if (!vTokenAddresses || !marketDetails || !ratesData || (connectedAddress && (!userBalances || !collateralStatus))) {
      return {
        suppliedPositions: supplied,
        borrowedPositions: borrowed,
      };
    }
    
    // Destructure arrays from tuple responses
    const [vTokens, tokens, symbols, , decimals, prices] = marketDetails;
    const [, supplyRates, borrowRates] = ratesData;
    
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
      
      // Apply token overrides if needed
      const { displayName, logo } = getTokenDisplay(tokenAddress, symbol);
      
      // Get rates and prices
      const supplyRate = supplyRates[i];
      const borrowRate = borrowRates[i];
      const price = prices[i];
      
      // Convert rates to APY
      const supplyAPY = convertRateToAPY(supplyRate);
      const borrowAPY = convertRateToAPY(borrowRate);
      
      // Convert price from Venus ResilientOracle format
      // According to Venus docs, prices are returned in USD with a consistent scale factor of 1e18
      const tokenPrice = Number(formatUnits(price, 18 + (18 - decimal)));
      
      // Create supply position
      let supplyBalance = 0n;
      let supplyUsdBalance = 0;
      
      if (userBalances) {
        const [balances] = userBalances;
        supplyBalance = balances[i];
        const supplyFormatted = Number(formatUnits(supplyBalance, decimal));
        supplyUsdBalance = supplyFormatted * tokenPrice;
      }
      
      // Convert price to bigint with 8 decimals precision for FiatBalance compatibility
      const priceWith8Decimals = BigInt(Math.round(tokenPrice * 1e8));
      
      supplied.push({
        icon: logo,
        name: displayName,
        balance: supplyUsdBalance,
        tokenBalance: supplyBalance,
        currentRate: supplyAPY,
        tokenAddress: tokenAddress,
        tokenPrice: priceWith8Decimals, // Add the token price with 8 decimals
        tokenDecimals: Number(decimal), // Add the token decimals
        tokenSymbol: symbol, // Use the original symbol for price overrides
        protocolName: "Venus",
        afterInfoContent: comptrollerAddress ? (
          <VenusMarketEntry 
            vTokenAddress={vTokens[i]} 
            comptrollerAddress={comptrollerAddress}
            tokenSymbol={symbol}
          />
        ) : null,
        networkType: "evm",
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
        icon: logo,
        name: displayName,
        balance: -borrowUsdBalance, // Negative for borrowed
        tokenBalance: borrowBalance,
        currentRate: borrowAPY,
        tokenAddress: tokenAddress,
        tokenPrice: priceWith8Decimals, // Add the token price with 8 decimals
        tokenDecimals: Number(decimal), // Add the token decimals
        tokenSymbol: symbol, // Use the original symbol for price overrides
      });
    }
    
    return {
      suppliedPositions: supplied,
      borrowedPositions: borrowed,
    };
  }, [vTokenAddresses, marketDetails, ratesData, userBalances, collateralStatus, connectedAddress, convertRateToAPY, comptrollerAddress, getTokenDisplay]);

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
      suppliedPositions={suppliedPositions as SupplyPositionProps[]}
      borrowedPositions={borrowedPositions}
      forceShowAll={forceShowAll}
      networkType="evm"
    />
  );
};

export default VenusProtocolView; 